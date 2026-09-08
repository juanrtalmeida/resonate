/**
 * O lugar das faixas enquanto elas montam.
 *
 * Álbum e artista adiam o que é caro para o quadro seguinte (ver o `useDeferredValue` em
 * `screens/album.tsx`): entre o toque e as linhas prontas há uns 300 ms com nada embaixo
 * do cabeçalho. Estas barras ocupam a altura de linha de verdade, então o conteúdo entra
 * no lugar delas em vez de empurrar a tela.
 */

import { useEffect } from 'react';
import { View, type DimensionValue, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { T } from '@/constants/theme';

/**
 * Altura de uma linha de faixa, medida no aparelho — o mesmo `ROW` de `screens/artist.tsx`.
 *
 * Cravada, e não deduzida do conteúdo: a `TrackRow` tem duas linhas de texto e a altura
 * delas é a que a fonte der. Errar aqui é o conteúdo pular no lugar da silhueta, que é
 * exatamente o que ela existe para evitar.
 */
const ROW = 54;

/** O respiro do bloco. Lento: é espera, não carregamento com barra. */
const PULSE = { duration: 900, easing: Easing.inOut(Easing.quad) };

/**
 * Larguras do título, em fração da linha. Três valores em ciclo: barras todas iguais
 * leem como uma tabela quebrada, e não como texto que ainda não chegou.
 */
const WIDTHS: DimensionValue[] = ['74%', '58%', '66%'];

export function TrackSkeleton({ rows, style }: { rows: number; style?: ViewStyle }) {
  /*
    Um shared value para o bloco inteiro, e o pulso num estilo animado só. Uma opacidade
    por linha seriam seis nós animados para dizer a mesma coisa, e o que se quer aqui é
    justamente não custar nada enquanto as linhas de verdade montam.
  */
  const pulse = useSharedValue(0.45);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, PULSE), -1, true);
  }, [pulse]);
  const breathe = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View pointerEvents="none" style={[style, breathe]}>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} width={WIDTHS[i % WIDTHS.length]} />
      ))}
    </Animated.View>
  );
}

/** A silhueta de uma `TrackRow`: os mesmos recuos, o mesmo vão, as mesmas três colunas. */
function SkeletonRow({ width }: { width: DimensionValue }) {
  return (
    <View style={{ height: ROW, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <Bar width={14} height={9} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Bar width={width} height={11} />
        <Bar width="34%" height={8} style={{ marginTop: 7 }} />
      </View>
      <Bar width={28} height={9} />
    </View>
  );
}

function Bar({
  width,
  height,
  style,
}: {
  width: DimensionValue;
  height: number;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        { width, height, borderRadius: height / 2, backgroundColor: T.t08 },
        style,
      ]}
    />
  );
}
