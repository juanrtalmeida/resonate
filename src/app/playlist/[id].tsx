import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlbumArt } from '@/components/album-art';
import { Backdrop } from '@/components/backdrop';
import { EmptyState } from '@/components/empty-state';
import { ChevronLeft, Play, Plus, Shuffle } from '@/components/icons';
import { Body, Display, Mono } from '@/components/text';
import { QueueRow } from '@/components/queue-row';
import { TrackRow } from '@/components/track-row';
import { C, CHROME_HEIGHT, PADDING, T, alpha, fmt } from '@/constants/theme';
import { artworkFor } from '@/lib/artwork';
import { useLibrary } from '@/lib/library';
import { usePlayer } from '@/lib/player';
import { usePlaylists, type Playlist } from '@/lib/playlists';
import { useItemMenu } from '@/components/context-menu';
import { usePlaylistSheet } from '@/components/playlist-sheet';
import { usePrefs, useT } from '@/lib/prefs';
import { chromeScroll } from '@/lib/chrome-scroll';
import { useKeyboardOverlap } from '@/lib/keyboard';

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { byId } = usePlaylists();
  const t = useT();

  const playlist = byId(id);
  if (!playlist) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Body size={14} color={T.t5}>
          {t('playlist.notFound')}
        </Body>
      </View>
    );
  }
  return <PlaylistDetail playlist={playlist} />;
}

function PlaylistDetail({ playlist }: { playlist: Playlist }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { trackById } = useLibrary();
  const { play, enqueueLast } = usePlayer();
  const { accent } = usePrefs();
  const t = useT();
  const { rename, remove, removeTrack, moveTrack, pickCover, clearCover } = usePlaylists();
  const { open, sheet } = usePlaylistSheet();
  const { open: openMenu, menu } = useItemMenu();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(playlist.name);
  // Renomear abre o teclado sobre a lista — a janela não encolhe sozinha no edge-to-edge.
  const keyboard = useKeyboardOverlap();

  /*
    Quem está na mão e para onde aponta, para as linhas vizinhas abrirem espaço.

    Compartilhados com a `QueueRow`, que é a mesma linha da fila do Now Playing. Reordenar
    uma lista e reordenar a fila são a mesma operação, e o arraste dela já resolve o que é
    difícil: o pegador não compete com a rolagem, o alvo salta de posição inteira, e a
    linha ativa viaja por cima das outras.
  */
  const activeAt = useSharedValue(-1);
  const targetAt = useSharedValue(-1);

  // Faixas que sumiram numa nova varredura simplesmente não aparecem.
  const tracks = playlist.trackIds.map(trackById).filter((t) => !!t);
  const art = artworkFor(playlist.name, 'lista');
  const total = tracks.reduce((n, t) => n + (t.duration ?? 0), 0);

  const header = (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable
          onPress={() => router.back()}
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
        <Pressable
          onPress={() => {
            if (editing) rename(playlist.id, name);
            setEditing(!editing);
          }}
          hitSlop={8}>
          <Body size={13.5} weight={600} color={editing ? accent : T.t5}>
            {t(editing ? 'playlist.done' : 'playlist.edit')}
          </Body>
        </Pressable>
      </View>

      <View style={{ alignItems: 'center', marginTop: 18 }}>
        <Pressable onPress={editing ? () => pickCover(playlist.id) : undefined} disabled={!editing}>
          <AlbumArt art={art} size={190} radius={24} cover={playlist.cover ?? null} />
          {/* Só em edição: fora dela um toque na capa não deveria abrir o seletor. */}
          {editing && (
            <View
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 24,
                backgroundColor: 'rgba(6,5,4,.55)',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}>
              <Plus size={22} color={T.full} />
              <Body size={12.5} weight={600} color={T.full}>
                {t(playlist.cover ? 'playlist.changeCover' : 'playlist.pickCover')}
              </Body>
            </View>
          )}
        </Pressable>
      </View>

      <View style={{ alignItems: 'center', marginTop: 22 }}>
        {editing ? (
          <TextInput
            value={name}
            onChangeText={setName}
            selectionColor={accent}
            style={{
              color: T.full,
              fontFamily: 'BricolageGrotesque_700Bold',
              fontSize: 26,
              letterSpacing: -0.9,
              textAlign: 'center',
              borderBottomWidth: 1,
              borderColor: T.t24,
              minWidth: 200,
              paddingBottom: 4,
            }}
          />
        ) : (
          <Display size={29} tracking={-0.035} align="center">
            {playlist.name}
          </Display>
        )}
        <Mono size={11} tracking={0.06} color={T.t62} style={{ marginTop: 9 }}>
          {tracks.length} {t('unit.tracks')} · {fmt(total).replace(':', 'M ')}S
        </Mono>
      </View>

      {tracks.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 22 }}>
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
              {t('album.play')}
            </Display>
          </Pressable>
          <Pressable
            onPress={() => play(shuffled(tracks), 0)}
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: alpha('#F6F1EA', 0.14),
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Shuffle />
          </Pressable>
        </View>
      )}

      {editing && (
        <View style={{ marginTop: 14, alignItems: 'center', gap: 4 }}>
          {playlist.cover ? (
            <Pressable
              onPress={() => clearCover(playlist.id)}
              style={{ paddingVertical: 10 }}>
              <Body size={13} weight={500} color={T.t5}>
                {t('playlist.removeCover')}
              </Body>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => {
              remove(playlist.id);
              router.back();
            }}
            style={{ paddingVertical: 10 }}>
            <Body size={13.5} weight={600} color={accent}>
              {t('menu.deletePlaylist')}
            </Body>
          </Pressable>
        </View>
      )}

      <View style={{ height: 20 }} />
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <Backdrop cover={playlist.cover ?? null} color={art.a} />
      <FlatList
        {...chromeScroll}
        data={tracks}
        keyExtractor={(t) => t.id}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState compact icon={<Play size={26} color={T.full} />} title={t('playlist.empty')}>
            {t('playlist.empty.body')}
          </EmptyState>
        }
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingBottom: Math.max(CHROME_HEIGHT + insets.bottom, keyboard + 24),
          paddingHorizontal: PADDING,
        }}
        /*
          Duas linhas para dois modos.

          Fora da edição vale a `TrackRow` de sempre, com os gestos de enfileirar e de
          mandar para outra lista. Em edição vale a linha da fila: mais baixa, com o × e
          com o pegador de arraste. Trocar a linha inteira em vez de pendurar um pegador
          na `TrackRow` evita dois gestos de arraste disputando o mesmo dedo — o dela é
          horizontal, o de reordenar é vertical, e conviver custaria mais do que separar.

          A posição vem de `playlist.trackIds`, não de `tracks`: uma faixa que sumiu numa
          varredura nova não aparece na lista, e mover pelo índice do que está visível
          reordenaria a entrada errada.
        */
        renderItem={({ item, index }) =>
          editing ? (
            <QueueRow
              track={item}
              at={index}
              count={tracks.length}
              activeAt={activeAt}
              targetAt={targetAt}
              onPress={() => play(tracks, index)}
              onRemove={() => removeTrack(playlist.id, item.id)}
              onMove={(from, to) =>
                moveTrack(playlist.id, playlist.trackIds.indexOf(tracks[from].id), positionOf(playlist, tracks, to))
              }
            />
          ) : (
            <TrackRow
              track={item}
              position={index + 1}
              accent={accent}
              onPress={() => play(tracks, index)}
              onLongPress={() => openMenu({ kind: 'track', track: item })}
              onQueue={() => enqueueLast([item])}
              onPlaylist={() => open([item.id])}
            />
          )
        }
      />
      {sheet}
      {menu}
    </View>
  );
}

/**
 * Onde a faixa cai em `trackIds`, dado o índice dela na lista visível.
 *
 * Os dois só coincidem quando toda faixa da lista existe na biblioteca. Depois de uma
 * varredura que perdeu arquivos eles se descolam, e mover pelo índice visível moveria a
 * entrada errada — ou, no fim da lista, jogaria a faixa antes das que sumiram.
 */
function positionOf(
  playlist: Playlist,
  visible: { id: string }[],
  to: number
): number {
  const target = visible[to];
  return target ? playlist.trackIds.indexOf(target.id) : playlist.trackIds.length - 1;
}

/** Embaralha sem mutar, como na tela de álbum. */
function shuffled<T>(items: T[]): T[] {
  return items
    .map((item) => ({ item, key: Math.random() }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.item);
}
