import { useDeferredValue, useMemo, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlbumArt } from '@/components/album-art';
import { ConfirmIcon, useConfirm } from '@/components/confirm';
import { EmptyState } from '@/components/empty-state';
import { ChevronLeft, LibraryIcon, Play, Queue as QueueIcon, Shuffle } from '@/components/icons';
import { useItemMenu } from '@/components/context-menu';
import { usePlaylistSheet } from '@/components/playlist-sheet';
import { SectionLabel } from '@/components/section-label';
import { Body, Display, Mono } from '@/components/text';
import { TrackRow } from '@/components/track-row';
import { C, CHROME_HEIGHT, PADDING, R, T, alpha } from '@/constants/theme';
import { artGradient, artworkFor } from '@/lib/artwork';
import { chromeScrollTo } from '@/lib/chrome-scroll';
import { useDetail } from '@/lib/detail';
import { useLibrary } from '@/lib/library';
import { usePlayer } from '@/lib/player';
import { usePrefs } from '@/lib/prefs';
import {
  ZoomFade,
  ZoomScreen,
  ZoomTarget,
  useZoomClose,
  useZoomLaunch,
  useZoomProgress,
} from '@/lib/zoom';
import type { Track } from '@/lib/scan';

/** Quantas faixas a seção "Mais tocadas" mostra. */
const TOP = 5;
/**
 * Faixas por página do carrossel.
 *
 * Era uma lista vertical que crescia de 40 em 40 conforme se rolava. Um artista com
 * centenas de faixas virava uma lista sem fim embaixo do hero; em páginas de seis, o que
 * está na tela sempre cabe na tela.
 */
const PER_PAGE = 6;

/** Altura de uma linha de faixa, medida no aparelho: é o que iguala a altura das páginas. */
const ROW = 54;

const NO_TRACKS: Track[] = [];

const { height: SCREEN } = Dimensions.get('window');
/** Altura do hero, como no Music: pouco menos da metade da tela. */
const HERO = Math.round(SCREEN * 0.42);

/**
 * A tela de artista, como camada. Recebe o nome por prop porque não é mais rota — ver
 * `lib/detail.tsx`.
 */
export function ArtistScreen({ name }: { name: string }) {
  const insets = useSafeAreaInsets();
  const { library, artists } = useLibrary();
  const { playsOf } = usePrefs();

  const albums = useMemo(
    () => artists.find((a) => a.name === name)?.albums ?? [],
    [artists, name]
  );

  const tracks = useMemo(
    () => (library?.tracks ?? []).filter((t) => t.artist === name || t.albumArtist === name),
    [library, name]
  );

  const top = useMemo(() => {
    const played = tracks.filter((t) => playsOf(t.id) > 0);
    return played.sort((a, b) => playsOf(b.id) - playsOf(a.id)).slice(0, TOP);
  }, [tracks, playsOf]);

  if (!tracks.length) {
    return (
      <View style={{ flex: 1, paddingTop: insets.top + 40 }}>
        <EmptyState icon={<LibraryIcon size={30} color={T.full} />} title="Artista não encontrado">
          Nada na biblioteca com esse nome.
        </EmptyState>
      </View>
    );
  }

  return <Artist name={name} albums={albums} tracks={tracks} top={top} />;
}

function Artist({
  name,
  albums,
  tracks,
  top,
}: {
  name: string;
  albums: ReturnType<typeof useLibrary>['artists'][number]['albums'];
  tracks: Track[];
  top: Track[];
}) {
  const insets = useSafeAreaInsets();
  const { accent } = usePrefs();
  const { close } = useDetail();
  const { play, enqueueLast } = usePlayer();
  const { open, sheet } = usePlaylistSheet();
  const { open: openMenu, menu } = useItemMenu();

  const cover = albums.find((a) => a.cover)?.cover ?? null;
  const art = artworkFor(name, albums[0]?.title ?? '');
  const total = tracks.reduce((n, t) => n + (t.duration ?? 0), 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);

  /*
    "Mais tocadas" e o carrossel entram no quadro seguinte, não no primeiro — mesma razão
    da tela de álbum: onze TrackRow no commit que abre a tela atrasavam a transição de
    zoom. Ver o comentário em `album/[id].tsx` para o porquê do `useDeferredValue`.
  */
  const ready = useDeferredValue(true, false);

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
    chromeScrollTo(e.contentOffset.y);
  });

  /**
   * Parallax do Music: subindo, a imagem anda a meia velocidade do conteúdo; puxando
   * para baixo além do topo, ela estica em vez de deixar um vão.
   *
   * O deslocamento é negativo. Com sinal positivo a imagem descia enquanto a lista
   * subia, e como ela está fixada em `top: 0`, descer descobria o topo da tela — era a
   * tarja preta. Subindo pela metade, a imagem sempre cobre o topo e ainda fica atrás do
   * conteúdo, que sobe mais rápido.
   */
  /**
   * O parallax se desfaz enquanto a tela fecha.
   *
   * A foto voa de volta para a bolinha do artista, e o que voava era a foto *como estava
   * na tela* — deslocada pela rolagem e esticada pelo overscroll. Chegava torta num lugar
   * que nunca esteve torto. Multiplicado pelo progresso do zoom, o efeito volta ao
   * repouso no mesmo movimento em que a tela sai.
   */
  const zoom = useZoomProgress();
  const hero = useAnimatedStyle(() => {
    const open = zoom ? zoom.value : 1;
    const y = scrollY.value;
    const overscroll = y < 0 ? -y : 0;
    return {
      transform: [
        { translateY: (y < 0 ? 0 : -y * 0.5) * open },
        { scale: 1 + (overscroll / HERO) * open },
      ],
    };
  });

  // O título e os botões saem antes da imagem, para não colidirem com a barra do topo.
  const heroContent = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, HERO * 0.5], [1, 0], 'clamp'),
  }));

  // Barra compacta que assume quando o hero rola para fora.
  const bar = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [HERO * 0.55, HERO * 0.85], [0, 1], 'clamp'),
  }));

  const header = (
    <>
      {/*
        Nome, números e ações vivem aqui, dentro do cabeçalho da lista — e não na camada
        da foto. Lá eles ficavam debaixo da própria lista, que cobre a tela inteira, e
        nenhum dos três botões chegava a receber o toque.
      */}
      <Animated.View
        style={[
          {
            height: HERO,
            justifyContent: 'flex-end',
            paddingHorizontal: PADDING,
            paddingBottom: 22,
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 14,
          },
          heroContent,
        ]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Display size={38} weight={800} tracking={-0.04} numberOfLines={2}>
            {name}
          </Display>
          <Mono size={10.5} tracking={0.14} caps color={T.t72} style={{ marginTop: 8 }}>
            {albums.length} {albums.length === 1 ? 'álbum' : 'álbuns'} · {tracks.length} faixas ·{' '}
            {hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`}
          </Mono>
        </View>

        {/* Ações no canto inferior direito, como no Music. */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <QueueRound onPress={() => enqueueLast(tracks)} accent={accent} />
          <Round onPress={() => play(shuffled(tracks), 0)} border>
            <Shuffle size={19} />
          </Round>
          <Round onPress={() => play(tracks, 0)} background={accent}>
            <Play size={16} color={C.onAccent} />
          </Round>
        </View>
      </Animated.View>
      <View style={{ paddingHorizontal: PADDING, backgroundColor: C.bg }}>
        {ready && top.length > 0 && (
          <>
            <SectionLabel title="Mais tocadas" />
            {top.map((track, index) => (
              <TrackRow
                key={track.id}
                track={track}
                position={index + 1}
                accent={accent}
                onPress={() => play(top, index)}
                onLongPress={() => openMenu({ kind: 'track', track })}
                onQueue={() => enqueueLast([track])}
                onPlaylist={() => open([track.id])}
                subtitle={track.album}
              />
            ))}
          </>
        )}

        {albums.length > 0 && (
          <>
            <SectionLabel title="Álbuns" trailing={`${albums.length}`} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -PADDING }}
              contentContainerStyle={{ gap: 12, paddingHorizontal: PADDING }}>
              {albums.map((album) => (
                <AlbumCard
                  key={album.id}
                  album={album}
                  onHold={() => openMenu({ kind: 'album', album })}
                />
              ))}
            </ScrollView>
          </>
        )}

        <SectionLabel title="Todas as faixas" trailing={`${tracks.length}`} />
      </View>

      {ready && (
        <TrackPager
          tracks={tracks}
          accent={accent}
          onHold={(track) => openMenu({ kind: 'track', track })}
        />
      )}
    </>
  );

  return (
    <ZoomScreen background={C.bg} edgeBack onClosed={close}>
      {/* Hero: alvo do zoom vindo da lista e, depois, o pano de fundo do parallax.
          zIndex 0 porque aqui ele precisa ficar *atrás* da lista, que o cobre ao rolar. */}
      <ZoomTarget
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: HERO, zIndex: 0 }}>
      <Animated.View
        // Nada aqui recebe toque: o conteúdo do hero mora no cabeçalho da lista.
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: HERO,
            backgroundColor: art.c,
            experimental_backgroundImage: artGradient(art),
            transformOrigin: 'top',
          },
          hero,
        ]}>
        {cover ? (
          <Image source={{ uri: cover }} style={{ position: 'absolute', inset: 0 }} resizeMode="cover" />
        ) : null}

        {/* Escurece o pé da imagem: sem isso o nome briga com a capa. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            inset: 0,
            experimental_backgroundImage: `linear-gradient(180deg, rgba(11,10,9,.25) 0%, transparent 32%, rgba(11,10,9,.72) 78%, ${C.bg} 100%)`,
          }}
        />
      </Animated.View>
      </ZoomTarget>

      <ZoomFade style={{ flex: 1 }}>
      <Animated.FlatList
        showsVerticalScrollIndicator={false}
        // Vazia de propósito: as faixas viraram carrossel e moram no cabeçalho.
        data={NO_TRACKS}
        keyExtractor={(t) => (t as Track).id}
        onScroll={onScroll}
        scrollEventThrottle={16}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: CHROME_HEIGHT + insets.bottom }}
        // Fundo sólido até o fim: o conteúdo precisa cobrir a foto ao subir.
        ListFooterComponent={<View style={{ backgroundColor: C.bg, minHeight: 24 }} />}
        renderItem={() => null}
      />
      </ZoomFade>

      {/* Barra do topo: o botão de voltar sempre visível, o nome só depois da rolagem. */}
      <ZoomFade
        pointerEvents="box-none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: insets.top + 10 }}>
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: insets.top + 56,
              backgroundColor: alpha(C.bg, 0.88),
            },
            bar,
          ]}
        />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: PADDING,
          }}>
          <BackButton />
          <Animated.View style={[{ flex: 1 }, bar]} pointerEvents="none">
            <Body size={15} weight={600} tracking={-0.01} numberOfLines={1}>
              {name}
            </Body>
          </Animated.View>
        </View>
      </ZoomFade>

      {sheet}
      {menu}
    </ZoomScreen>
  );
}

/**
 * As faixas do artista em páginas de seis, deslizando para o lado.
 *
 * FlatList horizontal com `pagingEnabled`: as páginas são virtualizadas, então um artista
 * com centenas de faixas monta seis linhas por vez e não uma lista inteira.
 *
 * As páginas têm largura de tela cheia e o recuo mora dentro delas — é o mesmo truque da
 * tira de álbuns. Sem isso, a página seguinte apareceria colada na borda.
 *
 * A última página é completada com espaçadores. Sem eles ela é mais baixa que as outras,
 * e a altura da lista pularia ao chegar nela.
 */
function TrackPager({
  tracks,
  accent,
  onHold,
}: {
  tracks: Track[];
  accent: string;
  onHold: (track: Track) => void;
}) {
  const { width } = useWindowDimensions();
  const { play, enqueueLast } = usePlayer();
  const { open } = usePlaylistSheet();
  const [page, setPage] = useState(0);

  const pages = useMemo(() => {
    const out: Track[][] = [];
    for (let i = 0; i < tracks.length; i += PER_PAGE) out.push(tracks.slice(i, i + PER_PAGE));
    return out;
  }, [tracks]);

  if (!pages.length) return null;

  return (
    <View style={{ backgroundColor: C.bg }}>
      <FlatList
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        data={pages}
        keyExtractor={(_, i) => String(i)}
        // O índice da página vem do deslocamento: uma divisão em vez de um handler por item.
        onMomentumScrollEnd={(e) =>
          setPage(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width)))
        }
        renderItem={({ item, index: at }) => (
          <View style={{ width, paddingHorizontal: PADDING }}>
            {item.map((track, i) => {
              // Índice global: tocar daqui segue a ordem da discografia inteira.
              const index = at * PER_PAGE + i;
              return (
                <TrackRow
                  key={track.id}
                  track={track}
                  position={index + 1}
                  accent={accent}
                  onPress={() => play(tracks, index)}
                  onLongPress={() => onHold(track)}
                  onQueue={() => enqueueLast([track])}
                  onPlaylist={() => open([track.id])}
                  subtitle={track.album}
                />
              );
            })}
            {/* Completa a última página para todas terem a mesma altura. */}
            {Array.from({ length: PER_PAGE - item.length }, (_, i) => (
              <View key={`vazio-${i}`} style={{ height: ROW }} />
            ))}
          </View>
        )}
      />

      {pages.length > 1 && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            paddingTop: 14,
          }}>
          {pages.map((_, i) => (
            <View
              key={i}
              style={{
                width: i === page ? 18 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === page ? accent : T.t18,
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * Capa do álbum na tira do artista.
 *
 * Componente à parte porque `useZoomLaunch` é hook e não pode ser chamado dentro do
 * `map`. Sem ele esta era a única capa do app que abria sem o zoom: dava um fade seco na
 * ida e, na volta, nada voava para o lugar dela — a capa simplesmente reaparecia.
 */
function AlbumCard({
  album,
  onHold,
}: {
  album: ReturnType<typeof useLibrary>['artists'][number]['albums'][number];
  onHold: () => void;
}) {
  const { openAlbum } = useDetail();
  const { ref, launch, style: originStyle } = useZoomLaunch(R.r15);

  return (
    <Pressable
      onPress={() => launch(() => openAlbum(album.id))}
      onLongPress={onHold}
      delayLongPress={280}
      style={{ width: 130 }}>
      <View ref={ref} collapsable={false} style={originStyle}>
        <AlbumArt
          art={artworkFor(album.artist, album.title)}
          size={130}
          radius={R.r15}
          cover={album.cover}
          detail="ring"
        />
      </View>
      <Body size={12.5} weight={600} numberOfLines={1} style={{ marginTop: 8 }}>
        {album.title}
      </Body>
      <Body size={11} color={T.t42} numberOfLines={1}>
        {album.trackIds.length} faixas
      </Body>
    </Pressable>
  );
}

/** Encolhe de volta para a linha do artista, como no álbum. */
function BackButton() {
  const close = useZoomClose();
  return (
    <Pressable
      onPress={close}
      hitSlop={10}
      style={{
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: 'rgba(20,17,16,.55)',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <ChevronLeft />
    </Pressable>
  );
}

/** Enfileirar tudo do artista, com repique e visto. */
function QueueRound({ onPress, accent }: { onPress: () => void; accent: string }) {
  const { fire, done, style } = useConfirm(onPress);
  return (
    <Round onPress={fire} border>
      <Animated.View style={style}>
        <ConfirmIcon done={done} accent={accent} size={19}>
          <QueueIcon size={19} color={T.full} />
        </ConfirmIcon>
      </Animated.View>
    </Round>
  );
}

function Round({
  onPress,
  children,
  background,
  border = false,
}: {
  onPress: () => void;
  children: React.ReactNode;
  background?: string;
  border?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: background ?? 'rgba(20,17,16,.55)',
        borderWidth: border ? 1 : 0,
        borderColor: alpha('#F6F1EA', 0.2),
      }}>
      {children}
    </Pressable>
  );
}

/** Embaralha sem mutar, como nas outras telas. */
function shuffled<T>(items: T[]): T[] {
  return items
    .map((item) => ({ item, key: Math.random() }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.item);
}
