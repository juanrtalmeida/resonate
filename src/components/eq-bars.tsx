/** As barras de equalizador do design: escala vertical de .18 a 1, cada uma no seu ritmo. */

import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/** dur = 0.52 + ((i*37) % 5) * 0.14, como o eqMini do protótipo. */
const duration = (i: number) => (0.52 + ((i * 37) % 5) * 0.14) * 1000;

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
  const scale = useSharedValue(0.18 + ((index * 0.27) % 0.8));

  useEffect(() => {
    if (playing) {
      scale.value = withRepeat(withTiming(1, { duration: duration(index) }), -1, true);
    } else {
      cancelAnimation(scale);
    }
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
