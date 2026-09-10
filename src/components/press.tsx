/**
 * O toque que responde.
 *
 * Todo controle do app era um `Pressable` seco: o dedo descia, a ação acontecia, e nada
 * na tela dizia que o toque foi registrado. Num player isso pesa mais que na média —
 * pausar, avançar e curtir são gestos que se repetem, e o único retorno era o áudio, que
 * chega depois. O afundar preenche esse vão.
 *
 * O `SheetRow` de `sheet.tsx` já fazia isto para as linhas de folha; o que faltava era o
 * mesmo gesto disponível em qualquer botão, com o mesmo tempo, em vez de reescrito por
 * tela em valores um pouco diferentes.
 *
 * Nada aqui toca em propriedade de layout: só `transform` e `opacity`. É o que mantém o
 * afundar fora da árvore de layout — animar `width`, `height` ou margem obriga o Yoga a
 * remedir a cada quadro, e um botão que afunda não deveria custar isso. Ver a seção de
 * animações em `docs/05-design-system.md`.
 */

import { useEffect, type ReactNode } from 'react';
import { Pressable, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * A descida é curta e linear-ish; a volta é mola.
 *
 * Assimétrico de propósito: descer tem de acompanhar o dedo, que já está lá, e 90 ms é o
 * limite do que se lê como imediato. A volta é o que dá vida, e mola devolve com um fio de
 * repique que um `withTiming` não tem.
 */
const DOWN = { duration: 90, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System };

/**
 * `mass` explícito, como manda o design system: o padrão do Reanimated 4 traz `mass: 4` e
 * a razão de amortecimento sairia pela metade do pretendido.
 *
 * ζ = 26 / (2·√380) ≈ 0,67 — repica de leve e para. Passar de 1 mataria o repique, e é ele
 * que faz o botão parecer um objeto em vez de uma imagem que troca de tamanho.
 */
const UP = { damping: 26, mass: 1, stiffness: 380, reduceMotion: ReduceMotion.System };

/** O apagar do desabilitado. Anima porque `canNext` troca no meio de uma faixa. */
const FADE = { duration: 180, reduceMotion: ReduceMotion.System };

export function Press({
  onPress,
  onLongPress,
  delayLongPress,
  disabled = false,
  hitSlop,
  style,
  children,
  sink = 0.06,
  nudge = 0,
  dim = 0.3,
  accessibilityLabel,
}: {
  onPress?: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
  /** Desabilitado não recebe toque e apaga até `dim`, animando. */
  disabled?: boolean;
  hitSlop?: number;
  style?: ViewStyle;
  children: ReactNode;
  /** Quanto afunda. 0.06 é escala 0,94 no fundo do toque. */
  sink?: number;
  /**
   * Deslocamento horizontal no toque, em dp. Positivo vai para a direita.
   *
   * Existe para "anterior" e "próxima": afundar diz que o toque valeu, e o empurrãozinho
   * no sentido da viagem diz para onde. Zero em todo o resto.
   */
  nudge?: number;
  /** Opacidade do desabilitado. */
  dim?: number;
  accessibilityLabel?: string;
}) {
  const feel = useSharedValue(0);
  const off = useSharedValue(disabled ? 1 : 0);

  useEffect(() => {
    off.value = withTiming(disabled ? 1 : 0, FADE);
  }, [disabled, off]);

  const style_ = useAnimatedStyle(() => ({
    opacity: 1 - off.value * (1 - dim) - feel.value * 0.12,
    transform: [{ scale: 1 - feel.value * sink }, { translateX: feel.value * nudge }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityLabel={accessibilityLabel}
      /*
        `onPressOut` chega também quando o toque é cancelado — e é isso que faz o botão
        voltar quando o `Pan` da tela do player assume o gesto no meio do caminho. Sem
        ele o botão ficaria afundado depois de um arraste que começou em cima dele.
      */
      onPressIn={() => {
        feel.value = withTiming(1, DOWN);
      }}
      onPressOut={() => {
        feel.value = withSpring(0, UP);
      }}
      style={[style, style_]}>
      {children}
    </AnimatedPressable>
  );
}

/**
 * Um pulso, disparado por mudança de estado e não por toque.
 *
 * É o retorno de "isto virou outra coisa": o coração que acabou de acender, o ícone que
 * trocou de play para pause. O `Press` cobre o toque; este cobre o resultado dele, que
 * chega depois — curtir passa pelo `PrefsProvider` e volta como prop.
 *
 * `on` mudando de valor dispara. O primeiro render não pulsa: montar a tela com uma faixa
 * já curtida faria o coração saltar sozinho.
 */
export function Beat({
  on,
  amount = 0.3,
  children,
}: {
  /** Qualquer valor: o pulso dispara quando ele muda. */
  on: unknown;
  /** Quanto cresce no ápice. 0.3 é escala 1,3. */
  amount?: number;
  children: ReactNode;
}) {
  const beat = useSharedValue(0);
  const first = useSharedValue(true);

  useEffect(() => {
    if (first.value) {
      first.value = false;
      return;
    }
    // Sobe rápido e volta com mola: o desenho de um "pop".
    beat.value = withTiming(1, { duration: 110, reduceMotion: ReduceMotion.System }, () => {
      beat.value = withSpring(0, { damping: 12, mass: 1, stiffness: 260, reduceMotion: ReduceMotion.System });
    });
  }, [on, beat, first]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + beat.value * amount }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}
