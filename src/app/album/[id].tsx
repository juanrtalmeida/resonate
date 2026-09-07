import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlatList, Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlbumArt } from '@/components/album-art';
import { Chrome } from '@/components/chrome';
import { Backdrop } from '@/components/backdrop';
import { ConfirmIcon, useConfirm } from '@/components/confirm';
import { ChevronLeft, Heart, Play, Queue, Shuffle } from '@/components/icons';
import { Body, Display, Mono } from '@/components/text';
import { TrackRow } from '@/components/track-row';
import { C, CHROME_HEIGHT, PADDING, T, alpha, fmt } from '@/constants/theme';
import { artworkFor } from '@/lib/artwork';
import { useLibrary } from '@/lib/library';
import { chromeScroll } from '@/lib/chrome-scroll';
import { usePlayer } from '@/lib/player';
import { usePlaylistSheet } from '@/components/playlist-sheet';
import { usePrefs } from '@/lib/prefs';
import type { Album } from '@/lib/scan';
import { ZoomFade, ZoomScreen, ZoomTarget, useZoomClose } from '@/lib/zoom';

export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { albumById } = useLibrary();

  const album = albumById(id);
  if (!album) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Body size={14} color={T.t5}>
          Álbum não encontrado.
        </Body>
      </View>
    );
  }
  return <AlbumDetail album={album} />;
}

function AlbumDetail({ album }: { album: Album }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tracksOf } = useLibrary();
  const { play, enqueueLast } = usePlayer();
  const { accent, isAlbumLiked, toggleAlbumLike } = usePrefs();
  const { open, sheet } = usePlaylistSheet();

  const tracks = tracksOf(album);
  const art = artworkFor(album.artist, album.title);
  const total = tracks.reduce((n, t) => n + (t.duration ?? 0), 0);
  const liked = isAlbumLiked(album.id);

  const header = (
    <View>
      <ZoomFade>
        <BackButton />
      </ZoomFade>

      {/* A capa não entra em fade: ela é o objeto que veio da grade. */}
      <View style={{ alignItems: 'center', marginTop: 18 }}>
        <ZoomTarget radius={24}>
          <AlbumArt art={art} size={218} radius={24} cover={album.cover} />
        </ZoomTarget>
      </View>

      <ZoomFade style={{ alignItems: 'center', marginTop: 22 }}>
        <Display size={29} tracking={-0.035} align="center">
          {album.title}
        </Display>
        <Pressable
          onPress={() => router.push(`/artist/${encodeURIComponent(album.artist)}`)}
          hitSlop={6}
          style={{ marginTop: 6 }}>
          <Body size={14} color={accent} align="center">
            {album.artist}
          </Body>
        </Pressable>
        <Mono size={11} tracking={0.06} color={T.t62} style={{ marginTop: 9 }}>
          {tracks.length} FAIXAS · {fmt(total).replace(':', 'M ')}S
        </Mono>
      </ZoomFade>

      <ZoomFade style={{ flexDirection: 'row', gap: 10, marginTop: 22 }}>
        <Pressable
          onPress={() => play(tracks, 0)}
          style={{
            flex: 1,
            height: 52,
            borderRadius: 16,
            backgroundColor: accent,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 9,
          }}>
          <Play size={14} color={C.onAccent} />
          <Display size={15.5} tracking={-0.015} color={C.onAccent}>
            Tocar álbum
          </Display>
        </Pressable>
        <SquareButton onPress={() => play(shuffled(tracks), 0)}>
          <Shuffle />
        </SquareButton>
        <QueueButton onPress={() => enqueueLast(tracks)} accent={accent} />
        <SquareButton onPress={() => toggleAlbumLike(album.id)}>
          <Heart color={accent} filled={liked} />
        </SquareButton>
      </ZoomFade>

      <View style={{ height: 26 }} />
    </View>
  );

  return (
    <>
    <ZoomScreen background={C.bg} edgeBack>
      <Backdrop cover={album.cover} color={art.a} />
      <FlatList
        {...chromeScroll}
        data={tracks}
        keyExtractor={(t) => t.id}
        ListHeaderComponent={header}
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingBottom: CHROME_HEIGHT + insets.bottom,
          paddingHorizontal: PADDING,
        }}
        renderItem={({ item, index }) => (
          /*
            O fade vai por linha, e não num invólucro em volta da lista: o cabeçalho da
            lista carrega o ZoomTarget, e a capa em voo é justamente o que tem de
            continuar sólido. Só as linhas visíveis estão montadas, então são ~15 estilos
            animados, não um por faixa.
          */
          <ZoomFade>
            <TrackRow
              track={item}
              position={item.trackNumber ?? index + 1}
              accent={accent}
              onPress={() => play(tracks, index)}
              onLongPress={() => open([item.id])}
              onQueue={() => enqueueLast([item])}
              onPlaylist={() => open([item.id])}
              subtitle={item.artist}
            />
          </ZoomFade>
        )}
      />
      {sheet}
    </ZoomScreen>
    {/*
      A barra vem de dentro da tela, não do root: estas telas são `transparentModal` e no
      Android sobem numa janela própria, acima de tudo o que está lá embaixo. A instância
      do root se cala nestas rotas — ver `overModal` em chrome.tsx.
    */}
    <Chrome overModal />
    </>
  );
}

/** Encolhe a tela de volta para a capa de onde ela cresceu. */
function BackButton() {
  const close = useZoomClose();
  return (
    <Pressable
      onPress={close}
      hitSlop={8}
      style={{
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: 'rgba(20,17,16,.7)',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <ChevronLeft />
    </Pressable>
  );
}

/** Embaralha sem mutar: uma chave aleatória por item e uma ordenação por ela. */
function shuffled<T>(items: T[]): T[] {
  return items
    .map((item) => ({ item, key: Math.random() }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.item);
}

/** Enfileirar o álbum inteiro, com o mesmo repique e visto do gesto nas faixas. */
function QueueButton({ onPress, accent }: { onPress: () => void; accent: string }) {
  const { fire, done, style } = useConfirm(onPress);
  return (
    <SquareButton onPress={fire}>
      <Animated.View style={style}>
        <ConfirmIcon done={done} accent={accent} size={19}>
          <Queue size={19} color={T.full} />
        </ConfirmIcon>
      </Animated.View>
    </SquareButton>
  );
}

function SquareButton({ onPress, children }: { onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 52,
        height: 52,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: alpha('#F6F1EA', 0.14),
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {children}
    </Pressable>
  );
}
