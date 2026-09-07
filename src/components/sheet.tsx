/**
 * A folha de baixo do app. Uma só, usada por todas as telas que precisam de uma.
 *
 * O `Modal` do React Native anima com `animationType="slide"`, que é uma rampa linear e
 * destoa do resto — aqui tudo entra com mola. Então o Modal entra sem animação nenhuma e
 * a folha se move por conta própria: mola na entrada, tempo curto na saída, e o dedo no
 * meio do caminho quando o usuário arrasta para baixo.
 *
 * A saída precisa do estado `mounted`: fechar o Modal desmonta o conteúdo na hora e não
 * sobra nada para animar. O Modal só sai depois que a folha termina de descer.
 *
 * Este arquivo escreve em shared values de handlers e de worklets de gesto, que é o
 * contrato do Reanimated e não o que a regra de imutabilidade do React Compiler modela —
 * mesma situação de zoom.tsx.
 */
/* eslint-disable react-hooks/immutability */

import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeInDown,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, R, T } from '@/constants/theme';
import { Display } from './text';

const IN = { damping: 24, stiffness: 240, mass: 0.9 };
const OUT = { duration: 220, easing: Easing.bezier(0.35, 0, 0.3, 1) };

/** Arrasto que já conta como fechar, em pixels, e a velocidade que dispensa a distância. */
const DISMISS = 96;
const FLING = 900;

export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);

  // Abrir é durante o render, e não num efeito: o Modal precisa já estar montado no
  // mesmo quadro em que a animação de entrada começa, senão ela roda com a folha fora
  // da tela e a primeira coisa que se vê é a folha já aberta.
  const [was, setWas] = useState(visible);
  if (was !== visible) {
    setWas(visible);
    if (visible) setMounted(true);
  }

  // 0 fechada, 1 aberta. `drag` é o que o dedo somou por cima disso.
  const progress = useSharedValue(0);
  const drag = useSharedValue(0);
  // Altura real da folha, medida no layout: é a distância que ela percorre para sumir.
  const travel = useSharedValue(height * 0.6);

  useEffect(() => {
    if (visible) {
      drag.value = 0;
      progress.value = withSpring(1, IN);
      return;
    }
    // Descer e só então tirar o Modal da tela.
    drag.value = withTiming(0, OUT);
    progress.value = withTiming(0, OUT, (done) => {
      if (done) runOnJS(setMounted)(false);
    });
  }, [visible, progress, drag]);

  /** Arrasto para baixo, pego pelo cabeçalho — o corpo pode ter lista rolando dentro. */
  const pan = Gesture.Pan()
    .activeOffsetY([-12, 12])
    .onUpdate((e) => {
      drag.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS || e.velocityY > FLING) {
        runOnJS(onClose)();
        return;
      }
      drag.value = withSpring(0, IN);
    });

  const sheet = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(progress.value, [0, 1], [travel.value, 0]) + drag.value }],
  }));

  // O fundo escurece junto com a entrada e clareia de novo enquanto o dedo desce.
  const backdrop = useAnimatedStyle(() => ({
    opacity:
      progress.value * (1 - Math.min(1, drag.value / Math.max(1, travel.value))) * 0.62,
  }));

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[{ flex: 1, backgroundColor: '#060504' }, backdrop]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>

      <Animated.View
        onLayout={(e) => {
          travel.value = e.nativeEvent.layout.height;
        }}
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: C.surface,
            borderTopLeftRadius: R.r26,
            borderTopRightRadius: R.r26,
            borderTopWidth: 1,
            borderColor: T.t1,
            paddingBottom: Math.max(insets.bottom, 16) + 12,
            maxHeight: '82%',
          },
          sheet,
        ]}>
        {/* Um brilho de acento no topo da folha, para ela não nascer de um retângulo seco. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 140,
            borderTopLeftRadius: R.r26,
            borderTopRightRadius: R.r26,
            opacity: 0.5,
            experimental_backgroundImage: `radial-gradient(120% 100% at 50% 0%, ${T.t08} 0%, transparent 70%)`,
          }}
        />

        <GestureDetector gesture={pan}>
          <View style={{ paddingTop: 12, paddingHorizontal: 22, paddingBottom: 4 }}>
            <View
              style={{
                width: 38,
                height: 4,
                borderRadius: 2,
                backgroundColor: T.t18,
                alignSelf: 'center',
                marginBottom: 16,
              }}
            />
            <Display size={22} tracking={-0.03}>
              {title}
            </Display>
          </View>
        </GestureDetector>

        {/* flexShrink para a lista de dentro caber no teto da folha em vez de estourá-lo. */}
        <View style={{ paddingHorizontal: 22, flexShrink: 1 }}>{children}</View>
      </Animated.View>
    </Modal>
  );
}

/**
 * Linha de listagem dentro de uma folha: entra em cascata e afunda um pouco no toque.
 *
 * A cascata é o que separa uma listagem viva de uma lista parada — e é barata: são as
 * poucas linhas que cabem na folha, não uma lista inteira.
 */
export function SheetRow({
  index,
  onPress,
  children,
}: {
  index: number;
  onPress: () => void;
  children: ReactNode;
}) {
  const press = useSharedValue(0);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - press.value * 0.03 }],
    opacity: 1 - press.value * 0.25,
  }));

  return (
    <Animated.View entering={FadeInDown.duration(260).delay(Math.min(index, 8) * 45)}>
      <Animated.View style={style}>
        <Pressable
          onPress={onPress}
          onPressIn={() => {
            press.value = withTiming(1, { duration: 90 });
          }}
          onPressOut={() => {
            press.value = withSpring(0, IN);
          }}>
          {children}
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}
