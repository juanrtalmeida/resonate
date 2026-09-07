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
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { F, T } from '@/constants/theme';
import { usePrefs } from '@/lib/prefs';
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

/** Espaço entre trechos que o arquivo separou. Um espaço da fonte, mais ou menos. */
const SPACE = SIZE * 0.26;

/** Mola de todo o movimento da letra: sem repique, só um assentar macio. */
const SOFT = { damping: 22, stiffness: 120, mass: 0.7 };
/** A ignição de uma palavra. Longa de propósito: é ela que dá o "acendeu". */
const SUNG = { duration: 380, easing: Easing.out(Easing.cubic) };

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
  const { accent } = usePrefs();
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
          accent={accent}
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
  accent,
  active,
  dimmed,
  onLayout,
  onPress,
}: {
  text: string;
  /** Trechos cronometrados, quando o arquivo é do formato por palavra. */
  words: LyricWord[] | null;
  elapsed: number;
  /** A palavra acesa passa por ele antes de assentar no branco. */
  accent: string;
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
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {words.map((word, index) =>
              active ? (
                <Word key={index} word={word} sung={index <= sung} accent={accent} />
              ) : (
                // Fora da linha do momento, texto parado: mesmo estilo, sem nó animado.
                <Text key={index} style={[WORD_STYLE, { marginRight: word.space ? SPACE : 0 }]}>
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

/**
 * Uma palavra cronometrada.
 *
 * Acender não é trocar de cor: ela sobe do lugar onde esperava, passa pelo acento e
 * assenta no branco, crescendo um pouco no meio do caminho. O pico no acento é o que
 * marca *o instante* em que a palavra foi cantada — sem ele, o que se vê é um degrau.
 *
 * `hot` começa sempre em zero, mesmo quando a palavra já deveria estar acesa: assim a
 * primeira palavra da linha, que monta junto com a linha, também acende em vez de já
 * nascer branca.
 */
function Word({ word, sung, accent }: { word: LyricWord; sung: boolean; accent: string }) {
  const hot = useSharedValue(0);
  useEffect(() => {
    hot.value = withTiming(sung ? 1 : 0, SUNG);
  }, [sung, hot]);

  const style = useAnimatedStyle(() => {
    // Sobe até 1 no meio da ignição e volta a 0: é o brilho passando pela palavra.
    const flash = interpolate(hot.value, [0, 0.5, 1], [0, 1, 0]);
    return {
      color: interpolateColor(hot.value, [0, 0.45, 1], [T.t46, accent, T.full]),
      transform: [
        { translateY: WORD_LIFT * (1 - hot.value) },
        { scale: 1 + flash * 0.07 },
      ],
    };
  });

  return (
    <Animated.Text
      style={[
        WORD_STYLE,
        { marginRight: word.space ? SPACE : 0, transformOrigin: 'center bottom' },
        style,
      ]}>
      {word.text}
    </Animated.Text>
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
