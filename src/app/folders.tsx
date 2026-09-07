import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlbumArt } from '@/components/album-art';
import { EmptyState } from '@/components/empty-state';
import { ChevronLeft, ChevronRight, FolderNav, FolderPlus } from '@/components/icons';
import { useItemMenu } from '@/components/context-menu';
import { usePlaylistSheet } from '@/components/playlist-sheet';
import { Body, Display, Mono } from '@/components/text';
import { TrackRow } from '@/components/track-row';
import { CHROME_HEIGHT, PADDING, R, T, alpha, fmt } from '@/constants/theme';
import { artworkFor } from '@/lib/artwork';
import { useLibrary } from '@/lib/library';
import { usePlayer } from '@/lib/player';
import { usePrefs } from '@/lib/prefs';
import type { Track } from '@/lib/scan';
import { canBrowseFolders, displayPath, pickFolder } from '@/lib/sources';
import { chromeScroll } from '@/lib/chrome-scroll';

type Open = { path: string; name: string; tracks: Track[] };

export default function FoldersScreen() {
  const insets = useSafeAreaInsets();
  const { folders } = useLibrary();
  const { accent, grantFolder } = usePrefs();
  const { play, enqueueLast } = usePlayer();
  const { open: openSheet, sheet } = usePlaylistSheet();
  const { open: openMenu, menu } = useItemMenu();
  // Abrir uma pasta troca o conteúdo desta mesma tela: não vale uma rota só para isso.
  const [open, setOpen] = useState<Open | null>(null);

  const add = async () => {
    const uri = await pickFolder();
    if (uri) grantFolder(uri);
  };

  const top = insets.top + 24;
  const bottom = CHROME_HEIGHT + insets.bottom;

  if (open) {
    return (
      <View style={{ flex: 1 }}>
        <FlatList
          {...chromeScroll}
          data={open.tracks}
          keyExtractor={(t) => t.id}
          ListHeaderComponent={
            <View style={{ marginBottom: 8 }}>
              <Pressable
                onPress={() => setOpen(null)}
                hitSlop={8}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingVertical: 8,
                }}>
                <ChevronLeft size={15} />
                <Body size={13.5} weight={500} color={T.t5}>
                  Todas as pastas
                </Body>
              </Pressable>
              <Display size={27} tracking={-0.035} style={{ marginTop: 8 }} numberOfLines={2}>
                {open.name}
              </Display>
              <Mono size={10.5} color="rgba(246,241,234,.38)" numberOfLines={1} style={{ marginTop: 6 }}>
                {displayPath(open.path)}
              </Mono>
              <Body size={12.5} color={T.t42} style={{ marginTop: 6 }}>
                {open.tracks.length} faixas ·{' '}
                {fmt(open.tracks.reduce((n, t) => n + (t.duration ?? 0), 0))}
              </Body>
            </View>
          }
          contentContainerStyle={{ paddingTop: top, paddingBottom: bottom, paddingHorizontal: PADDING }}
          renderItem={({ item, index }) => (
            <TrackRow
              track={item}
              position={index + 1}
              accent={accent}
              onPress={() => play(open.tracks, index)}
              onLongPress={() => openMenu({ kind: 'track', track: item })}
              onQueue={() => enqueueLast([item])}
              onPlaylist={() => openSheet([item.id])}
              subtitle={[item.artist, item.album].filter(Boolean).join(' · ')}
            />
          )}
        />
        {sheet}
      {menu}
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        {...chromeScroll}
        data={folders}
        keyExtractor={(f) => f.path}
        ListHeaderComponent={
          <View style={{ marginBottom: 8 }}>
            <Display size={33} tracking={-0.035}>
              Pastas
            </Display>
            <Body size={12.5} color={T.t42} style={{ marginTop: 7 }}>
              {folders.length} {folders.length === 1 ? 'pasta' : 'pastas'} com música
            </Body>

            {canBrowseFolders && (
              <Pressable
                onPress={add}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  marginTop: 18,
                  paddingVertical: 13,
                  paddingHorizontal: 15,
                  borderRadius: R.r15,
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: alpha(accent, 0.4),
                }}>
                <FolderPlus color={accent} />
                <Body size={13.5} weight={500} color={T.t72} style={{ flex: 1 }}>
                  Incluir outra pasta…
                </Body>
                <ChevronRight />
              </Pressable>
            )}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon={<FolderNav size={30} color={T.full} />}
            title="Nenhuma pasta com música"
            action={canBrowseFolders ? 'Incluir uma pasta' : undefined}
            onAction={canBrowseFolders ? add : undefined}>
            A varredura não achou áudio em lugar nenhum do aparelho.
          </EmptyState>
        }
        contentContainerStyle={{ paddingTop: top, paddingBottom: bottom, paddingHorizontal: PADDING }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setOpen(item)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 13,
              paddingVertical: 10,
            }}>
            <AlbumArt art={artworkFor(item.name, item.path)} size={52} radius={14} detail="ring" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Body size={14.5} weight={600} tracking={-0.01} numberOfLines={1}>
                {item.name}
              </Body>
              <Mono size={10.5} color="rgba(246,241,234,.38)" numberOfLines={1} style={{ marginTop: 2 }}>
                {displayPath(item.path)}
              </Mono>
              <Body size={11.5} color={T.t42} style={{ marginTop: 2 }}>
                {item.tracks.length} faixas
              </Body>
            </View>
            <ChevronRight />
          </Pressable>
        )}
      />
    </View>
  );
}
