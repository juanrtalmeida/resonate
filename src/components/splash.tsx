/**
 * A saída da splash, animada.
 *
 * A splash nativa é uma imagem parada que o sistema mostra e o app troca por um corte
 * seco: num quadro está a marca, no seguinte está a biblioteca. Este componente cobre
 * esse corte — ele desenha **a mesma marca, no mesmo tamanho, sobre o mesmo fundo** que a
 * splash nativa, então a troca entre uma e outra não se vê, e a partir dali a marca abre
 * e revela o app.
 *
 * ## Por que a marca vem do `Mark`, e não do PNG da splash
 *
 * Os dois desenham a mesma coisa: `splash-icon.png` sai de `scripts/brand-icons.py` com a
 * mesma geometria que `logo.tsx` usa — viewBox 64, anel de raio 24 com traço 8, núcleo de
 * raio 7. O PNG seria pixel a pixel idêntico, mas é um bitmap: escalá-lo até cobrir a tela
 * embaça. O `Mark` é SVG e cresce limpo.
 *
 * O casamento de tamanho é uma conta, não um palpite. No app.json a splash tem
 * `imageWidth: 140`, e o PNG desenha a marca em 90% do lado da imagem — então a caixa da
 * marca na tela mede `140 × 0.9 = 126`. `Mark` recebe o lado da caixa direto, e o anel
 * dele ocupa a mesma fração `56/64` dessa caixa. Daí `SPLASH_MARK = 126`.
 *
 * ## A abertura
 *
 * Um valor só dirige tudo, na thread de UI: a marca cresce acelerando e esmaece, e o fundo
 * vai atrás dela. Ela sai pela frente e o fundo depois — é o que dá a impressão de que a
 * marca abriu para deixar o app passar, em vez de os dois sumirem juntos.
 *
 * `ReduceMotion.System` respeita o "reduzir movimento" do aparelho: com a preferência
 * ligada o Reanimated entrega o valor final de imediato, o `onDone` chega no primeiro
 * quadro e a camada some sem crescer nada. É o comportamento certo — quem pediu menos
 * movimento não quer uma abertura de 700 ms.
 */

import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { C } from '@/constants/theme';
import { Mark } from './logo';

/** O lado da caixa da marca, para casar com a splash nativa. Ver o cabeçalho. */
const SPLASH_MARK = 126;

/**
 * Quanto dura a abertura.
 *
 * 700 ms é o teto do que se lê como "o app abrindo" — passar disso vira espera. Não há
 * atraso antes: a splash nativa já ficou na tela o tempo que as fontes levaram, e somar
 * uma pausa nossa a isso seria cobrar duas vezes pelo mesmo carregamento.
 */
const OPEN = 700;

export function Splash({ onDone }: { onDone: () => void }) {
  /** 0 = a marca como a splash nativa a mostrou; 1 = tela livre. */
  const open = useSharedValue(0);

  useEffect(() => {
    open.value = withTiming(
      1,
      {
        duration: OPEN,
        // Sai devagar e acelera: a marca "solta" a tela em vez de ser puxada dela.
        easing: Easing.in(Easing.cubic),
        reduceMotion: ReduceMotion.System,
      },
      (done) => {
        // O `onDone` desmonta esta camada. Pelo callback, e não por um `setTimeout` do
        // mesmo tempo: o relógio da animação é o da thread de UI, e dois relógios
        // separados divergem justamente na primeira abertura, que é a mais disputada.
        if (done) runOnJS(onDone)();
      }
    );
  }, [open, onDone]);

  /*
    A marca cresce até bem além da tela e esmaece antes de chegar lá — o que se vê é o anel
    abrindo, não um círculo laranja gigante. Ela termina de sair aos 70% do percurso, e o
    fundo tem os 30% finais só para ele.
  */
  const mark = useAnimatedStyle(() => ({
    opacity: interpolate(open.value, [0, 0.25, 0.7], [1, 1, 0], 'clamp'),
    transform: [{ scale: interpolate(open.value, [0, 1], [1, 9], 'clamp') }],
  }));

  const ground = useAnimatedStyle(() => ({
    opacity: interpolate(open.value, [0, 0.45, 1], [1, 1, 0], 'clamp'),
    /*
      Segura o toque enquanto a camada é opaca e devolve antes de sumir.

      Sem isto um toque nos últimos 300 ms morria aqui — a tela já parecia livre e a
      primeira coisa que o usuário tocasse não respondia. É o mesmo vão que o `leaving` do
      `ZoomScreen` existe para tirar.
    */
    pointerEvents: open.value > 0.5 ? 'none' : 'auto',
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          inset: 0,
          backgroundColor: C.bg,
          alignItems: 'center',
          justifyContent: 'center',
          // Acima de tudo: a barra inferior usa 30, a capa em voo do zoom usa 10.
          zIndex: 100,
        },
        ground,
      ]}>
      <Animated.View style={mark}>
        <Mark size={SPLASH_MARK} />
      </Animated.View>
    </Animated.View>
  );
}

/**
 * O que fica na tela enquanto as fontes não chegam.
 *
 * Só o fundo, e de propósito: por cima dele ainda está a splash **nativa**, que já mostra
 * a marca. Desenhar a marca aqui também a poria duas vezes no mesmo lugar — e qualquer
 * diferença de um pixel entre as duas apareceria como um tremor no instante em que a
 * nativa sai.
 */
export function SplashGround() {
  return <View style={{ flex: 1, backgroundColor: C.bg }} />;
}
