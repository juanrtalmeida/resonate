/** As barras de equalizador do design: escala vertical de .18 a 1, cada uma no seu ritmo. */

import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/** dur = 0.52 + ((i*37) % 5) * 0.14, como o eqMini do protótipo. */
const duration = (i: number) => (0.52 + ((i * 37) % 5) * 0.14) * 1000;

/**
 * Altura das barras paradas.
 *
 * Pausar era `cancelAnimation` e nada mais: as barras congelavam onde a animação estava
 * naquele milissegundo, cada uma numa altura diferente, e o equalizador parado parecia um
 * gráfico quebrado. Um piso comum diz "parado" — e é o mesmo valor de onde elas partem.
 */
const REST = 0.18;

function Bar({
  index,
  width,
  height,
  color,
  playing,
}: {
  index: number;
  width: number;
  height: number;
  color: string;
  playing: boolean;
}) {
  // O protótipo usa animation-delay negativo; aqui cada barra já nasce num ponto
  // diferente do ciclo, que dá o mesmo desencontro.
  const scale = useSharedValue(REST + ((index * 0.27) % 0.8));

  useEffect(() => {
    if (playing) {
      scale.value = withRepeat(
        withTiming(1, { duration: duration(index), reduceMotion: ReduceMotion.System }),
        -1,
        true
      );
      return;
    }
    /*
      Assentar, e não `cancelAnimation`.

      Atribuir uma animação nova já cancela o `withRepeat` — e além de cancelar, ela leva a
      barra até o piso em vez de deixá-la onde o quadro a pegou. Cada barra desce no tempo
      dela, o que faz o equalizador "baixar" em vez de travar.
    */
    scale.value = withTiming(REST, { duration: 260, reduceMotion: ReduceMotion.System });
  }, [playing, index, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: scale.value }] }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: 2,
          backgroundColor: color,
          transformOrigin: 'bottom',
        },
        style,
      ]}
    />
  );
}

export function EqBars({
  count = 5,
  width = 2.5,
  height = 20,
  gap = 2.5,
  color,
  playing,
}: {
  count?: number;
  width?: number;
  height?: number;
  gap?: number;
  color: string;
  playing: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap }}>
      {Array.from({ length: count }, (_, i) => (
        <Bar key={i} index={i} width={width} height={height} color={color} playing={playing} />
      ))}
    </View>
  );
}
