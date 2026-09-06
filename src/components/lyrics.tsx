/**
 * A aba de letras, no comportamento do Music da Apple: a letra inteira rola, a linha do
 * momento fica opaca e ancorada perto do topo, as outras ficam esmaecidas, e tocar numa
 * linha salta para o trecho dela.
 *
 * ponytail: as linhas são dezenas por faixa e todas ficam montadas. Virar uma lista
 * virtualizada só valeria se aparecer letra com centenas de linhas.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { T } from '@/constants/theme';
import { lineAt, type Lyrics } from '@/lib/lrc';
import { EmptyState } from './empty-state';
import { Lyrics as LyricsIcon } from './icons';
import { Display } from './text';

/** Onde a linha ativa se estabiliza, em fração da altura visível. */
const ANCHOR = 0.32;
/** Depois de rolar com o dedo, o scroll automático espera antes de retomar. */
const MANUAL_PAUSE = 4000;

const SIZE = 28;

export function LyricsView({
  lyrics,
  elapsed,
  onSeek,
}: {
  lyrics: Lyrics;
  elapsed: number;
  onSeek: (seconds: number) => void;
}) {
  const scroller = useRef<ScrollView>(null);
  const offsets = useRef<number[]>([]);
  const [height, setHeight] = useState(0);
  const manualUntil = useRef(0);

  const at = lyrics.synced ? lineAt(lyrics.lines, elapsed) : -1;

  // Rola para deixar a linha atual na âncora. O Apple Music não centraliza: a linha
  // sobe até cerca de um terço do topo e as seguintes esperam abaixo.
  useEffect(() => {
    if (at < 0 || !height) return;
    if (Date.now() < manualUntil.current) return;
    const y = offsets.current[at];
    if (y == null) return;
    scroller.current?.scrollTo({ y: Math.max(0, y - height * ANCHOR), animated: true });
  }, [at, height]);

  const measure = useCallback((index: number, y: number) => {
    offsets.current[index] = y;
  }, []);

  if (!lyrics.lines.length) return <NoLyrics />;

  return (
    <ScrollView
      ref={scroller}
      showsVerticalScrollIndicator={false}
      onLayout={(e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height)}
      onScrollBeginDrag={() => {
        manualUntil.current = Date.now() + MANUAL_PAUSE;
      }}
      contentContainerStyle={{
        // Folga para a primeira e a última linha também alcançarem a âncora.
        paddingTop: height * ANCHOR,
        paddingBottom: height * (1 - ANCHOR),
        gap: 22,
      }}>
      {lyrics.lines.map((line, index) => (
        <Line
          key={index}
          text={line.text}
          active={index === at}
          dimmed={lyrics.synced}
          onLayout={(e: LayoutChangeEvent) => measure(index, e.nativeEvent.layout.y)}
          onPress={line.time == null ? undefined : () => onSeek(line.time!)}
        />
      ))}
    </ScrollView>
  );
}

function Line({
  text,
  active,
  dimmed,
  onLayout,
  onPress,
}: {
  text: string;
  active: boolean;
  /** Letra sem sincronia não tem linha "atual": todas ficam legíveis. */
  dimmed: boolean;
  onLayout: (e: LayoutChangeEvent) => void;
  onPress?: () => void;
}) {
  const on = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    on.value = withTiming(active ? 1 : 0, { duration: 280 });
  }, [active, on]);

  const style = useAnimatedStyle(() => ({
    opacity: dimmed ? 0.3 + on.value * 0.7 : 0.82,
    transform: [{ scale: 0.975 + on.value * 0.025 }],
  }));

  return (
    <Animated.View style={[{ transformOrigin: 'left center' }, style]} onLayout={onLayout}>
      <Pressable onPress={onPress} disabled={!onPress}>
        {/* A cor é sempre a mesma: quem separa a linha do momento das outras é a
            opacidade, como no Music da Apple. */}
        <Display size={SIZE} weight={800} tracking={-0.03} style={{ lineHeight: SIZE * 1.22 }}>
          {text}
        </Display>
      </Pressable>
    </Animated.View>
  );
}

/** Estado vazio, na mesma linguagem do resto do app. */
export function NoLyrics({ onPick }: { onPick?: () => void }) {
  return (
    <EmptyState
      icon={<LyricsIcon size={30} color={T.full} />}
      title="Sem letra"
      action={onPick ? 'Escolher um .lrc' : undefined}
      onAction={onPick}>
      O Resonate procura a letra dentro do arquivo e num .lrc ao lado dele. Esta faixa não tem
      nenhum dos dois.
    </EmptyState>
  );
}
