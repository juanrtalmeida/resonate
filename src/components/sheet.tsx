/**
 * A folha de baixo do app. Uma só, usada por todas as telas que precisam de uma.
 *
 * O `animationType="slide"` do Modal é uma rampa linear e destoa do resto do app, onde
 * tudo entra com mola. Então a entrada é nossa: a folha sobe com mola, e o dedo assume o
 * comando dela no meio do caminho quando o usuário arrasta para baixo.
 *
 * A saída fica com o fade do Modal. Animar a saída por conta própria exigiria segurar a
 * folha montada depois de `visible` virar falso, e a tentativa anterior disso — estado
 * ajustado durante o render — deixou a folha sem abrir.
 *
 * Este arquivo escreve em shared values de handlers e de worklets de gesto, que é o
 * contrato do Reanimated e não o que a regra de imutabilidade do React Compiler modela —
 * mesma situação de zoom.tsx.
 */
/* eslint-disable react-hooks/immutability */

import { useEffect, type ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
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

/** Enquanto a folha não foi medida, ela sobe de um palpite. */
const GUESS = 560;

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

  // 0 fechada, 1 aberta. `drag` é o que o dedo somou por cima disso.
  const progress = useSharedValue(0);
  const drag = useSharedValue(0);
  // Altura real da folha, medida no layout: é a distância que ela percorre para sumir.
  const travel = useSharedValue(GUESS);

  /*
    Quem monta e desmonta é o próprio `visible`, direto no Modal.

    A versão anterior segurava a folha montada para animar a saída, com um estado ajustado
    durante o render. Isso deixava a folha invisível quando ela devia abrir — e uma folha
    que não abre é pior que uma saída sem mola. A entrada continua nossa; a saída é o fade
    do Modal, que é nativo e não tem como falhar.
  */
  useEffect(() => {
    if (!visible) {
      // Zerar no fechamento é o que faz a próxima abertura começar de baixo outra vez.
      progress.value = 0;
      drag.value = 0;
      return;
    }
    progress.value = withSpring(1, IN);
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

  /*
    Sem `statusBarTranslucent`: ele liga o edge-to-edge na janela do diálogo
    (`setDecorFitsSystemWindows(false)`), e aí o Android para de encolher a janela quando o
    teclado sobe — a folha ficava atrás dele.

    O GestureHandlerRootView é obrigatório aqui: o Modal abre uma janela nativa própria, e
    o root de gestos do app não alcança dentro dela. Sem isto o arrasto do cabeçalho não
    recebe toque nenhum.
  */
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
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
      </GestureHandlerRootView>
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
