import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlbumArt } from '@/components/album-art';
import { Search as SearchIcon } from '@/components/icons';
import { EmptyState } from '@/components/empty-state';
import { SectionLabel } from '@/components/section-label';
import { Body, Display } from '@/components/text';
import { TrackRow } from '@/components/track-row';
import { C, CHROME_HEIGHT, PADDING, R, T } from '@/constants/theme';
import { artworkFor } from '@/lib/artwork';
import { useLibrary } from '@/lib/library';
import { usePlayer } from '@/lib/player';
import { usePrefs } from '@/lib/prefs';
import { usePlaylistSheet } from '@/components/playlist-sheet';
import { useZoomLaunch } from '@/lib/zoom';
import { isEmpty, search } from '@/lib/search';
import { chromeScroll } from '@/lib/chrome-scroll';

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { library, artists } = useLibrary();
  const { accent } = usePrefs();
  const { play, enqueueLast } = usePlayer();
  const { open, sheet } = usePlaylistSheet();
  const [query, setQuery] = useState('');

  const results = useMemo(
    () => search(query, library?.tracks ?? [], library?.albums ?? []),
    [query, library]
  );

  const typed = query.trim().length > 0;

  return (
    <View style={{ flex: 1, paddingTop: insets.top + 24 }}>
      <View style={{ paddingHorizontal: PADDING }}>
        <Display size={33} tracking={-0.035}>
          Busca
        </Display>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            marginTop: 16,
            paddingHorizontal: 14,
            height: 48,
            borderRadius: R.r15,
            backgroundColor: C.card,
            borderWidth: 1,
            borderColor: typed ? T.t14 : T.t07,
          }}>
          <SearchIcon color={typed ? accent : T.t4} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCorrect={false}
            placeholder="Faixa, álbum ou artista"
            placeholderTextColor={T.t34}
            selectionColor={accent}
            returnKeyType="search"
            style={{
              flex: 1,
              color: T.full,
              fontFamily: 'FamiljenGrotesk_500Medium',
              fontSize: 15.5,
              padding: 0,
            }}
          />
          {typed && (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <Body size={12.5} color={T.t5}>
                limpar
              </Body>
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        {...chromeScroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{
          paddingBottom: CHROME_HEIGHT + insets.bottom,
          paddingHorizontal: PADDING,
        }}>
        {!typed && (
          <EmptyState icon={<SearchIcon size={30} color={T.full} />} title="O que você procura?">
            Busque por uma faixa, um álbum ou um artista da sua biblioteca.
          </EmptyState>
        )}

        {typed && isEmpty(results) && (
          <EmptyState icon={<SearchIcon size={30} color={T.full} />} title="Nada encontrado">
            {`Nenhum resultado para “${query.trim()}”.`}
          </EmptyState>
        )}

        {results.albums.length > 0 && (
          <>
            <SectionLabel title="Álbuns" />
            {results.albums.map((album) => (
              <Pressable
                key={album.id}
                onPress={() => router.push(`/album/${album.id}`)}
                style={row}>
                <AlbumArt
                  art={artworkFor(album.artist, album.title)}
                  size={52}
                  radius={14}
                  detail="ring"
                  cover={album.cover}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Body size={14.5} weight={600} tracking={-0.01} numberOfLines={1}>
                    {album.title}
                  </Body>
                  <Body size={11.5} color={T.t42} numberOfLines={1} style={{ marginTop: 2 }}>
                    {album.artist} · {album.trackIds.length} faixas
                  </Body>
                </View>
              </Pressable>
            ))}
          </>
        )}

        {results.artists.length > 0 && (
          <>
            <SectionLabel title="Artistas" />
            {results.artists.map((artist) => (
              <ArtistResult
                key={artist}
                name={artist}
                cover={
                  artists.find((a) => a.name === artist)?.albums.find((al) => al.cover)?.cover ??
                  null
                }
              />
            ))}
          </>
        )}

        {results.tracks.length > 0 && (
          <>
            <SectionLabel title="Faixas" />
            <View>
              {results.tracks.map((track, index) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  position={index + 1}
                  accent={accent}
                  onPress={() => play(results.tracks, index)}
                  onLongPress={() => open([track.id])}
                  onQueue={() => enqueueLast([track])}
                  onPlaylist={() => open([track.id])}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>
      {sheet}
    </View>
  );
}

/** Mesma origem de zoom da aba Artistas. */
function ArtistResult({ name, cover }: { name: string; cover: string | null }) {
  const router = useRouter();
  const { ref, launch } = useZoomLaunch(26);
  return (
    <Pressable
      onPress={() => launch(() => router.push(`/artist/${encodeURIComponent(name)}`))}
      style={row}>
      <View ref={ref} collapsable={false}>
        <AlbumArt art={artworkFor(name, '')} size={52} radius={26} detail="ring" cover={cover} />
      </View>
      <Body size={14.5} weight={600} tracking={-0.01} numberOfLines={1}>
        {name}
      </Body>
    </Pressable>
  );
}

const row = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 13,
  paddingVertical: 10,
};


