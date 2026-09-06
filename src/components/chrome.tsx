/**
 * Mini player + navegação, numa peça só. É um overlay sobre o <Stack>, não uma tab bar
 * do router.
 *
 * Dois estados. Parado, a barra inteira: o player em cima, os quatro destinos embaixo.
 * Rolando a página para baixo, ela colapsa — a fileira de destinos recolhe para altura
 * zero e o item ativo reaparece como um disco à esquerda do player, ao lado dele. Sobra
 * tela para o conteúdo, e continua dando para voltar: tocar no disco reabre a barra.
 *
 * Sem faixa tocando não há colapso. A fileira de destinos é a única navegação que existe
 * na tela; recolhê-la sem ter o disco do player ao lado deixaria o usuário sem saída.
 */

import { usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, T } from '@/constants/theme';
import { artworkFor } from '@/lib/artwork';
import { chromeCollapsed, chromeExpand } from '@/lib/chrome-scroll';
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

/** Altura da fileira de destinos. É o que a barra economiza ao colapsar. */
const NAV_HEIGHT = 42;

export function Chrome() {
  const pathname = usePathname();
  const { track } = usePlayer();
  const insets = useSafeAreaInsets();

  // Tela nova começa no topo, e a barra com ela.
  useEffect(() => {
    chromeExpand();
  }, [pathname]);

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
      <Bar active={active} hasTrack={!!track} />
    </View>
  );
}

/** O cartão: player em cima, destinos embaixo, um recolhendo sobre o outro. */
function Bar({ active, hasTrack }: { active: string; hasTrack: boolean }) {
  // Sem faixa, o colapso é desligado na origem em vez de espalhar `if` pelos estilos.
  const collapse = useDerivedValue(() => (hasTrack ? chromeCollapsed.value : 0));

  const nav = useAnimatedStyle(() => ({
    height: (1 - collapse.value) * NAV_HEIGHT,
    marginTop: (1 - collapse.value) * 6,
    opacity: 1 - collapse.value,
  }));

  return (
    <View
      style={{
        borderRadius: 24,
        padding: 5,
        backgroundColor: 'rgba(26,22,20,.94)',
        borderWidth: 1,
        borderColor: T.t1,
      }}>
      {hasTrack && <MiniPlayer active={active} collapse={collapse} />}
      <Animated.View style={[{ overflow: 'hidden' }, nav]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
          {NAV.map((item) => (
            <NavItem key={item.key} item={item} active={item.key === active} />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

function MiniPlayer({
  active,
  collapse,
}: {
  active: string;
  collapse: SharedValue<number>;
}) {
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

  // As larguras animam em vez de um `gap` no container: um filho de largura zero ainda
  // custaria o gap, e sobraria um buraco na fileira.
  const chip = useAnimatedStyle(() => ({
    width: collapse.value * 40,
    opacity: collapse.value,
    marginRight: collapse.value * 12,
  }));
  const eq = useAnimatedStyle(() => ({
    width: (1 - collapse.value) * 20,
    opacity: 1 - collapse.value,
    marginRight: (1 - collapse.value) * 12,
  }));

  const ActiveIcon = NAV.find((item) => item.key === active)!.Icon;

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
      }}>
      <View
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.28,
          experimental_backgroundImage: `radial-gradient(70% 200% at 0% 50%, ${art.a} 0%, transparent 70%)`,
        }}
      />
      {/* O destino ativo, colapsado num disco. Tocar nele reabre a barra inteira. */}
      <Animated.View style={[{ height: 40, borderRadius: 20, overflow: 'hidden' }, chip]}>
        <Pressable
          onPress={chromeExpand}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <ActiveIcon size={21} color={C.onAccent} />
        </Pressable>
      </Animated.View>

      <Animated.View
        ref={ref}
        collapsable={false}
        style={[{ marginRight: 12 }, breathing]}>
        <AlbumArt art={art} size={46} radius={12} detail="ring" cover={cover} />
      </Animated.View>

      <View style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
        <Body size={13.5} weight={600} tracking={-0.01} numberOfLines={1}>
          {track!.title}
        </Body>
        <Body size={11.5} color={T.t5} numberOfLines={1}>
          {track!.artist}
        </Body>
      </View>

      <Animated.View style={[{ overflow: 'hidden' }, eq]}>
        <EqBars color={accent} playing={playing} height={20} />
      </Animated.View>

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
