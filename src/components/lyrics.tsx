/**
 * A aba de letras, no comportamento do Music da Apple: a letra inteira rola, a linha do
 * momento fica opaca e ancorada perto do topo, as outras ficam esmaecidas, e tocar numa
 * linha salta para o trecho dela.
 *
 * ponytail: as linhas são dezenas por faixa e todas ficam montadas. Virar uma lista
 * virtualizada só valeria se aparecer letra com centenas de linhas.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { F, T } from '@/constants/theme';
import { lineAt, wordAt, type LyricWord, type Lyrics } from '@/lib/lrc';
import { EmptyState } from './empty-state';
import { Lyrics as LyricsIcon } from './icons';
import { Display } from './text';

/** Onde a linha ativa se estabiliza, em fração da altura visível. */
const ANCHOR = 0.32;
/** Depois de rolar com o dedo, o scroll automático espera antes de retomar. */
const MANUAL_PAUSE = 4000;

const SIZE = 28;

/** Quanto a linha do momento sobe, e quanto cada palavra sobe ao ser cantada. */
const LIFT = 7;
const WORD_LIFT = 3.5;

/** Mola de todo o movimento da letra: sem repique, só um assentar macio. */
const SOFT = { damping: 22, stiffness: 120, mass: 0.7 };
const SUNG = { duration: 260, easing: Easing.out(Easing.cubic) };

/**
 * O estilo do <Display> repetido à mão.
 *
 * Palavra cronometrada precisa ser um Text por conta própria — transformação em Text
 * aninhado o React Native ignora, e sem transformação não há subida nenhuma. Cada palavra
 * vira então um nó no seu próprio lugar, e o estilo tem de bater com o da linha inteira
 * para as duas formas ficarem idênticas no layout.
 */
const WORD_STYLE = {
  fontFamily: F.displayHeavy,
  fontSize: SIZE,
  lineHeight: SIZE * 1.22,
  letterSpacing: SIZE * -0.03,
  color: T.full,
} as const;

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
          words={line.words}
          elapsed={elapsed}
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
  words,
  elapsed,
  active,
  dimmed,
  onLayout,
  onPress,
}: {
  text: string;
  /** Trechos cronometrados, quando o arquivo é do formato por palavra. */
  words: LyricWord[] | null;
  elapsed: number;
  active: boolean;
  /** Letra sem sincronia não tem linha "atual": todas ficam legíveis. */
  dimmed: boolean;
  onLayout: (e: LayoutChangeEvent) => void;
  onPress?: () => void;
}) {
  const on = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    on.value = withSpring(active ? 1 : 0, SOFT);
  }, [active, on]);

  const style = useAnimatedStyle(() => ({
    opacity: dimmed ? 0.3 + on.value * 0.7 : 0.82,
    transform: [
      // A linha do momento sobe um pouco e volta quando passa a vez — é o que dá o
      // movimento de karaokê sem tirar nada do lugar (transformação não mexe no layout).
      { translateY: -LIFT * on.value },
      { scale: 0.975 + on.value * 0.035 },
    ],
  }));

  // Palavra a palavra só na linha do momento: nas outras não há o que acompanhar, e
  // animar cada trecho da letra inteira seriam centenas de nós animados.
  const sung = active && words ? wordAt(words, elapsed) : -1;

  return (
    <Animated.View style={[{ transformOrigin: 'left center' }, style]} onLayout={onLayout}>
      <Pressable onPress={onPress} disabled={!onPress}>
        {/* Quem separa a linha do momento das outras é a opacidade, como no Music da
            Apple. Dentro dela, a cor e a altura avançam palavra a palavra quando o
            arquivo traz o tempo de cada uma. */}
        {words ? (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'flex-end',
              columnGap: SIZE * 0.28,
            }}>
            {words.map((word, index) =>
              active ? (
                <Word key={index} text={word.text} sung={index <= sung} />
              ) : (
                // Fora da linha do momento, texto parado: mesmo estilo, sem nó animado.
                <Text key={index} style={WORD_STYLE}>
                  {word.text}
                </Text>
              )
            )}
          </View>
        ) : (
          <Display size={SIZE} weight={800} tracking={-0.03} style={{ lineHeight: SIZE * 1.22 }}>
            {text}
          </Display>
        )}
      </Pressable>
    </Animated.View>
  );
}

/** Uma palavra cronometrada: acende e sobe quando o tempo dela chega. */
function Word({ text, sung }: { text: string; sung: boolean }) {
  const hot = useSharedValue(sung ? 1 : 0);
  useEffect(() => {
    hot.value = withTiming(sung ? 1 : 0, SUNG);
  }, [sung, hot]);

  const style = useAnimatedStyle(() => ({
    color: interpolateColor(hot.value, [0, 1], [T.t46, T.full]),
    // Espera um pouco abaixo da linha e sobe ao ser cantada.
    transform: [{ translateY: WORD_LIFT * (1 - hot.value) }],
  }));

  return <Animated.Text style={[WORD_STYLE, style]}>{text}</Animated.Text>;
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
