/**
 * As três peças visuais do Now Playing: a fita de seek, a forma de onda e o vinil.
 *
 * ponytail: no protótipo as barras da fita perto do cursor pulsam uma a uma. Seriam 96
 * estilos animados só para um brilho — a fita já desliza, o pulso saiu.
 */

import { useEffect, useMemo, useState } from 'react';
import { Image, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import Svg, { Defs, G, LinearGradient, Mask, Rect, Stop } from 'react-native-svg';

import { T } from '@/constants/theme';
import { artGradient, waveform, type Artwork } from '@/lib/artwork';

const AnimatedG = Animated.createAnimatedComponent(G);

// ------------------------------------------------------------------- fita

const BARS = 96;
const RIBBON_H = 58;
const STEP = 6; // 2.5 de largura + 3.5 de espaço
const SPAN = BARS * STEP - STEP; // 570: o percurso total da fita

export function Ribbon({
  seed,
  progress,
  accent,
  onSeek,
}: {
  seed: string;
  /** 0..1 */
  progress: number;
  accent: string;
  /** Recebe o deslocamento pedido, em fração da duração. */
  onSeek: (delta: number) => void;
}) {
  // O tempo decorrido re-renderiza isto 5x por segundo; as alturas não mudam com ele.
  const heights = useMemo(() => waveform(seed, BARS), [seed]);
  const [width, setWidth] = useState(0);

  const x = useSharedValue(-progress * SPAN);
  useEffect(() => {
    // O tempo chega a cada 200 ms; a interpolação tira o serrilhado.
    x.value = withTiming(-progress * SPAN, { duration: 220, easing: Easing.linear });
  }, [progress, x]);
  /**
   * Anima a `matrix`, não `translateX`.
   *
   * `translateX` em `<G>` é uma prop deprecated que o react-native-svg resolve durante o
   * render; o nó nativo conhece apenas `matrix`. Via `animatedProps` a escrita ia para
   * uma prop que o lado nativo ignora — as barras trocavam de cor (recalculadas em JS a
   * cada render) e a fita nunca saía do lugar.
   *
   * Matriz 2D do SVG: [a, b, c, d, tx, ty].
   */
  const slide = useAnimatedProps(
    () => ({ matrix: [1, 0, 0, 1, x.value, 0] }) as unknown as Record<string, unknown>
  );

  const head = progress * SPAN;

  /**
   * Toque pelo gesture-handler, não por Pressable.
   *
   * A tela do player inteira fica dentro de um Pan (arrastar para minimizar), e ele
   * cancela Pressables do React Native aninhados. Um Tap do próprio gesture-handler
   * convive com o Pan: o Pan só ativa depois de 24 px na vertical.
   */
  const tap = Gesture.Tap().onEnd((e) => {
    // Sem a medição do onLayout, `width / 2` seria 0 e o toque viraria um salto enorme.
    if (width <= 0) return;
    runOnJS(onSeek)((e.x - width / 2) / SPAN);
  });

  return (
    <View
      style={{ height: RIBBON_H }}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      <GestureDetector gesture={tap}>
        <View style={{ position: 'absolute', inset: 0 }}>
          {width > 0 && (
            <Svg width={width} height={RIBBON_H}>
              <Defs>
                {/*
                  A máscara é o `mask-image` do design, agora de verdade: as pontas somem
                  por transparência. Antes eram duas faixas na cor do fundo, que sobre o
                  gradiente da capa apareciam como dois retângulos escuros.
                */}
                <LinearGradient id="ribbonFade" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor="#fff" stopOpacity={0} />
                  <Stop offset="0.15" stopColor="#fff" stopOpacity={1} />
                  <Stop offset="0.85" stopColor="#fff" stopOpacity={1} />
                  <Stop offset="1" stopColor="#fff" stopOpacity={0} />
                </LinearGradient>
                <Mask id="ribbonMask">
                  <Rect x={0} y={0} width={width} height={RIBBON_H} fill="url(#ribbonFade)" />
                </Mask>
              </Defs>

              <G mask="url(#ribbonMask)">
                <Rect x={0} y={RIBBON_H / 2} width={width} height={1} fill={T.t14} />
                <AnimatedG animatedProps={slide}>
                  {heights.map((h, i) => {
                    const barHeight = Math.round(9 + h * 52);
                    return (
                      <Rect
                        key={i}
                        x={width / 2 + i * STEP}
                        y={(RIBBON_H - barHeight) / 2}
                        width={2.5}
                        height={barHeight}
                        rx={1.25}
                        fill={i * STEP <= head ? accent : 'rgba(246,241,234,.2)'}
                      />
                    );
                  })}
                </AnimatedG>
              </G>
            </Svg>
          )}
        </View>
      </GestureDetector>

      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: '50%',
          top: 0,
          bottom: 0,
          width: 2,
          marginLeft: -1,
          borderRadius: 2,
          backgroundColor: accent,
        }}
      />
      <Diamond accent={accent} top />
      <Diamond accent={accent} />
    </View>
  );
}

function Diamond({ accent, top = false }: { accent: string; top?: boolean }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: '50%',
        marginLeft: -4,
        [top ? 'top' : 'bottom']: -4,
        width: 8,
        height: 8,
        borderRadius: 2,
        backgroundColor: accent,
        transform: [{ rotate: '45deg' }],
      }}
    />
  );
}

// --------------------------------------------------------------- forma de onda

export function Waveform({
  seed,
  progress,
  accent,
  onSeek,
}: {
  seed: string;
  progress: number;
  accent: string;
  /** Recebe a posição absoluta pedida, 0..1. */
  onSeek: (fraction: number) => void;
}) {
  const heights = useMemo(() => waveform(seed, 52), [seed]);
  const [width, setWidth] = useState(1);

  // Tap do gesture-handler pelo mesmo motivo da fita: o Pan da tela cancela Pressables.
  const tap = Gesture.Tap().onEnd((e) => {
    runOnJS(onSeek)(e.x / Math.max(1, width));
  });

  return (
    <GestureDetector gesture={tap}>
      <View
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        style={{ height: 84, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        {heights.map((h, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              borderRadius: 2,
              height: Math.round(10 + h * 82),
              backgroundColor: i / heights.length <= progress ? accent : T.t18,
            }}
          />
        ))}
      </View>
    </GestureDetector>
  );
}

// ------------------------------------------------------------------- vinil

const GROOVES = [0.96, 0.88, 0.8, 0.72, 0.64, 0.56, 0.48];

export function Vinyl({
  art,
  size,
  playing,
  cover,
}: {
  art: Artwork;
  size: number;
  playing: boolean;
  cover?: string | null;
}) {
  const spin = useSharedValue(0);
  useEffect(() => {
    if (playing) {
      spin.value = withRepeat(
        withTiming(spin.value + 360, { duration: 7000, easing: Easing.linear }),
        -1,
        false
      );
    }
    // Pausar deixa o disco onde está — é o que um toca-discos faz.
  }, [playing, spin]);
  const rotate = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));

  const arm = useSharedValue(playing ? 0 : -22);
  useEffect(() => {
    arm.value = withTiming(playing ? 0 : -22, { duration: 800 });
  }, [playing, arm]);
  const armStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${arm.value}deg` }] }));

  const label = size * 0.4;

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            inset: 0,
            borderRadius: size / 2,
            backgroundColor: '#0A0908',
            alignItems: 'center',
            justifyContent: 'center',
          },
          rotate,
        ]}>
        {/* Sulcos: o repeating-radial-gradient do design vira alguns anéis finos. */}
        {GROOVES.map((r) => (
          <View
            key={r}
            style={{
              position: 'absolute',
              width: size * r,
              height: size * r,
              borderRadius: (size * r) / 2,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,.045)',
            }}
          />
        ))}
        <View
          style={{
            width: label,
            height: label,
            borderRadius: label / 2,
            overflow: 'hidden',
            backgroundColor: art.c,
            experimental_backgroundImage: artGradient(art),
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          {cover ? (
            <Image source={{ uri: cover }} style={{ position: 'absolute', width: label, height: label }} />
          ) : null}
          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#0A0908' }} />
        </View>
      </Animated.View>

      <Animated.View
        style={[
          {
            position: 'absolute',
            top: -6,
            right: 6,
            width: 150,
            height: 150,
            transformOrigin: '88% 12%',
          },
          armStyle,
        ]}>
        <View
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: '#2A2521',
          }}
        />
        <View
          style={{
            position: 'absolute',
            top: 24,
            right: 24,
            width: 112,
            height: 4,
            borderRadius: 3,
            transformOrigin: 'right center',
            transform: [{ rotate: '38deg' }],
            experimental_backgroundImage: 'linear-gradient(90deg, #8C8579 0%, #3A352F 100%)',
          }}
        />
      </Animated.View>
    </View>
  );
}
