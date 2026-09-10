/**
 * O fundo de uma superfície do app, nos três desenhos possíveis.
 *
 * Uma peça só, e é sempre o **fundo** — uma camada absoluta atrás dos filhos, não um
 * container. É o que permite trocar o desenho de um cartão sem mexer no layout dele: quem
 * chama tira o `backgroundColor` e a borda do próprio estilo e põe um `<Panel>` como
 * primeiro filho. O toque, o gesto e o recorte continuam sendo de quem chama.
 *
 * Os três desenhos:
 *
 * - **Liquid Glass** no iOS, pelo `expo-glass-effect`. Vidro de verdade, do
 *   `UIVisualEffectView` — não um gradiente escuro imitando desfoque.
 * - **Material 3** no Android, com os tons de superfície da paleta do aparelho.
 *   Ver `lib/material.ts`.
 * - **O nosso**, quando a interface nativa está desligada: a cor e a borda que o chamador
 *   passa em `fallback`, que é exatamente o que ele tinha antes.
 *
 * Ver `lib/native-ui.ts` para a decisão de qual dos três vale agora.
 */

import { GlassView, type GlassViewProps } from 'expo-glass-effect';
import { useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useMaterialSurface } from '@/lib/material';
import { LIQUID_GLASS, useNativeUI } from '@/lib/native-ui';
import { usePrefs } from '@/lib/prefs';

const AnimatedGlassView = Animated.createAnimatedComponent(GlassView);

/** A camada de fundo, sempre colada nos quatro lados de quem a hospeda. */
const FILL = { position: 'absolute', inset: 0 } as const satisfies ViewStyle;

export function Panel({
  style,
  tone = 'surface',
  interactive = false,
  fade,
  fallback,
}: {
  /** O recorte do fundo. É aqui que vão os raios de canto — eles são do chamador. */
  style?: StyleProp<ViewStyle>;
  /** `raised` é um tom acima: o que flutua sobre outro cartão. Só o Material distingue. */
  tone?: 'surface' | 'raised';
  /**
   * O fundo de um controle, não de um cartão.
   *
   * Liga o vidro interativo do iOS: ele se deforma sob o dedo, como os botões do sistema
   * no iOS 26. Vale para botão e pílula, e não para a folha ou a barra — uma superfície
   * grande que se entorta a cada toque é enjoativa. Ignorado fora do vidro.
   */
  interactive?: boolean;
  /**
   * A opacidade que o pai vai aplicar, de 0 a 1, quando ela é animada.
   *
   * Existe por um detalhe do vidro: opacidade zero em cima de um `GlassView` — nele ou em
   * qualquer ancestral — não o deixa translúcido, deixa **sem efeito nenhum**. A barra
   * inferior apaga assim quando o Now Playing abre, e voltaria vazia. O contorno que a
   * documentação do `expo-glass-effect` indica é trocar o estilo do vidro para `none`
   * enquanto ele está apagado, e é o que este valor dirige.
   */
  fade?: SharedValue<number>;
  /** O desenho do Resonate: a cor de fundo e, se houver, a borda de 1. */
  fallback: { background: string; border?: string };
}) {
  const native = useNativeUI();
  const { accent } = usePrefs();
  // Hook: chamado sempre, mesmo com a interface nativa desligada. No iOS e na web devolve
  // `null` sem tocar em nada — ver `lib/material.ts`.
  const material = useMaterialSurface(accent);

  if (native && LIQUID_GLASS) {
    return fade ? (
      <Fading style={style} fade={fade} interactive={interactive} />
    ) : (
      <Glass style={style} interactive={interactive} />
    );
  }

  if (native && material) {
    return (
      <View
        style={[
          FILL,
          {
            backgroundColor: tone === 'raised' ? material.raised : material.surface,
            borderWidth: 1,
            borderColor: material.outline,
          },
          style,
        ]}
      />
    );
  }

  return (
    <View
      style={[
        FILL,
        {
          backgroundColor: fallback.background,
          borderWidth: fallback.border ? 1 : 0,
          borderColor: fallback.border,
        },
        style,
      ]}
    />
  );
}

/**
 * Um valor que sai de zero no tempo de uma animação de entrada.
 *
 * Serve de `fade` para o material que nasce dentro de um `entering={FadeIn…}`: a opacidade
 * dessas entradas mora dentro do Reanimated e não há como lê-la de fora — mas o *tempo*
 * dela é conhecido, e o que o vidro precisa saber é só **quando a opacidade deixou de ser
 * zero**. Basta a mesma duração: no primeiro por cento da entrada o valor já passou do
 * limiar, e a opacidade do pai também.
 *
 * Quem já tem um valor de verdade para dar — o progresso de uma folha, o de um zoom — deve
 * dar esse, e não isto.
 */
export function useEntering(duration: number, delay = 0): SharedValue<number> {
  const at = useSharedValue(0);

  useEffect(() => {
    at.value = withDelay(delay, withTiming(1, { duration }));
  }, [at, duration, delay]);

  return at;
}

/**
 * O vidro parado.
 *
 * `colorScheme="dark"` cravado, e não `auto`: o app é escuro em qualquer aparelho
 * (`userInterfaceStyle: 'dark'`), e um vidro claro embaixo do nosso texto claro sumiria.
 */
function Glass({
  style,
  interactive,
}: {
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
}) {
  return (
    <GlassView
      colorScheme="dark"
      glassEffectStyle="regular"
      isInteractive={interactive}
      style={[FILL, style]}
    />
  );
}

/**
 * O mesmo vidro, desligado enquanto o pai está apagado — ver o comentário de `fade`.
 *
 * Um componente à parte porque o `useAnimatedProps` é hook: no `Panel` ele teria de ser
 * chamado mesmo quando não há `fade`, e a regra de ordem dos hooks não deixa isso ser
 * condicional.
 */
function Fading({
  style,
  fade,
  interactive,
}: {
  style?: StyleProp<ViewStyle>;
  fade: SharedValue<number>;
  interactive?: boolean;
}) {
  // O estilo só troca de valor nas duas travessias do limiar, então o Reanimated não fica
  // enviando prop por quadro — ele só manda o que mudou.
  const props = useAnimatedProps<GlassViewProps>(() => ({
    glassEffectStyle: fade.value > 0.02 ? 'regular' : 'none',
  }));

  return (
    <AnimatedGlassView
      colorScheme="dark"
      isInteractive={interactive}
      style={[FILL, style]}
      animatedProps={props}
    />
  );
}
