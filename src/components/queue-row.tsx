/**
 * Uma linha da fila do Now Playing, arrastável para reordenar.
 *
 * Fica em arquivo próprio para localizar a supressão abaixo: os handlers de gesto
 * escrevem em shared values, que é o contrato do Reanimated, e a regra de imutabilidade
 * do React Compiler não modela isso.
 */
/* eslint-disable react-hooks/immutability */

import { Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { T } from '@/constants/theme';
import type { Track } from '@/lib/scan';
import { DragHandle } from './icons';
import { Body } from './text';

/** Altura de uma linha. É o passo usado para converter arraste em posições. */
export const QUEUE_ROW = 52;

/**
 * Linha da fila. O gesto mora no pegador à direita — na linha inteira ele competiria com
 * a rolagem, e exigir um toque mantido tornava o arraste menos óbvio do que um ícone.
 *
 * Enquanto uma linha viaja, as vizinhas entre a origem e o destino abrem espaço saltando
 * uma posição inteira, o que faz o alvo do arraste ser sempre visível.
 */
export function QueueRow({
  track,
  at,
  count,
  activeAt,
  targetAt,
  onPress,
  onRemove,
  onMove,
}: {
  track: Track;
  at: number;
  count: number;
  activeAt: SharedValue<number>;
  targetAt: SharedValue<number>;
  onPress: () => void;
  onRemove: () => void;
  onMove: (from: number, to: number) => void;
}) {
  const y = useSharedValue(0);

  const drag = Gesture.Pan()
    .onStart(() => {
      activeAt.value = at;
      targetAt.value = at;
    })
    .onUpdate((e) => {
      y.value = e.translationY;
      // Snap: o alvo é sempre uma posição inteira, nunca um meio-termo.
      const step = Math.round(e.translationY / QUEUE_ROW);
      targetAt.value = Math.max(0, Math.min(count - 1, at + step));
    })
    .onEnd(() => {
      const to = targetAt.value;
      if (to !== at) runOnJS(onMove)(at, to);
      y.value = 0;
      activeAt.value = -1;
      targetAt.value = -1;
    });

  const style = useAnimatedStyle(() => {
    if (activeAt.value === at) {
      return {
        transform: [{ translateY: y.value }, { scale: 1.03 }],
        zIndex: 10,
        opacity: 0.94,
      };
    }

    const from = activeAt.value;
    const to = targetAt.value;
    let shift = 0;
    if (from >= 0) {
      if (from < to && at > from && at <= to) shift = -QUEUE_ROW;
      else if (from > to && at >= to && at < from) shift = QUEUE_ROW;
    }
    return {
      transform: [{ translateY: withTiming(shift, { duration: 150 }) }],
      zIndex: 0,
      opacity: 1,
    };
  });

  return (
    <Animated.View style={style}>
      <Pressable
        onPress={onPress}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: QUEUE_ROW }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Body size={13.5} weight={500} tracking={-0.01} numberOfLines={1}>
            {track.title}
          </Body>
          <Body size={11} color={T.t42} numberOfLines={1}>
            {track.artist}
          </Body>
        </View>
        <Pressable onPress={onRemove} hitSlop={10} style={{ paddingHorizontal: 6 }}>
          <Body size={18} color={T.t42}>
            ×
          </Body>
        </Pressable>
        <GestureDetector gesture={drag}>
          <View style={{ paddingHorizontal: 6, paddingVertical: 12 }}>
            <DragHandle />
          </View>
        </GestureDetector>
      </Pressable>
    </Animated.View>
  );
}
