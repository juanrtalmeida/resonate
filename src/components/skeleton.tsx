/**
 * O lugar das listas enquanto elas montam.
 *
 * Álbum, artista e biblioteca adiam o que é caro para o quadro seguinte (ver o
 * `useDeferredValue` em `screens/album.tsx`): entre o toque e as linhas prontas há uns
 * 300 ms com nada no lugar. Cada silhueta ocupa a altura de linha de verdade, então o
 * conteúdo entra onde as barras estavam em vez de empurrar a tela.
 *
 * Uma forma por tipo de linha, e não uma genérica com props de forma: as três diferem em
 * geometria inteira, não em tamanho — faixa é número e duas linhas de texto, linha de
 * grupo é uma miniatura de 52, a grade são capas quadradas de dois em dois.
 */

import { useEffect } from 'react';
import { View, type DimensionValue, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { R, T } from '@/constants/theme';

/**
 * Altura de uma linha de faixa, medida no aparelho — o mesmo `ROW` de `screens/artist.tsx`.
 *
 * Cravada, e não deduzida do conteúdo: a `TrackRow` tem duas linhas de texto e a altura
 * delas é a que a fonte der. Errar aqui é o conteúdo pular no lugar da silhueta, que é
 * exatamente o que ela existe para evitar.
 */
const ROW = 54;

/** Altura de uma linha de grupo: miniatura de 52 mais o `paddingVertical` de 10. */
const GROUP_ROW = 72;

/** O respiro do bloco. Lento: é espera, não carregamento com barra. */
const PULSE = {
  duration: 900,
  easing: Easing.inOut(Easing.quad),
  reduceMotion: ReduceMotion.System,
};

/**
 * Larguras do título, em fração da linha. Três valores em ciclo: barras todas iguais
 * leem como uma tabela quebrada, e não como texto que ainda não chegou.
 */
const WIDTHS: DimensionValue[] = ['74%', '58%', '66%'];

/**
 * O respiro, um por bloco.
 *
 * Um shared value e um estilo animado para todas as linhas juntas: uma opacidade por
 * linha seriam oito nós animados dizendo a mesma coisa, e o que se quer aqui é justamente
 * não custar nada enquanto as linhas de verdade montam.
 */
function useBreathe() {
  const pulse = useSharedValue(0.45);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, PULSE), -1, true);
  }, [pulse]);
  return useAnimatedStyle(() => ({ opacity: pulse.value }));
}

/** Silhueta de `TrackRow`: número, título, subtítulo e duração. */
export function TrackSkeleton({ rows, style }: { rows: number; style?: ViewStyle }) {
  const breathe = useBreathe();

  return (
    <Animated.View pointerEvents="none" style={[style, breathe]}>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} width={WIDTHS[i % WIDTHS.length]} />
      ))}
    </Animated.View>
  );
}

/**
 * Silhueta das linhas com miniatura — artista e lista.
 *
 * `round` porque é a única diferença entre as duas na tela: o artista vem em círculo, a
 * lista em quadrado de canto 14.
 */
export function RowSkeleton({
  rows,
  round = false,
  style,
}: {
  rows: number;
  round?: boolean;
  style?: ViewStyle;
}) {
  const breathe = useBreathe();

  return (
    <Animated.View pointerEvents="none" style={[style, breathe]}>
      {Array.from({ length: rows }, (_, i) => (
        <View
          key={i}
          style={{ height: GROUP_ROW, flexDirection: 'row', alignItems: 'center', gap: 13 }}>
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: round ? 26 : 14,
              backgroundColor: T.t08,
            }}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Bar width={WIDTHS[i % WIDTHS.length]} height={11} />
            <Bar width="30%" height={8} style={{ marginTop: 7 }} />
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

/** Silhueta da grade de álbuns: capas quadradas de dois em dois, com os dois rótulos. */
export function GridSkeleton({
  rows,
  cell,
  gap,
  style,
}: {
  rows: number;
  /** Lado da capa, o mesmo que a grade calcula da largura da tela. */
  cell: number;
  gap: number;
  style?: ViewStyle;
}) {
  const breathe = useBreathe();

  return (
    <Animated.View pointerEvents="none" style={[style, breathe]}>
      {Array.from({ length: rows }, (_, row) => (
        <View key={row} style={{ flexDirection: 'row', gap, marginBottom: 16 }}>
          {[0, 1].map((col) => (
            <View key={col} style={{ width: cell }}>
              <View
                style={{ width: cell, height: cell, borderRadius: R.r17, backgroundColor: T.t08 }}
              />
              <Bar width="76%" height={11} style={{ marginTop: 11 }} />
              <Bar width="52%" height={8} style={{ marginTop: 7 }} />
            </View>
          ))}
        </View>
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
