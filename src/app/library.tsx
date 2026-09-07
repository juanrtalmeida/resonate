import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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
  makeMutable,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlbumArt } from '@/components/album-art';
import { Carousel, Grid, Heart, LibraryIcon, Search } from '@/components/icons';
import { EmptyState } from '@/components/empty-state';
import { SectionLabel } from '@/components/section-label';
import { Body, Display, Mono } from '@/components/text';
import { TrackRow } from '@/components/track-row';
import { C, CHROME_HEIGHT, PADDING, R, T, alpha } from '@/constants/theme';
import { artworkFor } from '@/lib/artwork';
import { useLibrary } from '@/lib/library';
import { chromeScroll } from '@/lib/chrome-scroll';
import { usePlayer } from '@/lib/player';
import { useItemMenu } from '@/components/context-menu';
import { usePlaylistSheet } from '@/components/playlist-sheet';
import { Sheet } from '@/components/sheet';
import { usePlaylists, type Playlist } from '@/lib/playlists';
import { usePrefs, type AlbumView } from '@/lib/prefs';
import { useZoomLaunch } from '@/lib/zoom';
import type { Album, Track } from '@/lib/scan';

const TABS = [
  { key: 'albums', label: 'Álbuns' },
  { key: 'artists', label: 'Artistas' },
  { key: 'tracks', label: 'Faixas' },
  { key: 'playlists', label: 'Listas' },
  { key: 'liked', label: 'Favoritos' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const NO_TRACKS: Track[] = [];
const NO_ALBUMS: Album[] = [];

const GAP = 14;

/**
 * Onde o traço de acento está, medido em fatias de aba (0 = Álbuns, 4 = Favoritos).
 *
 * Fora do componente porque a posição do traço é estado da *tela*, não da faixa de abas:
 * ela precisa valer o que valia por último toda vez que a faixa monta. Num shared value
 * de componente o traço nascia em zero e corria da borda esquerda até a aba nova em vez
 * de sair da anterior — e, como a largura só se sabe depois do layout, o primeiro alvo
 * calculado era mesmo zero. A lista unificada tirou a remontagem que expôs isso; a
 * posição fica aqui de qualquer forma, que é onde ela deve estar.
 *
 * Em fatias, e não em pixels, para não precisar de sincronia com a medida da largura: o
 * worklet multiplica pela fatia atual.
 */
const tracePosition = makeMutable(0);

/**
 * Largura medida da linha de abas, guardada pelo mesmo motivo do `tracePosition`: a cada
 * remontagem ela voltava a zero e o traço passava um quadro fora da tela, o que piscava
 * em toda troca de aba.
 */
let traceWidth = 0;

/**
 * Superamortecida de propósito: nesta rigidez qualquer razão abaixo de 1 fazia o traço
 * passar da aba nova e voltar, e esse repique era o que mais se via na troca.
 */
const TRACE = { damping: 32, stiffness: 220 };

export default function LibraryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { library, artists, trackById, albumById } = useLibrary();
  const { accent, albumView, setAlbumView, liked, likedAlbums } = usePrefs();
  const { play, enqueueLast } = usePlayer();
  const { playlists } = usePlaylists();
  const { open, sheet } = usePlaylistSheet();
  // O toque longo abre o menu; o arraste continua indo direto para a folha de listas.
  const { open: openMenu, menu } = useItemMenu();
  const [naming, setNaming] = useState(false);
  const { tab: raw } = useLocalSearchParams<{ tab?: string }>();

  const tab: TabKey = TABS.some((t) => t.key === raw) ? (raw as TabKey) : 'albums';

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

  const tracks = library?.tracks ?? NO_TRACKS;
  const albums = library?.albums ?? NO_ALBUMS;
  const totalSeconds = useMemo(
    () => tracks.reduce((n, t) => n + (t.duration ?? 0), 0),
    [tracks]
  );

  /*
    Curtir é um append, então a lista salva está em ordem de quando foi curtido — do mais
    antigo para o mais novo. Invertida aqui: o que acabou de ganhar o coração é o que a
    aba tem de mostrar primeiro. O `filter` é o que descarta o que uma nova varredura não
    encontrou mais, do mesmo jeito que a tela de lista faz.
  */
  const likedTracks = useMemo(
    () => [...liked].reverse().map(trackById).filter((t) => !!t),
    [liked, trackById]
  );
  const favoriteAlbums = useMemo(
    () => [...likedAlbums].reverse().map(albumById).filter((a) => !!a),
    [likedAlbums, albumById]
  );

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
            Sua biblioteca
          </Display>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 7 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.ok }} />
            <Body size={12.5} color={T.t42}>
              {tracks.length} faixas · {albums.length} álbuns · {Math.round(totalSeconds / 3600)} h
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
        Daqui para baixo é conteúdo, e é só isto que se move na troca de aba. O título e
        as abas ficam de fora: o traço de acento corre até a aba nova e nada mais sai do
        lugar.

        A `key` é a aba porque o cabeçalho não remonta mais — a lista virou uma só. Sem
        ela este bloco ficaria montado para sempre e a entrada nunca correria de novo.
      */}
      <Animated.View key={tab} entering={(forward ? FadeInRight : FadeInLeft).duration(240)}>
      {tab === 'albums' && albums.length > 0 && (
        <AlbumStrip
          title="Recém-encontrados"
          albums={albums.slice(0, 8)}
          badge="NOVO"
          onHold={(album) => openMenu({ kind: 'album', album })}
        />
      )}

      {tab === 'albums' && (
        <SectionLabel
          title="Todos os álbuns"
          trailing={`${albums.length}`}
          action={<ViewToggle value={albumView} onPick={setAlbumView} accent={accent} />}
        />
      )}

      {tab === 'liked' && favoriteAlbums.length > 0 && (
        <AlbumStrip
          title="Álbuns curtidos"
          albums={favoriteAlbums}
          onHold={(album) => openMenu({ kind: 'album', album })}
        />
      )}

      {tab === 'liked' && likedTracks.length > 0 && (
        <SectionLabel title="Faixas curtidas" trailing={`${likedTracks.length}`} />
      )}

      {tab === 'playlists' && (
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
            Nova lista
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

  const carousel = tab === 'albums' && albumView === 'carousel';

  /** As faixas que uma linha de faixa toca: a aba diz qual das duas listas é. */
  const listTracks = tab === 'liked' ? likedTracks : tracks;

  /*
    Uma FlatList só, para as cinco abas.

    Antes era uma por aba, cada uma com a sua `key` — o que a grade de álbuns exigia para
    ter `numColumns={2}`. Trocar de aba trocava a `key`, o React remontava a lista inteira
    e com ela o cabeçalho, onde as abas moram: era isso que fazia o traço de acento nascer
    de novo do zero a cada troca. Aqui a grade é uma lista de linhas de dois álbuns, então
    `numColumns` nunca muda, a `key` nunca muda, e nada remonta.
  */
  const rows = useMemo<Row[]>(() => {
    if (tab === 'albums') {
      // No carrossel a lista fica vazia de propósito: as capas vão no cabeçalho.
      if (albumView === 'carousel') return NO_ROWS;
      const pairs: Row[] = [];
      for (let i = 0; i < albums.length; i += 2) {
        pairs.push({ kind: 'albums', id: albums[i].id, albums: albums.slice(i, i + 2) });
      }
      return pairs;
    }
    if (tab === 'artists') {
      return artists.map((artist) => ({ kind: 'artist', id: artist.name, artist }));
    }
    if (tab === 'playlists') {
      return playlists.map((playlist) => ({ kind: 'playlist', id: playlist.id, playlist }));
    }
    return listTracks.map((track) => ({ kind: 'track', id: track.id, track }));
  }, [tab, albumView, albums, artists, playlists, listTracks]);

  const empty = emptyFor(tab, favoriteAlbums.length > 0);

  return (
    <>
      <FlatList
        {...chromeScroll}
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
        ListEmptyComponent={carousel ? null : empty}
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingBottom: bottom,
          paddingHorizontal: PADDING,
          // Só a grade precisa de respiro entre as linhas; as listas já têm o seu dentro.
          gap: tab === 'albums' ? 16 : 0,
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
            ) : item.kind === 'playlist' ? (
              <GroupRow
                title={item.playlist.name}
                subtitle={`${item.playlist.trackIds.length} ${item.playlist.trackIds.length === 1 ? 'faixa' : 'faixas'}`}
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

/** Uma linha da lista. A aba escolhe qual das quatro formas ela tem. */
type Row =
  | { kind: 'albums'; id: string; albums: Album[] }
  | { kind: 'artist'; id: string; artist: ReturnType<typeof useLibrary>['artists'][number] }
  | { kind: 'playlist'; id: string; playlist: Playlist }
  | { kind: 'track'; id: string; track: Track };

const NO_ROWS: Row[] = [];

/** O vazio de cada aba. */
function emptyFor(tab: TabKey, hasFavoriteAlbums: boolean) {
  if (tab === 'albums') {
    return (
      <EmptyState icon={<LibraryIcon size={30} color={T.full} />} title="Biblioteca vazia">
        Nenhum álbum por aqui ainda. Varra o aparelho de novo em Ajustes.
      </EmptyState>
    );
  }
  if (tab === 'artists') {
    return (
      <EmptyState icon={<LibraryIcon size={30} color={T.full} />} title="Nenhum artista">
        A varredura não encontrou nada com metadados de artista.
      </EmptyState>
    );
  }
  if (tab === 'playlists') {
    return (
      <EmptyState icon={<LibraryIcon size={30} color={T.full} />} title="Nenhuma lista ainda">
        Segure uma faixa em qualquer tela para criar a primeira.
      </EmptyState>
    );
  }
  if (tab === 'liked') {
    // Álbum curtido sem faixa curtida não é uma aba vazia: as capas já estão no cabeçalho.
    if (hasFavoriteAlbums) return null;
    return (
      <EmptyState icon={<Heart size={30} color={T.full} filled />} title="Nada curtido ainda">
        Toque no coração de uma faixa no Now Playing, ou no de um álbum, para guardá-la
        aqui.
      </EmptyState>
    );
  }
  return (
    <EmptyState icon={<LibraryIcon size={30} color={T.full} />} title="Nenhuma faixa">
      Varra o aparelho de novo em Ajustes para procurar música.
    </EmptyState>
  );
}

/** Criação direta de lista, sem precisar de uma faixa para começar. */
function NewPlaylist({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { accent } = usePrefs();
  const { create } = usePlaylists();
  const [name, setName] = useState('');

  const confirm = () => {
    if (!name.trim()) return;
    create(name);
    setName('');
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Nova lista">
      <TextInput
        value={name}
        onChangeText={setName}
        autoFocus
        placeholder="Nome da lista"
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
            Cancelar
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
            Criar
          </Body>
        </Pressable>
      </View>
    </Sheet>
  );
}

function Tabs({ current, onPick }: { current: TabKey; onPick: (k: TabKey) => void }) {
  const { accent } = usePrefs();

  // A largura do traço só se sabe depois do layout: são fatias iguais da linha, uma por aba.
  const [width, setWidth] = useState(traceWidth);
  const slot = width / TABS.length;
  const at = TABS.findIndex((t) => t.key === current);
  useEffect(() => {
    tracePosition.value = withSpring(at, TRACE);
  }, [at]);

  const slide = useAnimatedStyle(() => ({
    transform: [{ translateX: tracePosition.value * slot }],
  }));

  return (
    <View style={{ marginTop: 22, marginBottom: 4 }}>
      <View style={{ flexDirection: 'row', backgroundColor: C.card, borderRadius: R.r13, padding: 4 }}>
        {TABS.map((t) => {
          const active = t.key === current;
          return (
            <Pressable
              key={t.key}
              onPress={() => onPick(t.key)}
              style={{
                flex: 1,
                height: 34,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: active ? '#252019' : 'transparent',
              }}>
              <Body size={12} weight={600} numberOfLines={1} color={active ? T.full : T.t42}>
                {t.label}
              </Body>
            </Pressable>
          );
        })}
      </View>
      {/* Um traço fino no acento marca a aba, como a pílula do design. Ele corre até a
          aba nova: quatro traços acendendo e apagando não diziam de onde para onde. */}
      <View
        onLayout={(e) => {
          traceWidth = e.nativeEvent.layout.width;
          setWidth(traceWidth);
        }}
        style={{ height: 2, marginTop: 6 }}>
        {width > 0 && (
          <Animated.View style={[{ width: slot, height: 2, paddingHorizontal: 6 }, slide]}>
            <View style={{ flex: 1, borderRadius: 1, backgroundColor: accent }} />
          </Animated.View>
        )}
      </View>
    </View>
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
  return (
    <View style={{ marginTop: 24 }}>
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
  const router = useRouter();
  const art = artworkFor(album.artist, album.title);
  const { ref, launch, style: originStyle } = useZoomLaunch(R.r15);

  return (
    <Pressable
      onPress={() => launch(() => router.push(`/album/${album.id}`))}
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
  const router = useRouter();
  const art = artworkFor(album.artist, album.title);
  // A capa é o retângulo de onde a tela do álbum cresce.
  const { ref, launch, style: originStyle } = useZoomLaunch(R.r17);

  return (
    <Pressable
      onPress={() => launch(() => router.push(`/album/${album.id}`))}
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
  const router = useRouter();
  const { ref, launch, style: originStyle } = useZoomLaunch(26);
  const cover = artist.albums.find((a) => a.cover)?.cover ?? null;

  return (
    <Pressable
      onPress={() =>
        launch(() => router.push(`/artist/${encodeURIComponent(artist.name)}`))
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
  const router = useRouter();
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
        onPress={() => launch(() => router.push(`/album/${album.id}`))}
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
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={280}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 13,
        paddingVertical: 10,
      }}>
      <AlbumArt art={art} size={52} radius={round ? 26 : 14} detail="ring" cover={cover} />
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
