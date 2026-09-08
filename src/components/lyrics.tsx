/**
 * A aba de letras, no comportamento do Music da Apple: a letra inteira rola, a linha do
 * momento fica opaca e ancorada perto do topo, as outras ficam esmaecidas, e tocar numa
 * linha salta para o trecho dela.
 *
 * ponytail: as linhas são dezenas por faixa e todas ficam montadas. Virar uma lista
 * virtualizada só valeria se aparecer letra com centenas de linhas.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  interpolateColor,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { F, T } from '@/constants/theme';
import { usePlayer } from '@/lib/player';
import { usePrefs, useT } from '@/lib/prefs';
import { lineAt, type LyricWord, type Lyrics } from '@/lib/lrc';
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
/**
 * Quanto uma palavra leva para acender, em segundos. Longa de propósito: é ela que dá o
 * "acendeu".
 */
const IGNITE = 0.38;

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
  onSeek,
}: {
  lyrics: Lyrics;
  onSeek: (seconds: number) => void;
}) {
  const { accent } = usePrefs();
  const clock = useLyricClock();
  const scroller = useRef<ScrollView>(null);
  const offsets = useRef<number[]>([]);
  const [height, setHeight] = useState(0);
  const manualUntil = useRef(0);
  /**
   * Se a primeira posição já foi assumida.
   *
   * Ela é dada **sem animação**. Abrindo o painel com a faixa em 2:30, animar significa
   * assistir a letra rolar do começo até a linha atual — era o "fica tudo sem a letra e
   * desce até ela". Da segunda em diante o movimento é animado, que é o que acompanha a
   * música.
   */
  const settled = useRef(false);
  /**
   * Sobe quando o conteúdo é medido.
   *
   * Os `offsets` vêm do `onLayout` de cada linha e moram num ref: escrevê-los não
   * re-renderiza nada. Sem esta dependência, o efeito abaixo rodava antes de haver
   * medida, desistia no `y == null`, e só voltava a rodar quando a *linha* mudasse — a
   * letra ficava parada no topo esperando o próximo verso.
   */
  const [laid, setLaid] = useState(0);

  /*
    A linha do momento é decidida na thread de UI, e só chega ao React quando **muda**.

    Antes o tempo entrava como número: a tela re-renderizava cinco vezes por segundo, com
    todas as linhas montadas, só para descobrir que a linha continuava a mesma. Agora o
    React acorda uma vez por verso.
  */
  const [at, setAt] = useState(-1);
  const lines = useMemo(() => (lyrics.synced ? lyrics.lines : []), [lyrics]);
  useAnimatedReaction(
    () => (lines.length ? lineAt(lines, clock.value) : -1),
    (next, previous) => {
      if (next !== previous) runOnJS(setAt)(next);
    },
    [lines]
  );

  // Rola para deixar a linha atual na âncora. O Apple Music não centraliza: a linha
  // sobe até cerca de um terço do topo e as seguintes esperam abaixo.
  useEffect(() => {
    if (at < 0 || !height) return;
    if (Date.now() < manualUntil.current) return;
    const y = offsets.current[at];
    if (y == null) return;
    scroller.current?.scrollTo({
      y: Math.max(0, y - height * ANCHOR),
      animated: settled.current,
    });
    settled.current = true;
  }, [at, height, laid]);

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
      // Dispara quando as linhas terminam de ser medidas: é o gatilho da primeira posição.
      onContentSizeChange={() => setLaid((n) => n + 1)}
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
          clock={clock}
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
  clock,
  accent,
  active,
  dimmed,
  onLayout,
  onPress,
}: {
  text: string;
  /** Trechos cronometrados, quando o arquivo é do formato por palavra. */
  words: LyricWord[] | null;
  /** O relógio da letra, em segundos. Ver `useLyricClock`. */
  clock: SharedValue<number>;
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

  /*
    Só opacidade e deslocamento. Nada de `scale`.

    Escalar texto no React Native rasteriza o glifo num tamanho e estica o bitmap: as
    bordas saem serrilhadas durante todo o movimento, que é o "serrilhado preto" que se
    via na letra. Subir a linha não reamostra nada.
  */
  const style = useAnimatedStyle(() => ({
    opacity: dimmed ? 0.3 + on.value * 0.7 : 0.82,
    // A linha do momento sobe um pouco e volta quando passa a vez — é o que dá o
    // movimento de karaokê sem tirar nada do lugar (transformação não mexe no layout).
    transform: [{ translateY: -LIFT * on.value }],
  }));

  return (
    <Animated.View style={style} onLayout={onLayout}>
      <Pressable onPress={onPress} disabled={!onPress}>
        {/* Quem separa a linha do momento das outras é a opacidade, como no Music da
            Apple. Dentro dela, a cor e a altura avançam palavra a palavra quando o
            arquivo traz o tempo de cada uma. */}
        {words ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {words.map((word, index) =>
              active ? (
                <Word key={index} word={word} clock={clock} accent={accent} />
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
 * assenta no branco. O pico no acento é o que marca *o instante* em que a palavra foi
 * cantada — sem ele, o que se vê é um degrau.
 *
 * O acender é lido do relógio a cada quadro, e não disparado por um `withTiming` quando o
 * React descobre que a palavra virou. O tempo do áudio chega a cada 200 ms: nessa cadência
 * as palavras acendiam de cinco em cinco por segundo, em degraus visíveis, e cada amostra
 * custava um render da letra inteira. Aqui a conta é um subtração na thread de UI, então
 * a ignição corre nos 60 quadros e o React não participa.
 */
function Word({
  word,
  clock,
  accent,
}: {
  word: LyricWord;
  clock: SharedValue<number>;
  accent: string;
}) {
  const style = useAnimatedStyle(() => {
    const hot = Math.min(1, Math.max(0, (clock.value - word.time) / IGNITE));
    return {
      color: interpolateColor(hot, [0, 0.45, 1], [T.t46, accent, T.full]),
      // Sem `scale`, pelo mesmo motivo da linha: escalar texto serrilha a borda do glifo.
      transform: [{ translateY: WORD_LIFT * (1 - hot) }],
    };
  });

  return (
    <Animated.Text style={[WORD_STYLE, { marginRight: word.space ? SPACE : 0 }, style]}>
      {word.text}
    </Animated.Text>
  );
}

/**
 * O relógio da letra: segundos de reprodução, atualizados a cada quadro.
 *
 * O status do player chega a cada 200 ms — cadência boa para uma barra de progresso, e
 * grosseira demais para karaokê: é dela que vinha a sensação de travamento. Aqui o valor
 * do status é o ponto de sincronia, e entre um e outro o relógio anda com o clock de
 * quadros, na thread de UI. Mesma ideia da fita do player, que interpola o deslocamento
 * entre amostras em vez de saltar.
 *
 * Pausado, o callback de quadro é desligado: sem áudio andando não há o que contar, e um
 * worklet por quadro com a tela parada é gasto puro.
 */
function useLyricClock(): SharedValue<number> {
  const { elapsed, playing } = usePlayer();
  const clock = useSharedValue(elapsed.value);

  // Cada amostra do áudio reassenta o relógio: é ela que manda, o quadro só preenche o vão.
  useAnimatedReaction(
    () => elapsed.value,
    (seconds) => {
      clock.value = seconds;
    }
  );

  const frame = useFrameCallback(({ timeSincePreviousFrame }) => {
    // Escrever num shared value de dentro de um worklet é o contrato do Reanimated; a
    // regra de imutabilidade do compilador não distingue isto de mutar valor de render.
    // eslint-disable-next-line react-hooks/immutability
    clock.value += (timeSincePreviousFrame ?? 16) / 1000;
  }, false);

  useEffect(() => {
    frame.setActive(playing);
  }, [playing, frame]);

  return clock;
}

/** Estado vazio, na mesma linguagem do resto do app. */
export function NoLyrics({ onPick }: { onPick?: () => void }) {
  const t = useT();
  return (
    <EmptyState
      icon={<LyricsIcon size={30} color={T.full} />}
      title={t('lyrics.none')}
      action={onPick ? t('lyrics.pick') : undefined}
      onAction={onPick}>
      {t('lyrics.none.body')}
    </EmptyState>
  );
}
