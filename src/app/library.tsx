import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useDeferredValue, useMemo, useRef, useState, type ComponentType } from 'react';
import {
  Dimensions,
  FlatList,
  Pressable,
  ScrollView,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInLeft,
  FadeInRight,
  FadeOut,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlbumArt } from '@/components/album-art';
import {
  Book,
  Carousel,
  Disc,
  Grid,
  Heart,
  LibraryIcon,
  Mic,
  Note,
  Person,
  Queue,
  Search,
  type IconProps,
} from '@/components/icons';
import { EmptyState } from '@/components/empty-state';
import { Chip, ChipRow } from '@/components/chip';
import { SectionLabel } from '@/components/section-label';
import { GridSkeleton, RowSkeleton, TrackSkeleton } from '@/components/skeleton';
import { Body, Display, Mono } from '@/components/text';
import { TrackRow } from '@/components/track-row';
import { C, CHROME_HEIGHT, PADDING, R, T, alpha, fmt } from '@/constants/theme';
import { artworkFor } from '@/lib/artwork';
import { useDetail } from '@/lib/detail';
import { useLibrary } from '@/lib/library';
import { chromeScroll } from '@/lib/chrome-scroll';
import { useTabTop } from '@/lib/tab-top';
import { usePlayer } from '@/lib/player';
import { useItemMenu } from '@/components/context-menu';
import { usePlaylistSheet } from '@/components/playlist-sheet';
import { Sheet } from '@/components/sheet';
import { usePlaylists, type Playlist } from '@/lib/playlists';
import { usePrefs, useT, type AlbumView } from '@/lib/prefs';
import type { Key } from '@/lib/i18n';
import { spokenOf, type Spoken } from '@/lib/spoken';
import { useZoomLaunch } from '@/lib/zoom';
import type { Album, Track } from '@/lib/scan';

/**
 * As abas. O rótulo é chave de tradução e o ícone é componente — ver `components/chip.tsx`
 * para por que o ícone não vem pronto.
 */
const TABS = [
  { key: 'albums', label: 'tab.albums', icon: Disc },
  { key: 'artists', label: 'tab.artists', icon: Person },
  { key: 'tracks', label: 'tab.tracks', icon: Note },
  { key: 'playlists', label: 'tab.playlists', icon: Queue },
  { key: 'liked', label: 'tab.liked', icon: Heart },
  { key: 'podcasts', label: 'tab.podcasts', icon: Mic },
  { key: 'audiobooks', label: 'tab.audiobooks', icon: Book },
] as const satisfies { key: string; label: Key; icon: ComponentType<IconProps> }[];

type TabKey = (typeof TABS)[number]['key'];

/**
 * As abas em que filtrar por gênero quer dizer algo.
 *
 * Lista não tem gênero — ela é do usuário, não da tag. Podcast e audiolivro têm, mas o
 * gênero deles *é* o que os classificou: filtrar "Podcast" dentro de Podcasts não separa
 * nada.
 */
const GENRE_TABS: readonly TabKey[] = ['albums', 'artists', 'tracks', 'liked'];

/** As duas abas de palavra falada: o que classifica cada uma, e como ela conta os itens. */
const SPOKEN_TABS = {
  podcasts: { kind: 'podcast', section: 'lib.shows', count: 'count.episodes' },
  audiobooks: { kind: 'audiobook', section: 'lib.books', count: 'count.chapters' },
} as const satisfies Record<string, { kind: Spoken; section: Key; count: Key }>;

const NO_TRACKS: Track[] = [];
const NO_ALBUMS: Album[] = [];

const GAP = 14;


export default function LibraryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { library, artists, trackById, albumById } = useLibrary();
  const { accent, albumView, setAlbumView, liked, likedAlbums, spoken } = usePrefs();
  const t = useT();

  /*
    Tocar em Biblioteca já estando nela devolve a lista ao topo — ver `lib/tab-top.ts`.

    O `useCallback` importa: o registro guarda a função, e uma nova identidade a cada
    render faria o efeito reassinar em toda rolagem.
  */
  const list = useRef<FlatList<Row>>(null);
  useTabTop(
    'Library',
    useCallback(() => list.current?.scrollToOffset({ offset: 0, animated: true }), [])
  );
  const { play, enqueueLast } = usePlayer();
  const { playlists } = usePlaylists();
  const { open, sheet } = usePlaylistSheet();
  // O toque longo abre o menu; o arraste continua indo direto para a folha de listas.
  const { open: openMenu, menu } = useItemMenu();
  const [naming, setNaming] = useState(false);
  const { tab: raw } = useLocalSearchParams<{ tab?: string }>();

  const tab: TabKey = TABS.some((t) => t.key === raw) ? (raw as TabKey) : 'albums';

  /*
    A aba troca na hora; as linhas chegam depois.

    Não há leitura de disco nenhuma aqui — a biblioteca já está em memória desde o boot.
    O que travava era o *mount* das linhas: montar uma dezena de TrackRow, cada uma com um
    GestureDetector nativo e shared values próprios, no mesmo commit que move o traço de
    acento. Medido: 370 ms entre o toque e o traço começar a andar.

    `useDeferredValue` separa os dois. O commit urgente move a faixa de abas e põe o
    loader; o commit de baixa prioridade monta as linhas. O toque responde num quadro, e o
    custo continua existindo — só saiu da frente do usuário.
  */
  const shown: TabKey = useDeferredValue(tab);
  const settling = shown !== tab;

  // A lista nova entra do lado para onde a aba andou; a velha sai para o outro.
  // Decidido no toque, não no render: a direção é da interação, e a aba chega pela URL
  // sem dizer de onde veio.
  const index = TABS.findIndex((t) => t.key === tab);
  const [forward, setForward] = useState(true);
  const pickTab = (key: TabKey) => {
    setForward(TABS.findIndex((t) => t.key === key) >= index);
    router.setParams({ tab: key });
  };
  const width = Dimensions.get('window').width;
  const cell = (width - PADDING * 2 - GAP) / 2;

  const all = library?.tracks ?? NO_TRACKS;
  const everyAlbum = library?.albums ?? NO_ALBUMS;

  /*
    Palavra falada sai das abas de música.

    Um episódio de duas horas entre as canções desarruma tudo: ele encabeça "faixas mais
    longas", vira um álbum de uma faixa na grade e o artista dele é o nome do programa. As
    duas abas próprias existem justamente para isso — ver `lib/spoken.ts`.
  */
  const kindOf = useMemo(() => {
    const map = new Map<string, Spoken | null>();
    for (const t of all) map.set(t.id, spokenOf(t, spoken));
    return map;
  }, [all, spoken]);

  const tracks = useMemo(() => all.filter((t) => !kindOf.get(t.id)), [all, kindOf]);
  const albums = useMemo(
    () => everyAlbum.filter((a) => a.trackIds.some((id) => kindOf.get(id) === null)),
    [everyAlbum, kindOf]
  );

  const totalSeconds = useMemo(
    () => tracks.reduce((n, t) => n + (t.duration ?? 0), 0),
    [tracks]
  );

  /**
   * Os gêneros da biblioteca, do mais numeroso para o menos.
   *
   * Da tag, que é o que a varredura já traz — sem rede e sem catálogo. Gênero de uma
   * faixa só não vira chip: um chip que filtra para uma faixa é ruído na fileira.
   */
  const genres = useMemo(() => {
    const count = new Map<string, number>();
    for (const t of tracks) {
      const g = t.genre?.trim();
      if (g) count.set(g, (count.get(g) ?? 0) + 1);
    }
    return [...count.entries()]
      .filter(([, n]) => n > 1)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, n]) => ({ name, count: n }));
  }, [tracks]);

  const [genre, setGenre] = useState<string | null>(null);
  // Uma varredura nova pode não ter mais o gênero escolhido: o filtro não pode sobreviver
  // ao que ele filtra, senão a aba fica permanentemente vazia sem dizer por quê.
  const picked = genre && genres.some((g) => g.name === genre) ? genre : null;

  /** O recorte do gênero, como conjunto de ids: álbuns e artistas se filtram por ele. */
  const ofGenre = useMemo(
    () => (picked ? new Set(tracks.filter((t) => t.genre?.trim() === picked).map((t) => t.id)) : null),
    [tracks, picked]
  );
  const genreTracks = useMemo(
    () => (ofGenre ? tracks.filter((t) => ofGenre.has(t.id)) : tracks),
    [tracks, ofGenre]
  );
  const genreAlbums = useMemo(
    () => (ofGenre ? albums.filter((a) => a.trackIds.some((id) => ofGenre.has(id))) : albums),
    [albums, ofGenre]
  );
  /**
   * Os artistas visíveis.
   *
   * O recorte é o do gênero quando há um, e o de "é música" quando não há. O nome que um
   * podcast escreve no campo de artista é o do programa: sem este filtro ele aparecia na
   * aba Artistas com um álbum de um episódio, ao lado das bandas.
   */
  const musicIds = useMemo(() => new Set(tracks.map((t) => t.id)), [tracks]);
  const genreArtists = useMemo(() => {
    const visible = ofGenre ?? musicIds;
    return artists.filter((a) => a.albums.some((al) => al.trackIds.some((id) => visible.has(id))));
  }, [artists, ofGenre, musicIds]);

  /**
   * Os programas e os livros: um por álbum, com os episódios em ordem.
   *
   * Agrupar por álbum é o que o arquivo já dá — um programa de podcast escreve o nome do
   * programa no campo de álbum, e um audiolivro escreve o título do livro. Por isso a
   * marca manual também é por álbum: ela marca o programa inteiro de uma vez.
   */
  const shows = useMemo(() => {
    const byAlbum = new Map<string, { kind: Spoken; episodes: Track[] }>();
    for (const t of all) {
      const kind = kindOf.get(t.id);
      if (!kind) continue;
      const entry = byAlbum.get(t.albumId);
      if (entry) entry.episodes.push(t);
      else byAlbum.set(t.albumId, { kind, episodes: [t] });
    }
    return [...byAlbum.entries()]
      .map(([albumId, entry]) => ({ album: albumById(albumId), ...entry }))
      .filter((show) => !!show.album)
      .sort((a, b) => a.album!.title.localeCompare(b.album!.title));
  }, [all, kindOf, albumById]);

  /*
    Curtir é um append, então a lista salva está em ordem de quando foi curtido — do mais
    antigo para o mais novo. Invertida aqui: o que acabou de ganhar o coração é o que a
    aba tem de mostrar primeiro. O `filter` é o que descarta o que uma nova varredura não
    encontrou mais, do mesmo jeito que a tela de lista faz.
  */
  const likedTracks = useMemo(
    () =>
      [...liked]
        .reverse()
        .map(trackById)
        .filter((t) => !!t)
        // O mesmo recorte das outras abas: sem falado, e dentro do gênero escolhido. Um
        // episódio curtido aparece na aba dele, com o resto do programa.
        .filter((t) => !kindOf.get(t.id) && (!ofGenre || ofGenre.has(t.id))),
    [liked, trackById, kindOf, ofGenre]
  );
  const favoriteAlbums = useMemo(
    () =>
      [...likedAlbums]
        .reverse()
        .map(albumById)
        .filter((a) => !!a)
        .filter((a) => !ofGenre || a.trackIds.some((id) => ofGenre.has(id))),
    [likedAlbums, albumById, ofGenre]
  );

  /** Quantos programas ou livros há: o rótulo das duas abas de falado usa isto. */
  const spokenCount = (kind: Spoken) => shows.filter((show) => show.kind === kind).length;

  const header = (
    <View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 12,
        }}>
        <View style={{ flex: 1 }}>
          <Display size={33} tracking={-0.035}>
            {t('lib.title')}
          </Display>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 7 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.ok }} />
            <Body size={12.5} color={T.t42}>
              {t('lib.stats', {
                tracks: tracks.length,
                albums: albums.length,
                hours: Math.round(totalSeconds / 3600),
              })}
            </Body>
          </View>
        </View>
        <Pressable
          onPress={() => router.push('/search')}
          hitSlop={8}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: T.t12,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Search />
        </Pressable>
      </View>

      <Tabs current={tab} onPick={pickTab} />

      {/*
        Os gêneros logo abaixo das abas, e não numa tela própria.

        Eles preenchem o vão que a fileira de abas deixava e filtram a aba que está
        aberta: as mesmas capas, os mesmos artistas, só o recorte muda. Segue `tab`, e não
        `shown` — a fileira é urgente como as abas, o conteúdo é que pode chegar depois.
      */}
      {GENRE_TABS.includes(tab) && genres.length > 0 && (
        <ChipRow style={{ marginTop: 10 }}>
          <Chip label={t('lib.allGenres')} on={!picked} accent={accent} onPress={() => setGenre(null)} />
          {genres.map((g) => (
            <Chip
              key={g.name}
              label={`${g.name} · ${g.count}`}
              on={picked === g.name}
              accent={accent}
              onPress={() => setGenre(g.name)}
            />
          ))}
        </ChipRow>
      )}

      {/*
        Daqui para baixo é conteúdo, e é só isto que se move na troca de aba. O título e
        as abas ficam de fora: o traço de acento corre até a aba nova e nada mais sai do
        lugar.

        A `key` é a aba porque o cabeçalho não remonta mais — a lista virou uma só. Sem
        ela este bloco ficaria montado para sempre e a entrada nunca correria de novo.

        Segue `shown`, e não `tab`: as tiras de capa e os rótulos chegam junto com as
        linhas, no commit de baixa prioridade. Só a faixa de abas é urgente.
      */}
      <Animated.View key={shown} entering={(forward ? FadeInRight : FadeInLeft).duration(240)}>
      {shown === 'albums' && albums.length > 0 && (
        <AlbumStrip
          title={t('lib.recent')}
          albums={albums.slice(0, 8)}
          badge="NOVO"
          onHold={(album) => openMenu({ kind: 'album', album })}
        />
      )}

      {shown === 'albums' && (
        <SectionLabel
          title={t('lib.allAlbums')}
          trailing={`${albums.length}`}
          action={<ViewToggle value={albumView} onPick={setAlbumView} accent={accent} />}
        />
      )}

      {shown === 'liked' && favoriteAlbums.length > 0 && (
        <AlbumStrip
          title={t('lib.likedAlbums')}
          albums={favoriteAlbums}
          onHold={(album) => openMenu({ kind: 'album', album })}
        />
      )}

      {shown === 'liked' && likedTracks.length > 0 && (
        <SectionLabel title={t('lib.likedTracks')} trailing={`${likedTracks.length}`} />
      )}

      {(shown === 'podcasts' || shown === 'audiobooks') && spokenCount(SPOKEN_TABS[shown].kind) > 0 && (
        <SectionLabel
          title={t(SPOKEN_TABS[shown].section)}
          trailing={`${spokenCount(SPOKEN_TABS[shown].kind)}`}
        />
      )}

      {shown === 'playlists' && (
        <Pressable
          onPress={() => setNaming(true)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            marginTop: 22,
            paddingVertical: 13,
            paddingHorizontal: 15,
            borderRadius: R.r15,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: alpha(accent, 0.4),
          }}>
          <Body size={18} color={accent}>
            +
          </Body>
          <Body size={13.5} weight={500} color={T.t72} style={{ flex: 1 }}>
            {t('lib.newPlaylist')}
          </Body>
        </Pressable>
      )}
      </Animated.View>
    </View>
  );

  const bottom = CHROME_HEIGHT + insets.bottom;

  /**
   * Só as primeiras linhas animam. As de baixo montam por virtualização enquanto se
   * rola, e animá-las faria a lista piscar a cada rolagem.
   */
  const enter = (i: number) =>
    i < 8 ? (forward ? FadeInRight : FadeInLeft).duration(240).delay(i * 22) : undefined;

  const carousel = shown === 'albums' && albumView === 'carousel';

  /** As faixas que uma linha de faixa toca: a aba diz qual das duas listas é. */
  const listTracks = shown === 'liked' ? likedTracks : genreTracks;

  /*
    Uma FlatList só, para as cinco abas.

    Antes era uma por aba, cada uma com a sua `key` — o que a grade de álbuns exigia para
    ter `numColumns={2}`. Trocar de aba trocava a `key`, o React remontava a lista inteira
    e com ela o cabeçalho, onde as abas moram: era isso que fazia o traço de acento nascer
    de novo do zero a cada troca. Aqui a grade é uma lista de linhas de dois álbuns, então
    `numColumns` nunca muda, a `key` nunca muda, e nada remonta.
  */
  const rows = useMemo<Row[]>(() => {
    if (shown === 'albums') {
      // No carrossel a lista fica vazia de propósito: as capas vão no cabeçalho.
      if (albumView === 'carousel') return NO_ROWS;
      const pairs: Row[] = [];
      for (let i = 0; i < genreAlbums.length; i += 2) {
        pairs.push({
          kind: 'albums',
          id: genreAlbums[i].id,
          albums: genreAlbums.slice(i, i + 2),
        });
      }
      return pairs;
    }
    if (shown === 'artists') {
      return genreArtists.map((artist) => ({ kind: 'artist', id: artist.name, artist }));
    }
    if (shown === 'playlists') {
      return playlists.map((playlist) => ({ kind: 'playlist', id: playlist.id, playlist }));
    }
    if (shown === 'podcasts' || shown === 'audiobooks') {
      const want = SPOKEN_TABS[shown].kind;
      return shows
        .filter((show) => show.kind === want)
        .map((show) => ({
          kind: 'show' as const,
          id: show.album!.id,
          album: show.album!,
          episodes: show.episodes,
        }));
    }
    return listTracks.map((track) => ({ kind: 'track', id: track.id, track }));
  }, [shown, albumView, genreAlbums, genreArtists, playlists, shows, listTracks]);

  const empty = <Empty tab={shown} hasFavoriteAlbums={favoriteAlbums.length > 0} />;

  return (
    <>
      <FlatList
        ref={list}
        {...chromeScroll}
        /*
          Segue `shown`, que é diferido — então a lista **não** muda no commit do toque.

          Ela era esvaziada enquanto assentava, para o esqueleto aparecer. Esvaziar
          desmonta tudo o que está montado, e isso caía justamente no commit urgente: sair
          da aba de Faixas custava dezenas de `TrackRow` com gesto nativo, e o toque na
          aba nova esperava por elas. Agora as linhas velhas ficam onde estão até as novas
          estarem prontas, e a troca inteira — desmontar e montar — acontece no commit de
          baixa prioridade.

          O esqueleto continua no `ListEmptyComponent`, e agora aparece quando a lista
          está de fato vazia: entrando numa aba a partir de uma vazia, ou na primeira
          montagem da tela.
        */
        data={rows}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={
          <>
            {header}
            {carousel &&
              (albums.length > 0 ? (
                <Animated.View
                  entering={FadeIn.duration(260)}
                  exiting={FadeOut.duration(160)}
                  style={{ marginHorizontal: -PADDING }}>
                  <AlbumCarousel
                    albums={albums}
                    onHold={(album) => openMenu({ kind: 'album', album })}
                  />
                </Animated.View>
              ) : (
                empty
              ))}
          </>
        }
        // No carrossel o vazio de verdade já está no cabeçalho.
        ListEmptyComponent={
          settling ? <Settling tab={tab} cell={cell} /> : carousel ? null : empty
        }
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingBottom: bottom,
          paddingHorizontal: PADDING,
          // Só a grade precisa de respiro entre as linhas; as listas já têm o seu dentro.
          gap: shown === 'albums' ? 16 : 0,
        }}
        renderItem={({ item, index }) => (
          <Animated.View entering={enter(index)}>
            {item.kind === 'albums' ? (
              <View style={{ flexDirection: 'row', gap: GAP }}>
                {item.albums.map((album) => (
                  <AlbumCell
                    key={album.id}
                    album={album}
                    size={cell}
                    count={album.trackIds.length}
                    onLongPress={() => openMenu({ kind: 'album', album })}
                  />
                ))}
              </View>
            ) : item.kind === 'artist' ? (
              <ArtistRow
                artist={item.artist}
                onLongPress={() =>
                  openMenu({ kind: 'artist', name: item.artist.name, albums: item.artist.albums })
                }
              />
            ) : item.kind === 'show' ? (
              <ShowRow
                album={item.album}
                episodes={item.episodes}
                count={SPOKEN_TABS[shown === 'audiobooks' ? 'audiobooks' : 'podcasts'].count}
                onHold={() => openMenu({ kind: 'album', album: item.album })}
              />
            ) : item.kind === 'playlist' ? (
              <GroupRow
                title={item.playlist.name}
                subtitle={t('count.tracks', { n: item.playlist.trackIds.length })}
                art={artworkFor(item.playlist.name, 'lista')}
                cover={item.playlist.cover ?? null}
                onPress={() => router.push(`/playlist/${item.playlist.id}`)}
                onLongPress={() => openMenu({ kind: 'playlist', playlist: item.playlist })}
              />
            ) : (
              <TrackRow
                track={item.track}
                position={index + 1}
                accent={accent}
                onPress={() => play(listTracks, index)}
                onLongPress={() => openMenu({ kind: 'track', track: item.track })}
                onQueue={() => enqueueLast([item.track])}
                onPlaylist={() => open([item.track.id])}
              />
            )}
          </Animated.View>
        )}
      />
      {sheet}
      {menu}
      <NewPlaylist visible={naming} onClose={() => setNaming(false)} />
    </>
  );
}

/**
 * O lugar da lista enquanto as linhas montam.
 *
 * A silhueta é da aba que está *chegando* (`tab`), e não da que está na tela (`shown`):
 * durante o assentamento as duas discordam, e é o destino que vai ocupar o espaço.
 *
 * Era um `ActivityIndicator` centrado. O giro não dizia nada sobre o que vinha, e o
 * conteúdo pulava quando chegava — a silhueta já está na forma e na altura das linhas.
 *
 * A grade serve as duas visualizações de álbum. No carrossel as capas moram no cabeçalho
 * e esta silhueta sai de cena no mesmo commit em que elas entram, então não chegam a se
 * ver juntas.
 */
function Settling({ tab, cell }: { tab: TabKey; cell: number }) {
  if (tab === 'albums') return <GridSkeleton rows={3} cell={cell} gap={GAP} />;
  if (tab === 'artists') return <RowSkeleton rows={7} round />;
  if (tab === 'playlists') return <RowSkeleton rows={5} />;
  // Programa e livro são linhas com miniatura, como as listas.
  if (tab === 'podcasts' || tab === 'audiobooks') return <RowSkeleton rows={5} />;
  // Faixas e favoritas são as duas listas de faixa.
  return <TrackSkeleton rows={8} />;
}

/** Uma linha da lista. A aba escolhe qual das quatro formas ela tem. */
type Row =
  | { kind: 'albums'; id: string; albums: Album[] }
  | { kind: 'artist'; id: string; artist: ReturnType<typeof useLibrary>['artists'][number] }
  | { kind: 'playlist'; id: string; playlist: Playlist }
  /** Um programa de podcast ou um livro: o álbum, com os episódios dele. */
  | { kind: 'show'; id: string; album: Album; episodes: Track[] }
  | { kind: 'track'; id: string; track: Track };

const NO_ROWS: Row[] = [];

/** O vazio de cada aba. */
/**
 * Um programa de podcast ou um livro na lista.
 *
 * O selo de "continuar" é o motivo de a aba existir separada: ele diz que há um episódio
 * no meio e onde ele parou. Sem escuta começada a linha vai limpa, como a de uma lista.
 */
function ShowRow({
  album,
  episodes,
  count,
  onHold,
}: {
  album: Album;
  episodes: Track[];
  /** A chave que conta os itens: episódios num programa, capítulos num livro. */
  count: Key;
  onHold: () => void;
}) {
  const { openAlbum } = useDetail();
  const { progressOf } = usePrefs();
  const t = useT();
  const started = episodes.find((e) => progressOf(e.id) > 0);

  return (
    <GroupRow
      title={album.title}
      subtitle={t(count, { n: episodes.length })}
      mono={
        started
          ? `${t('album.resumeAt', { time: fmt(progressOf(started.id)) }).toUpperCase()} · ${started.title}`
          : undefined
      }
      art={artworkFor(album.artist, album.title)}
      cover={album.cover}
      // A capa do programa voa para a tela dele, como a da grade e a do artista.
      zoom
      onPress={() => openAlbum(album.id)}
      onLongPress={onHold}
    />
  );
}

/**
 * O vazio de cada aba.
 *
 * Componente, e não função que devolve JSX: o texto vem de `useT`, e hook não roda fora de
 * componente. O par de chaves é sempre `empty.<aba>` e `empty.<aba>.body`.
 */
function Empty({ tab, hasFavoriteAlbums }: { tab: TabKey; hasFavoriteAlbums: boolean }) {
  const t = useT();

  // Álbum curtido sem faixa curtida não é uma aba vazia: as capas já estão no cabeçalho.
  if (tab === 'liked' && hasFavoriteAlbums) return null;

  const key = tab === 'tracks' ? 'tracks' : tab;
  const icon =
    tab === 'liked' ? <Heart size={30} color={T.full} filled /> : <LibraryIcon size={30} color={T.full} />;

  return (
    <EmptyState icon={icon} title={t(`empty.${key}` as Key)}>
      {t(`empty.${key}.body` as Key)}
    </EmptyState>
  );
}

/** Criação direta de lista, sem precisar de uma faixa para começar. */
function NewPlaylist({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { accent } = usePrefs();
  const t = useT();
  const { create } = usePlaylists();
  const [name, setName] = useState('');

  const confirm = () => {
    if (!name.trim()) return;
    create(name);
    setName('');
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t('lib.newPlaylist')}>
      <TextInput
        value={name}
        onChangeText={setName}
        autoFocus
        placeholder={t('lib.playlistName')}
        placeholderTextColor={T.t34}
        selectionColor={accent}
        returnKeyType="done"
        onSubmitEditing={confirm}
        style={{
          marginTop: 14,
          height: 48,
          paddingHorizontal: 14,
          borderRadius: R.r15,
          backgroundColor: C.card,
          borderWidth: 1,
          borderColor: name.trim() ? alpha(accent, 0.5) : T.t07,
          color: T.full,
          fontFamily: 'FamiljenGrotesk_500Medium',
          fontSize: 15,
        }}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 18, marginTop: 16 }}>
        <Pressable onPress={onClose} hitSlop={8} style={{ paddingVertical: 8 }}>
          <Body size={13.5} weight={600} color={T.t5}>
            {t('common.cancel')}
          </Body>
        </Pressable>
        <Pressable
          onPress={confirm}
          disabled={!name.trim()}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 18,
            borderRadius: R.r13,
            backgroundColor: name.trim() ? accent : T.t06,
          }}>
          <Body size={13.5} weight={600} color={name.trim() ? C.onAccent : T.t24}>
            {t('common.create')}
          </Body>
        </Pressable>
      </View>
    </Sheet>
  );
}

/**
 * As abas, em chips que rolam.
 *
 * Era um segmented control de cinco fatias iguais com um traço de acento correndo
 * embaixo. Duas coisas o mataram: sete abas não cabem em fatias iguais — "Audiolivros"
 * não caberia em um sétimo da tela — e a caixa com o traço somava 62 px de vão até o
 * conteúdo, o que fazia a fileira ler como um bloco solto em cima da tela em vez de um
 * controle do conteúdo.
 *
 * Os chips levam a largura do próprio rótulo, rolam quando passam da tela, e a aba ativa
 * é a única pintada no acento — não precisa de traço para dizer onde está.
 */
function Tabs({ current, onPick }: { current: TabKey; onPick: (k: TabKey) => void }) {
  const { accent } = usePrefs();
  const t = useT();

  return (
    <ChipRow style={{ marginTop: 18 }}>
      {TABS.map((tab) => (
        <Chip
          key={tab.key}
          label={t(tab.label)}
          icon={tab.icon}
          on={tab.key === current}
          accent={accent}
          onPress={() => onPick(tab.key)}
        />
      ))}
    </ChipRow>
  );
}

/** Fileira horizontal de capas. Serve os recém-encontrados e os álbuns curtidos. */
function AlbumStrip({
  title,
  albums,
  badge,
  onHold,
}: {
  title: string;
  albums: Album[];
  /** Selo no canto da capa. Sem ele a capa vai limpa. */
  badge?: string;
  /** Toque longo numa capa. Igual ao da grade: segurar um álbum abre as ações dele. */
  onHold?: (album: Album) => void;
}) {
  /*
    Sem margem própria: o `SectionLabel` aqui dentro já traz os 26 dele.

    Somadas, as duas davam 50 px entre a fileira de abas e a primeira capa — o vão que
    fazia o seletor parecer solto no alto da tela.
  */
  return (
    <View>
      <SectionLabel title={title} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -PADDING }}
        contentContainerStyle={{ gap: 12, paddingHorizontal: PADDING }}>
        {albums.map((album) => (
          <StripCell
            key={album.id}
            album={album}
            badge={badge}
            onLongPress={onHold && (() => onHold(album))}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function StripCell({
  album,
  badge,
  onLongPress,
}: {
  album: Album;
  badge?: string;
  onLongPress?: () => void;
}) {
  const { openAlbum } = useDetail();
  const art = artworkFor(album.artist, album.title);
  const { ref, launch, style: originStyle } = useZoomLaunch(R.r15);

  return (
    <Pressable
      onPress={() => launch(() => openAlbum(album.id))}
      onLongPress={onLongPress}
      delayLongPress={280}
      style={{ width: 112 }}>
      <View ref={ref} collapsable={false} style={originStyle}>
        <AlbumArt art={art} size={112} radius={R.r15} detail="ring" cover={album.cover} />
        {badge ? (
          <View
            style={{
              position: 'absolute',
              top: 7,
              right: 7,
              paddingHorizontal: 6,
              paddingVertical: 3,
              borderRadius: 6,
              backgroundColor: 'rgba(10,9,8,.62)',
            }}>
            <Mono size={8.5} weight={500} tracking={0.08} color={T.full}>
              {badge}
            </Mono>
          </View>
        ) : null}
      </View>
      <Body size={12.5} weight={600} numberOfLines={1} style={{ marginTop: 8 }}>
        {album.title}
      </Body>
      <Body size={11} color={T.t42} numberOfLines={1}>
        {album.artist}
      </Body>
    </Pressable>
  );
}

function AlbumCell({
  album,
  size,
  count,
  onLongPress,
}: {
  album: Album;
  size: number;
  count: number;
  onLongPress?: () => void;
}) {
  const { openAlbum } = useDetail();
  const art = artworkFor(album.artist, album.title);
  // A capa é o retângulo de onde a tela do álbum cresce.
  const { ref, launch, style: originStyle } = useZoomLaunch(R.r17);

  return (
    <Pressable
      onPress={() => launch(() => openAlbum(album.id))}
      onLongPress={onLongPress}
      delayLongPress={280}
      style={{ width: size }}>
      <View ref={ref} collapsable={false} style={originStyle}>
        <AlbumArt art={art} size={size} radius={R.r17} cover={album.cover} scrim />
      </View>
      <Body size={13.5} weight={600} tracking={-0.01} numberOfLines={1} style={{ marginTop: 9 }}>
        {album.title}
      </Body>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
        <Body size={11.5} color="rgba(246,241,234,.44)" numberOfLines={1} style={{ flexShrink: 1 }}>
          {album.artist}
        </Body>
        <Body size={11.5} color={T.t24}>
          ·
        </Body>
        <Body size={11.5} color={T.t3}>
          {count}
        </Body>
      </View>
    </Pressable>
  );
}

/** Linha de artista: a capa redonda é a origem do zoom para a tela dele. */
function ArtistRow({
  artist,
  onLongPress,
}: {
  artist: ReturnType<typeof useLibrary>['artists'][number];
  onLongPress?: () => void;
}) {
  const { openArtist } = useDetail();
  const { ref, launch, style: originStyle } = useZoomLaunch(26);
  const cover = artist.albums.find((a) => a.cover)?.cover ?? null;

  return (
    <Pressable
      onPress={() =>
        launch(() => openArtist(artist.name))
      }
      onLongPress={onLongPress}
      delayLongPress={280}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 10 }}>
      <View ref={ref} collapsable={false} style={originStyle}>
        <AlbumArt
          art={artworkFor(artist.name, artist.albums[0]?.title ?? '')}
          size={52}
          radius={26}
          detail="ring"
          cover={cover}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Body size={14.5} weight={600} tracking={-0.01} numberOfLines={1}>
          {artist.name}
        </Body>
        <Body size={11.5} color={T.t42} style={{ marginTop: 2 }}>
          {artist.albums.length} {artist.albums.length === 1 ? 'álbum' : 'álbuns'}
        </Body>
      </View>
    </Pressable>
  );
}

/** Seletor de visualização da aba de álbuns. A escolha fica salva nas preferências. */
function ViewToggle({
  value,
  onPick,
  accent,
}: {
  value: AlbumView;
  onPick: (v: AlbumView) => void;
  accent: string;
}) {
  const slot = (on: boolean) => ({
    width: 30,
    height: 24,
    borderRadius: 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: on ? alpha(accent, 0.2) : 'transparent',
  });

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 2,
        padding: 3,
        borderRadius: R.r13,
        backgroundColor: C.card,
      }}>
      <Pressable onPress={() => onPick('grid')} hitSlop={4} style={slot(value === 'grid')}>
        <Grid size={13} color={value === 'grid' ? T.full : T.t34} />
      </Pressable>
      <Pressable onPress={() => onPick('carousel')} hitSlop={4} style={slot(value === 'carousel')}>
        <Carousel size={13} color={value === 'carousel' ? T.full : T.t34} />
      </Pressable>
    </View>
  );
}

/**
 * Carrossel de capas, no espírito da Apple TV: uma capa grande no centro, as vizinhas
 * recuadas e giradas, e o dedo passando de uma em uma.
 *
 * A rolagem dirige tudo por um shared value — o giro e a escala de cada capa saem de um
 * worklet, sem passar pelo React a cada quadro.
 */
function AlbumCarousel({
  albums,
  onHold,
}: {
  albums: Album[];
  onHold?: (album: Album) => void;
}) {
  const { width } = useWindowDimensions();
  const size = Math.round(width * 0.66);
  const step = size + CAROUSEL_GAP;

  const x = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    x.value = e.contentOffset.x;
  });

  return (
    <Animated.ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={step}
      disableIntervalMomentum
      decelerationRate="fast"
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={{
        paddingHorizontal: (width - size) / 2,
        gap: CAROUSEL_GAP,
        paddingTop: 8,
        paddingBottom: 12,
      }}>
      {albums.map((album, index) => (
        <CarouselCard
          key={album.id}
          album={album}
          index={index}
          size={size}
          step={step}
          x={x}
          onLongPress={onHold && (() => onHold(album))}
        />
      ))}
    </Animated.ScrollView>
  );
}

const CAROUSEL_GAP = 18;

function CarouselCard({
  album,
  index,
  size,
  step,
  x,
  onLongPress,
}: {
  album: Album;
  index: number;
  size: number;
  step: number;
  x: SharedValue<number>;
  onLongPress?: () => void;
}) {
  const { openAlbum } = useDetail();
  // A moldura é a origem do zoom, igual à da grade — abrir daqui cresce do mesmo jeito.
  const { ref, launch, style: originStyle } = useZoomLaunch(R.r21);

  // A arte é maior que a moldura; a sobra é o curso que ela tem para deslizar dentro.
  const inner = Math.round(size * OVERSCAN);
  const drift = (inner - size) / 2;

  /** Distância do centro, em cartões: 0 é a capa que está na frente. */
  const away = (offset: number) => {
    'worklet';
    return (offset - index * step) / step;
  };

  const card = useAnimatedStyle(() => ({
    opacity: interpolate(away(x.value), [-1.6, 0, 1.6], [0.45, 1, 0.45], 'clamp'),
    transform: [{ scale: interpolate(away(x.value), [-1, 0, 1], [0.9, 1, 0.9], 'clamp') }],
  }));

  /**
   * O parallax do carrossel da Apple: a arte anda mais devagar que a moldura, sem parar
   * entre uma capa e outra. Vem do deslocamento cru da rolagem, então é contínuo — não
   * um estado por cartão que troca no snap.
   */
  const pan = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(away(x.value), [-2, 2], [-drift, drift], 'clamp') }],
  }));

  return (
    <Animated.View style={[{ width: size }, card]}>
      <Pressable
        onPress={() => launch(() => openAlbum(album.id))}
        onLongPress={onLongPress}
        delayLongPress={280}>
        <View
          ref={ref}
          collapsable={false}
          style={[
            { width: size, height: size, borderRadius: R.r21, overflow: 'hidden' },
            originStyle,
          ]}>
          <Animated.View style={[{ marginLeft: -drift, marginTop: -drift }, pan]}>
            <AlbumArt
              art={artworkFor(album.artist, album.title)}
              size={inner}
              radius={0}
              cover={album.cover}
            />
          </Animated.View>
        </View>
        <Display size={19} tracking={-0.03} numberOfLines={1} style={{ marginTop: 14 }}>
          {album.title}
        </Display>
        <Body size={12.5} color={T.t42} numberOfLines={1} style={{ marginTop: 3 }}>
          {album.artist} · {album.trackIds.length} faixas
        </Body>
      </Pressable>
    </Animated.View>
  );
}

/** Quanto a arte passa da moldura. A diferença é o curso do parallax. */
const OVERSCAN = 1.3;

function GroupRow({
  title,
  subtitle,
  mono,
  art,
  cover,
  round = false,
  zoom = false,
  onPress,
  onLongPress,
}: {
  title: string;
  subtitle: string;
  mono?: string;
  art: ReturnType<typeof artworkFor>;
  /** Capa real, quando o álbum tem uma embutida. */
  cover?: string | null;
  /** Artista aparece em círculo; álbum e pasta, em quadrado. */
  round?: boolean;
  /**
   * A miniatura é a origem do voo de zoom.
   *
   * Vale para quem abre uma camada — programa de podcast e livro abrem a tela de álbum.
   * A linha de lista abre uma rota de verdade (`/playlist/...`), que não tem para onde
   * voar, e por isso o padrão é desligado.
   */
  zoom?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const radius = round ? 26 : 14;
  /*
    O hook é chamado sempre, mesmo com `zoom` desligado — é um ref e um booleano, e
    condicionar chamada de hook não existe. Quem não voa simplesmente não usa o `launch`.
  */
  const { ref, launch, style: originStyle } = useZoomLaunch(radius);

  return (
    <Pressable
      onPress={zoom ? () => launch(onPress) : onPress}
      onLongPress={onLongPress}
      delayLongPress={280}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 13,
        paddingVertical: 10,
      }}>
      {/* `collapsable={false}` para o Android não fundir esta View com a de cima: sem um
          nó nativo próprio não há o que medir, e o voo sai sem origem. */}
      <View ref={ref} collapsable={false} style={originStyle}>
        <AlbumArt art={art} size={52} radius={radius} detail="ring" cover={cover} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Body size={14.5} weight={600} tracking={-0.01} numberOfLines={1}>
          {title}
        </Body>
        {mono ? (
          <Mono size={10.5} color="rgba(246,241,234,.38)" numberOfLines={1} style={{ marginTop: 2 }}>
            {mono}
          </Mono>
        ) : null}
        <Body size={11.5} color={T.t42} style={{ marginTop: 2 }}>
          {subtitle}
        </Body>
      </View>
    </Pressable>
  );
}
