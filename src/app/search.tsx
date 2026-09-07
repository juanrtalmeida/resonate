import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlbumArt } from '@/components/album-art';
import { Search as SearchIcon } from '@/components/icons';
import { EmptyState } from '@/components/empty-state';
import { SectionLabel } from '@/components/section-label';
import { Body, Display } from '@/components/text';
import { TrackRow } from '@/components/track-row';
import { C, CHROME_HEIGHT, PADDING, R, T, alpha } from '@/constants/theme';
import { artworkFor } from '@/lib/artwork';
import { useLibrary } from '@/lib/library';
import { usePlayer } from '@/lib/player';
import { usePrefs } from '@/lib/prefs';
import { usePlaylistSheet } from '@/components/playlist-sheet';
import { useZoomLaunch } from '@/lib/zoom';
import { isEmpty, search } from '@/lib/search';
import { chromeScroll } from '@/lib/chrome-scroll';
import type { Album } from '@/lib/scan';

export default function SearchScreen() {
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
  const [focused, setFocused] = useState(false);

  /**
   * Duas animações, dois estados: o foco acende a barra, e digitar recolhe o título para
   * dar a tela aos resultados. Separadas porque o campo abre já focado — se o título
   * saísse no foco, ninguém veria ele sair.
   */
  const lit = useSharedValue(0);
  const grew = useSharedValue(0);
  useEffect(() => {
    lit.value = withTiming(focused ? 1 : 0, { duration: 240 });
  }, [focused, lit]);
  useEffect(() => {
    grew.value = withSpring(typed ? 1 : 0, { damping: 20, stiffness: 190 });
  }, [typed, grew]);

  const titleStyle = useAnimatedStyle(() => ({
    height: interpolate(grew.value, [0, 1], [46, 0]),
    opacity: 1 - grew.value,
    transform: [
      { translateY: -12 * grew.value },
      { scale: 1 - 0.1 * grew.value },
    ],
    transformOrigin: 'left center',
  }));

  // Fora do worklet: a cor não muda a cada quadro, só quando o acento muda.
  const litBorder = alpha(accent, 0.55);
  const barStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(lit.value, [0, 1], [T.t07, litBorder]),
    backgroundColor: interpolateColor(lit.value, [0, 1], [C.card, C.raised]),
    transform: [{ scale: 1 + lit.value * 0.012 }],
  }));

  // Um halo do acento por baixo da barra: acende no foco e some no blur.
  const haloStyle = useAnimatedStyle(() => ({ opacity: lit.value * 0.55 }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + lit.value * 0.12 }],
  }));

  return (
    <View style={{ flex: 1, paddingTop: insets.top + 24 }}>
      <View style={{ paddingHorizontal: PADDING }}>
        <Animated.View style={titleStyle}>
          <Display size={33} tracking={-0.035}>
            Busca
          </Display>
        </Animated.View>

        <View style={{ marginTop: 16 }}>
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: -10,
              right: -10,
              top: -10,
              bottom: -10,
              borderRadius: R.r21,
              experimental_backgroundImage: `radial-gradient(70% 120% at 50% 50%, ${alpha(accent, 0.22)} 0%, transparent 70%)`,
            },
            haloStyle,
          ]}
        />
        <Animated.View
          style={[
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 14,
              height: 48,
              borderRadius: R.r15,
              borderWidth: 1,
            },
            barStyle,
          ]}>
          <Animated.View style={iconStyle}>
            <SearchIcon color={typed || focused ? accent : T.t4} />
          </Animated.View>
          <TextInput
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
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
            <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)}>
              <Pressable onPress={() => setQuery('')} hitSlop={10}>
                <Body size={12.5} color={T.t5}>
                  limpar
                </Body>
              </Pressable>
            </Animated.View>
          )}
        </Animated.View>
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
          <Animated.View entering={FadeInDown.duration(240)}>
            <SectionLabel title="Álbuns" />
            {results.albums.map((album) => (
              <AlbumResult key={album.id} album={album} />
            ))}
          </Animated.View>
        )}

        {results.artists.length > 0 && (
          <Animated.View entering={FadeInDown.duration(240).delay(60)}>
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
          </Animated.View>
        )}

        {results.tracks.length > 0 && (
          <Animated.View entering={FadeInDown.duration(240).delay(120)}>
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
          </Animated.View>
        )}
      </ScrollView>
      {sheet}
    </View>
  );
}

/** A capa do resultado é a origem do zoom, como na grade da biblioteca. */
function AlbumResult({ album }: { album: Album }) {
  const router = useRouter();
  const { ref, launch, style: originStyle } = useZoomLaunch(14);
  return (
    <Pressable onPress={() => launch(() => router.push(`/album/${album.id}`))} style={row}>
      <View ref={ref} collapsable={false} style={originStyle}>
        <AlbumArt
          art={artworkFor(album.artist, album.title)}
          size={52}
          radius={14}
          detail="ring"
          cover={album.cover}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Body size={14.5} weight={600} tracking={-0.01} numberOfLines={1}>
          {album.title}
        </Body>
        <Body size={11.5} color={T.t42} numberOfLines={1} style={{ marginTop: 2 }}>
          {album.artist} · {album.trackIds.length} faixas
        </Body>
      </View>
    </Pressable>
  );
}

/** Mesma origem de zoom da aba Artistas. */
function ArtistResult({ name, cover }: { name: string; cover: string | null }) {
  const router = useRouter();
  const { ref, launch, style: originStyle } = useZoomLaunch(26);
  return (
    <Pressable
      onPress={() => launch(() => router.push(`/artist/${encodeURIComponent(name)}`))}
      style={row}>
      <View ref={ref} collapsable={false} style={originStyle}>
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


