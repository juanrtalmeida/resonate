/**
 * Mini player + navegação em pílula. É um overlay sobre o <Stack>, não uma tab bar do
 * router — o design desenha os dois como uma peça só, flutuando sobre a tela.
 */

import { usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, R, T } from '@/constants/theme';
import { artworkFor } from '@/lib/artwork';
import { useLibrary } from '@/lib/library';
import { useElapsed, usePlayer } from '@/lib/player';
import { usePrefs } from '@/lib/prefs';
import { useZoomLaunch } from '@/lib/zoom';
import { AlbumArt } from './album-art';
import { EqBars } from './eq-bars';
import {
  FolderNav,
  LibraryIcon,
  Pause,
  Play,
  SearchNav,
  SettingsNav,
} from './icons';
import { Body } from './text';

const NAV = [
  { key: 'Library', label: 'Biblioteca', Icon: LibraryIcon, href: '/library' },
  { key: 'Search', label: 'Busca', Icon: SearchNav, href: '/search' },
  { key: 'Folders', label: 'Pastas', Icon: FolderNav, href: '/folders' },
  { key: 'Settings', label: 'Ajustes', Icon: SettingsNav, href: '/settings' },
] as const;

export function Chrome() {
  const pathname = usePathname();
  const { track } = usePlayer();
  const insets = useSafeAreaInsets();

  const visible =
    pathname.startsWith('/library') ||
    pathname.startsWith('/album') ||
    pathname.startsWith('/artist') ||
    pathname.startsWith('/search') ||
    pathname.startsWith('/folders') ||
    pathname.startsWith('/playlist') ||
    pathname.startsWith('/settings');
  if (!visible) return null;

  const active = pathname.startsWith('/settings')
    ? 'Settings'
    : pathname.startsWith('/search')
      ? 'Search'
      : pathname.startsWith('/folders')
        ? 'Folders'
        : 'Library';

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 14,
        paddingBottom: Math.max(insets.bottom, 16) + 14,
        paddingTop: 40,
        experimental_backgroundImage: `linear-gradient(180deg, transparent 0%, rgba(14,12,11,.9) 32%, ${C.surface} 60%)`,
      }}>
      {track && <MiniPlayer />}
      <Nav active={active} />
    </View>
  );
}

function MiniPlayer() {
  const router = useRouter();
  const { track, playing, toggle, duration } = usePlayer();
  const { accent } = usePrefs();
  const { albumById } = useLibrary();
  const elapsed = useElapsed();

  const art = artworkFor(track!.artist, track!.album);
  const cover = albumById(track!.albumId)?.cover ?? null;
  const progress = duration > 0 ? Math.min(1, elapsed / duration) : 0;

  // A capa é o que viaja até o Now Playing — não o cartão inteiro.
  const { ref, launch } = useZoomLaunch(12);

  const breathe = useSharedValue(1);
  useEffect(() => {
    if (playing) {
      breathe.value = withRepeat(withTiming(1.045, { duration: 2600 }), -1, true);
    } else {
      cancelAnimation(breathe);
      breathe.value = withTiming(1, { duration: 200 });
    }
  }, [playing, breathe]);
  const breathing = useAnimatedStyle(() => ({ transform: [{ scale: breathe.value }] }));

  const openPlayer = () => launch(() => router.push('/player'));

  // Arrastar o mini player para cima abre o Now Playing, o contrário de arrastá-lo para
  // baixo lá dentro. O toque continua valendo.
  const swipeUp = Gesture.Pan()
    .activeOffsetY([-24, 9999])
    .failOffsetX([-24, 24])
    .onEnd((e) => {
      if (e.translationY < -24 || e.velocityY < -700) runOnJS(openPlayer)();
    });

  return (
    <GestureDetector gesture={swipeUp}>
    <Pressable
      onPress={openPlayer}
      style={{
        borderRadius: 19,
        overflow: 'hidden',
        backgroundColor: 'rgba(30,25,22,.92)',
        borderWidth: 1,
        borderColor: 'rgba(246,241,234,.09)',
        padding: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}>
      <View
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.28,
          experimental_backgroundImage: `radial-gradient(70% 200% at 0% 50%, ${art.a} 0%, transparent 70%)`,
        }}
      />
      <Animated.View ref={ref} collapsable={false} style={breathing}>
        <AlbumArt art={art} size={46} radius={12} detail="ring" cover={cover} />
      </Animated.View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Body size={13.5} weight={600} tracking={-0.01} numberOfLines={1}>
          {track!.title}
        </Body>
        <Body size={11.5} color={T.t5} numberOfLines={1}>
          {track!.artist}
        </Body>
      </View>

      <EqBars color={accent} playing={playing} height={20} />

      <Pressable
        onPress={toggle}
        hitSlop={8}
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: T.t1,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {playing ? <Pause size={14} /> : <Play size={12} />}
      </Pressable>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 2,
          backgroundColor: T.t08,
        }}>
        <View style={{ height: 2, width: `${progress * 100}%`, backgroundColor: accent }} />
      </View>
    </Pressable>
    </GestureDetector>
  );
}

function Nav({ active }: { active: string }) {
  return (
    <View style={{ alignItems: 'center', marginTop: 13 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 3,
          padding: 5,
          borderRadius: R.r26,
          backgroundColor: 'rgba(26,22,20,.94)',
          borderWidth: 1,
          borderColor: T.t1,
        }}>
        {NAV.map((item) => (
          <NavItem key={item.key} item={item} active={item.key === active} />
        ))}
      </View>
    </View>
  );
}

function NavItem({
  item,
  active,
}: {
  item: (typeof NAV)[number];
  active: boolean;
}) {
  const router = useRouter();
  const { accent } = usePrefs();

  // Só o item ativo abre o rótulo — a largura anima de 0 a 78, como no design.
  const open = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    open.value = withSpring(active ? 1 : 0, { damping: 18, stiffness: 160 });
  }, [active, open]);

  const label = useAnimatedStyle(() => ({
    maxWidth: open.value * 78,
    opacity: open.value,
    marginLeft: open.value * 7,
  }));

  const color = active ? C.onAccent : T.t5;
  const disabled = item.href === null;

  return (
    <Pressable
      disabled={disabled}
      onPress={() => item.href && router.replace(item.href)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        height: 42,
        borderRadius: 21,
        overflow: 'hidden',
        paddingHorizontal: active ? 15 : 13,
        backgroundColor: active ? accent : 'transparent',
        opacity: disabled ? 0.35 : 1,
      }}>
      <item.Icon size={21} color={color} />
      <Animated.View style={label}>
        <Body size={13} weight={600} tracking={-0.01} color={color} numberOfLines={1}>
          {item.label}
        </Body>
      </Animated.View>
    </Pressable>
  );
}
