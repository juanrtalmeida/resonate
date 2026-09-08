/**
 * Mini player + navegação, numa peça só. É um overlay sobre o <Stack>, não uma tab bar
 * do router.
 *
 * Duas peças que se movem como uma: o cartão do player, de largura cheia, e a pílula de
 * navegação centrada embaixo dele.
 *
 * Rolando a página para baixo a pílula recolhe para altura zero e o destino ativo
 * reaparece como um disco à esquerda do player. Sobra tela para o conteúdo, e continua
 * dando para voltar: tocar no disco reabre a barra.
 *
 * Sem faixa tocando não há colapso. A pílula é a única navegação que existe na tela;
 * recolhê-la sem ter o disco do player ao lado deixaria o usuário sem saída.
 */

import { usePathname, useRouter } from 'expo-router';
import { useDeferredValue, useEffect, type ReactNode } from 'react';
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

import { C, R, T } from '@/constants/theme';
import { artworkFor } from '@/lib/artwork';
import {
  chromeCollapsed,
  chromeExpand,
  chromeReveal,
  chromeSettle,
} from '@/lib/chrome-scroll';
import { useDetail } from '@/lib/detail';
import { useLibrary } from '@/lib/library';
import { usePlayer } from '@/lib/player';
import { usePrefs, useT } from '@/lib/prefs';
import { tabTop } from '@/lib/tab-top';
import { useZoomLaunch } from '@/lib/zoom';
import { AlbumArt } from './album-art';
import { EqBars } from './eq-bars';
import {
  LibraryIcon,
  Pause,
  Play,
  SearchNav,
  SettingsNav,
} from './icons';
import { Body } from './text';

/** O rótulo é chave de tradução, resolvida no render — ver `lib/i18n.ts`. */
const NAV = [
  { key: 'Library', label: 'nav.library', Icon: LibraryIcon, href: '/library' },
  { key: 'Search', label: 'nav.search', Icon: SearchNav, href: '/search' },
  { key: 'Settings', label: 'nav.settings', Icon: SettingsNav, href: '/settings' },
] as const;

/** Altura da pílula: 42 do item, mais 5 de recuo de cada lado e a borda. */
const NAV_HEIGHT = 54;

/**
 * Última aba de verdade que o usuário abriu.
 *
 * Álbum, artista e lista são detalhes empilhados *sobre* uma aba, não abas. Derivando o
 * destino aceso só do pathname, abrir um artista vindo da Busca acendia Biblioteca — o
 * `else` da cadeia — e a pílula trocava de destino na entrada e trocava de volta na
 * saída, com as molas dos rótulos correndo duas vezes em cima da transição de zoom.
 *
 * Vive num módulo, e não em estado, porque a Chrome tem duas instâncias que se alternam:
 * a do root e a de dentro da tela `transparentModal`. Um `useState` morreria exatamente
 * na troca que ele precisaria sobreviver — mesma razão de `chrome-scroll.ts`.
 */
let lastBase = 'Library';

/** O destino que este caminho acende, ou null se ele for uma tela de detalhe. */
function baseOf(pathname: string): string | null {
  if (pathname.startsWith('/settings')) return 'Settings';
  if (pathname.startsWith('/search')) return 'Search';
  if (pathname.startsWith('/library')) return 'Library';
  return null;
}

/**
 * A barra inferior. **Uma instância**, no layout raiz, montada uma vez.
 *
 * Houve uma segunda, renderizada de dentro das telas de álbum e de artista, porque elas
 * eram `transparentModal` — janela nativa própria no Android, acima da janela do root, que
 * a barra do root não alcançava. Duas posições da árvore são duas instâncias: a cada abrir
 * e fechar o mini player desmontava de um lado e remontava do outro, e a thread de JS
 * travava 547 ms depois de fechar, perdendo o toque desse vão.
 *
 * Aquelas telas viraram camadas deste mesmo layout (`lib/detail.tsx`), e o problema foi
 * embora na origem em vez de ser aparado.
 */
export function Chrome() {
  const pathname = usePathname();
  const { track } = usePlayer();
  const insets = useSafeAreaInsets();

  // Tela nova começa no topo, e a barra com ela.
  useEffect(() => {
    chromeExpand();
  }, [pathname]);

  // Detalhe não é aba: só um caminho de aba move o destino aceso.
  const base = baseOf(pathname);
  useEffect(() => {
    if (base) lastBase = base;
  }, [base]);

  /*
    O player não aparece nesta lista porque não é rota: é camada, desenhada acima desta
    barra. A barra fica montada embaixo dele — é o que dá à capa um lugar para pousar ao
    minimizar — e apaga por `chromeReveal`, dirigido pelo progresso do zoom do player.
  */
  const visible =
    pathname.startsWith('/library') ||
    pathname.startsWith('/search') ||
    pathname.startsWith('/playlist') ||
    pathname.startsWith('/settings');

  if (!visible) return null;

  // Numa tela de detalhe fica aceso o destino de onde ela foi aberta.
  const active = base ?? lastBase;

  return (
    <Reveal insets={insets}>
      <Bar active={active} hasTrack={!!track} />
    </Reveal>
  );
}

/**
 * A moldura da barra, com a opacidade que o Now Playing dirige.
 *
 * `pointerEvents` desliga junto: apagada, a barra não pode continuar recebendo toque
 * embaixo do player.
 */
function Reveal({
  insets,
  children,
}: {
  insets: { bottom: number };
  children: ReactNode;
}) {
  const reveal = useAnimatedStyle(() => ({
    opacity: chromeReveal.value,
    pointerEvents: chromeReveal.value < 0.5 ? 'none' : 'box-none',
  }));

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          // Acima das camadas de álbum e artista: elas cobrem a tela inteira e, sem isto,
          // ficavam com o toque mesmo com a barra desenhada por cima.
          zIndex: 30,
          paddingHorizontal: 14,
          // O inset já reserva a barra de gestos; o que se somava além dele era vão puro.
          paddingBottom: Math.max(insets.bottom, 16) + 4,
          paddingTop: 40,
          experimental_backgroundImage: `linear-gradient(180deg, transparent 0%, rgba(14,12,11,.9) 32%, ${C.surface} 60%)`,
        },
        reveal,
      ]}>
      {children}
    </Animated.View>
  );
}

/** O player em cima, a pílula embaixo — e a pílula recolhendo sob ele. */
function Bar({ active, hasTrack }: { active: string; hasTrack: boolean }) {
  // Sem faixa, o colapso é desligado na origem em vez de espalhar `if` pelos estilos.
  const collapse = useDerivedValue(() => (hasTrack ? chromeCollapsed.value : 0));

  /*
    O mini player monta em prioridade baixa.

    A instância da barra troca a cada abrir e fechar de álbum ou artista, e montar este
    subárvore — capa com gradientes, barras de equalizador animadas, gesto de arraste — era
    o grosso dos 547 ms de thread travada depois de fechar. `useDeferredValue` põe o mount
    num segundo passe que o React agenda em prioridade baixa, e que ele pode ceder a quem
    estiver animando. A pílula de navegação aparece no primeiro passe, então a barra nunca
    fica vazia.
  */
  const withPlayer = useDeferredValue(hasTrack, false);

  const nav = useAnimatedStyle(() => ({
    height: (1 - collapse.value) * NAV_HEIGHT,
    marginTop: (1 - collapse.value) * 13,
    opacity: 1 - collapse.value,
  }));

  return (
    <View>
      {withPlayer && <MiniPlayer active={active} collapse={collapse} />}
      <Animated.View style={[{ overflow: 'hidden', alignItems: 'center' }, nav]}>
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
  const { track, playing, toggle, duration, elapsed } = usePlayer();
  const { accent } = usePrefs();
  const { albumById } = useLibrary();
  const { openPlayer: open } = useDetail();

  const art = artworkFor(track!.artist, track!.album);
  const cover = albumById(track!.albumId)?.cover ?? null;

  // O mini player fica montado o tempo todo. Com o tempo em estado do React ele
  // re-renderizava cinco vezes por segundo, em toda tela do app, só para mover 2 px de
  // barra. Aqui a barra anda na thread de UI e o React não é acordado.
  const bar = useAnimatedStyle(() => ({
    width: `${(duration > 0 ? Math.min(1, elapsed.value / duration) : 0) * 100}%`,
  }));

  // A capa é o que viaja até o Now Playing — não o cartão inteiro.
  const { ref, launch, style: originStyle } = useZoomLaunch(12);

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

  /*
    A barra assenta antes de medir: a origem do voo tem de ser onde a capa vai *pousar*,
    e não onde ela está com a barra recolhida — ver `chromeSettle`.
  */
  const openPlayer = () => {
    chromeSettle();
    launch(open);
  };

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
        style={[{ marginRight: 12 }, breathing, originStyle]}>
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
        <Animated.View style={[{ height: 2, backgroundColor: accent }, bar]} />
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
  const t = useT();
  const { closeAll } = useDetail();

  // Só o item ativo abre o rótulo — a largura anima de 0 a 78, como no design.
  //
  // `mass: 1` explícito: o padrão do withSpring no Reanimated 4 traz mass 4, e sem dizer
  // isto a razão de amortecimento caía para 0,45 — o rótulo passava dos 78 e voltava, com
  // a pílula balançando atrás dele. Ver a nota em `05-design-system.md`.
  const open = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    open.value = withSpring(active ? 1 : 0, { damping: 26, mass: 1, stiffness: 180 });
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
      /*
        No destino que já está aberto o toque não navega: ele desfaz o que está por cima.

        `router.replace` para a mesma rota não faz nada — nem fecha a camada de álbum ou de
        artista, que não são rotas, nem devolve a lista ao topo. Era o toque que parecia
        morto quando já se estava na Biblioteca.
      */
      onPress={() => {
        if (active) {
          closeAll();
          tabTop(item.key);
          return;
        }
        if (item.href) router.replace(item.href);
      }}
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
          {t(item.label)}
        </Body>
      </Animated.View>
    </Pressable>
  );
}
