import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlbumArt } from '@/components/album-art';
import { EmptyState } from '@/components/empty-state';
import { ChevronLeft, Play, Plus, Shuffle } from '@/components/icons';
import { Body, Display, Mono } from '@/components/text';
import { TrackRow } from '@/components/track-row';
import { C, CHROME_HEIGHT, PADDING, T, alpha, fmt } from '@/constants/theme';
import { artworkFor } from '@/lib/artwork';
import { useLibrary } from '@/lib/library';
import { usePlayer } from '@/lib/player';
import { usePlaylists, type Playlist } from '@/lib/playlists';
import { usePlaylistSheet } from '@/components/playlist-sheet';
import { usePrefs } from '@/lib/prefs';

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { byId } = usePlaylists();

  const playlist = byId(id);
  if (!playlist) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Body size={14} color={T.t5}>
          Lista não encontrada.
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
  const { rename, remove, removeTrack, pickCover, clearCover } = usePlaylists();
  const { open, sheet } = usePlaylistSheet();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(playlist.name);

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
            {editing ? 'Pronto' : 'Editar'}
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
                {playlist.cover ? 'Trocar capa' : 'Escolher capa'}
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
          {tracks.length} FAIXAS · {fmt(total).replace(':', 'M ')}S
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
              Tocar
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
                Remover a capa
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
              Apagar esta lista
            </Body>
          </Pressable>
        </View>
      )}

      <View style={{ height: 20 }} />
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 420,
          opacity: 0.4,
          experimental_backgroundImage: `radial-gradient(100% 80% at 50% 0%, ${art.a} 0%, transparent 68%)`,
        }}
      />
      <FlatList
        data={tracks}
        keyExtractor={(t) => t.id}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState compact icon={<Play size={26} color={T.full} />} title="Lista vazia">
            Segure uma faixa em qualquer tela do app para jogá-la aqui.
          </EmptyState>
        }
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingBottom: CHROME_HEIGHT + insets.bottom,
          paddingHorizontal: PADDING,
        }}
        renderItem={({ item, index }) => (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <TrackRow
                track={item}
                position={index + 1}
                accent={accent}
                onPress={() => play(tracks, index)}
                onLongPress={() => open([item.id])}
                onQueue={() => enqueueLast([item])}
                onPlaylist={() => open([item.id])}
              />
            </View>
            {editing && (
              <Pressable
                onPress={() => removeTrack(playlist.id, item.id)}
                hitSlop={10}
                style={{ paddingHorizontal: 12 }}>
                <Body size={20} color={T.t5}>
                  ×
                </Body>
              </Pressable>
            )}
          </View>
        )}
      />
      {sheet}
    </View>
  );
}

/** Embaralha sem mutar, como na tela de álbum. */
function shuffled<T>(items: T[]): T[] {
  return items
    .map((item) => ({ item, key: Math.random() }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.item);
}
