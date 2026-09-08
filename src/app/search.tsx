import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInLeft,
  FadeOut,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
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
import { useDetail } from '@/lib/detail';
import { useLibrary } from '@/lib/library';
import { usePlayer } from '@/lib/player';
import { usePrefs, useT } from '@/lib/prefs';
import { useItemMenu } from '@/components/context-menu';
import { usePlaylistSheet } from '@/components/playlist-sheet';
import { useZoomLaunch } from '@/lib/zoom';
import { isEmpty, search } from '@/lib/search';
import { chromeScroll } from '@/lib/chrome-scroll';
import { useKeyboardOverlap } from '@/lib/keyboard';
import type { Album } from '@/lib/scan';

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const { library, artists } = useLibrary();
  const { accent } = usePrefs();
  const t = useT();
  const { play, enqueueLast } = usePlayer();
  const { open, sheet } = usePlaylistSheet();
  const { open: openMenu, menu } = useItemMenu();
  const [query, setQuery] = useState('');
  /*
    A tela abre com o campo focado, e no Android edge-to-edge a janela não encolhe mais
    quando o teclado sobe: sem reservar a altura dele aqui, os últimos resultados nascem
    atrás do teclado e não há rolagem que os alcance.
  */
  const keyboard = useKeyboardOverlap();

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
  /*
    Rampa, e não mola: `grew` dirige uma **altura de layout**, e mola com razão de
    amortecimento abaixo de 1 passa do alvo. Media: a barra de busca subia até 137 px,
    voltava para 157 e parava — a página inteira dava um pulo para cima e caía de volta
    quando os resultados apareciam. Uma rampa monótona sobe uma vez e fica.
  */
  useEffect(() => {
    grew.value = withTiming(typed ? 1 : 0, COLLAPSE);
  }, [typed, grew]);

  const titleStyle = useAnimatedStyle(() => ({
    // 'clamp' porque altura negativa não existe: se algum dia isto voltar a passar do
    // alvo, ele para em zero em vez de arrastar o layout junto.
    height: interpolate(grew.value, [0, 1], [46, 0], 'clamp'),
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
            {t('search.title')}
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
            placeholder={t('search.placeholder')}
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
                  {t('search.clear')}
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
          // Com o teclado aberto a barra inferior está atrás dele: o espaço dela não
          // precisa ser somado, só o que for maior dos dois.
          paddingBottom: Math.max(CHROME_HEIGHT + insets.bottom, keyboard + 24),
          paddingHorizontal: PADDING,
        }}>
        {!typed && (
          <EmptyState icon={<SearchIcon size={30} color={T.full} />} title={t('search.prompt')}>
            {t('search.prompt.body')}
          </EmptyState>
        )}

        {typed && isEmpty(results) && (
          <EmptyState icon={<SearchIcon size={30} color={T.full} />} title={t('search.none')}>
            {t('search.none.body', { query: query.trim() })}
          </EmptyState>
        )}

        {results.albums.length > 0 && (
          <View>
            <SectionLabel title={t('tab.albums')} />
            {results.albums.map((album, index) => (
              <Animated.View key={album.id} entering={found(index)}>
                <AlbumResult
                  album={album}
                  onLongPress={() => openMenu({ kind: 'album', album })}
                />
              </Animated.View>
            ))}
          </View>
        )}

        {results.artists.length > 0 && (
          <View>
            <SectionLabel title={t('tab.artists')} />
            {results.artists.map((artist, index) => (
              <Animated.View key={artist} entering={found(index)}>
                <ArtistResult
                  name={artist}
                  cover={
                    artists.find((a) => a.name === artist)?.albums.find((al) => al.cover)
                      ?.cover ?? null
                  }
                  onLongPress={() =>
                    openMenu({
                      kind: 'artist',
                      name: artist,
                      albums: artists.find((a) => a.name === artist)?.albums ?? [],
                    })
                  }
                />
              </Animated.View>
            ))}
          </View>
        )}

        {results.tracks.length > 0 && (
          <View>
            <SectionLabel title={t('tab.tracks')} />
            {results.tracks.map((track, index) => (
              <Animated.View key={track.id} entering={found(index)}>
                <TrackRow
                  track={track}
                  position={index + 1}
                  accent={accent}
                  onPress={() => play(results.tracks, index)}
                  onLongPress={() => openMenu({ kind: 'track', track })}
                  onQueue={() => enqueueLast([track])}
                  onPlaylist={() => open([track.id])}
                />
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>
      {sheet}
      {menu}
    </View>
  );
}

/** A capa do resultado é a origem do zoom, como na grade da biblioteca. */
function AlbumResult({ album, onLongPress }: { album: Album; onLongPress?: () => void }) {
  const { openAlbum } = useDetail();
  const { ref, launch, style: originStyle } = useZoomLaunch(14);
  return (
    <Pressable
      onPress={() => launch(() => openAlbum(album.id))}
      onLongPress={onLongPress}
      delayLongPress={280}
      style={row}>
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
function ArtistResult({
  name,
  cover,
  onLongPress,
}: {
  name: string;
  cover: string | null;
  onLongPress?: () => void;
}) {
  const { openArtist } = useDetail();
  const { ref, launch, style: originStyle } = useZoomLaunch(26);
  return (
    <Pressable
      onPress={() => launch(() => openArtist(name))}
      onLongPress={onLongPress}
      delayLongPress={280}
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

/**
 * Entrada de um resultado, na própria linha e vindo da esquerda.
 *
 * Antes era um `FadeInDown` no bloco de cada seção. Digitar uma letra podia esvaziar uma
 * seção e repovoar outra: o bloco remontava e descia de novo inteiro, e era esse o
 * movimento vertical que a lista fazia a cada tecla. Na linha, e com o id como chave,
 * quem já está na tela não remonta — anima só o que acabou de casar com a busca. Da
 * esquerda porque `translateX` não desloca o layout de ninguém.
 */
const found = (index: number) => FadeInLeft.duration(200).delay(Math.min(index, 8) * 20);

/** Recolhimento do título. Ease-out: sai rápido e encosta, sem repique. */
const COLLAPSE = { duration: 240, easing: Easing.out(Easing.cubic) };


