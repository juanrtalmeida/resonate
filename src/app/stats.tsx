/**
 * Estatísticas de escuta.
 *
 * A pergunta que todo app de música responde em dezembro, respondida aqui o ano inteiro e
 * sem servidor nenhum: o que conta as horas é a tabela `plays` do banco do aparelho, e o
 * que a preenche é o player quando uma faixa passa de meio minuto. Ver `lib/history.ts`.
 *
 * Um destino da barra inferior, ao lado de Biblioteca, Busca e Ajustes — e não uma aba da
 * biblioteca. As abas de lá são recortes do acervo (álbuns, artistas, faixas); isto é uma
 * leitura sobre o acervo, e a barra é onde moram as leituras de topo.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip, ChipRow } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { ChevronLeft, ChevronRight, Note, Trash } from '@/components/icons';
import { Press } from '@/components/press';
import { SectionLabel } from '@/components/section-label';
import { Body, Display, Mono } from '@/components/text';
import { C, CHROME_HEIGHT, PADDING, R, T, alpha } from '@/constants/theme';
import { useChromeScroll } from '@/lib/chrome-scroll';
import { useTabTop } from '@/lib/tab-top';
import { clearHistory, playSpan, playsBetween } from '@/lib/db';
import {
  addMonths,
  boundsOf,
  byHour,
  compareDays,
  compareMonths,
  dayKey,
  dayOf,
  daysWithPlays,
  monthGrid,
  monthOfDay,
  peakHour,
  rolling,
  sameDay,
  SPANS,
  topAlbums,
  topArtists,
  topTracks,
  totals,
  type Day,
  type Month,
  type Period,
  type Play,
  type Rank,
  type Span,
} from '@/lib/history';
import { usePrefs, useLang, useT } from '@/lib/prefs';
import { localeOf, type Key } from '@/lib/i18n';

const SPAN_LABEL: Record<Span, Key> = {
  week: 'stats.span.week',
  month: 'stats.span.month',
  year: 'stats.span.year',
  all: 'stats.span.all',
};

/** Quantos entram em cada ranking. Cinco cabe na tela sem rolar dentro da seção. */
const TOP = 5;

export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const { accent } = usePrefs();
  const t = useT();
  const lang = useLang();

  // Tocar em Escuta já estando nela volta ao topo, como nas outras abas.
  const list = useRef<ScrollView>(null);
  useTabTop(
    'Stats',
    useCallback(() => list.current?.scrollTo({ y: 0, animated: true }), [])
  );

  const [period, setPeriod] = useState<Period>(() => rolling('month'));
  /** O calendário fica escondido até alguém pedir: é a escolha rara. */
  const [picking, setPicking] = useState(false);
  /**
   * O instante em que a tela leu o banco.
   *
   * Faz dois trabalhos: é o "agora" a partir do qual os períodos recuam, e é o gatilho de
   * releitura — o banco não avisa quem está montado, então apagar o histórico avança este
   * valor e a consulta refaz. Um contador separado para isso deixaria `Date.now()` dentro
   * do `useMemo`, que é impuro e o lint recusa, com razão: dois renders seguidos
   * devolveriam janelas diferentes sem nada ter mudado.
   */
  const [readAt, setReadAt] = useState(() => Date.now());

  const plays = useMemo<Play[]>(() => {
    try {
      const { from, to } = boundsOf(period, readAt);
      return playsBetween(from, to);
    } catch {
      return []; // banco indisponível: a tela mostra o vazio em vez de quebrar
    }
  }, [period, readAt]);

  /** O dia de hoje, do mesmo relógio que a consulta usou. */
  const today = useMemo(() => dayOf(readAt), [readAt]);

  /**
   * Os dias que o calendário deixa alcançar.
   *
   * O piso é a primeira escuta registrada: deixar navegar até 2019 quem instalou o app
   * semana passada é oferecer folhas vazias do calendário. O teto é **hoje** — um relógio
   * adiantado num aparelho já gravou escuta com data no futuro, e um dia que ainda não
   * aconteceu não tem o que mostrar.
   *
   * Sem escuta nenhuma não há limite a calcular, e o chip do seletor nem aparece.
   */
  const reach = useMemo(() => {
    let span;
    try {
      span = playSpan();
    } catch {
      return null;
    }
    if (!span) return null;
    const first = dayOf(span.first);
    return { first: compareDays(first, today) <= 0 ? first : today, last: today };
  }, [today]);

  /**
   * O dia em texto. O ano só aparece quando não é o corrente — "12 de set de 2026" repetido
   * em toda escolha é ruído, e sem ele um dia de outro ano viraria o dia deste.
   */
  const dayName = (d: Day) =>
    new Date(d.year, d.month, d.day).toLocaleDateString(localeOf(lang), {
      day: 'numeric',
      month: 'short',
      ...(d.year === today.year ? {} : { year: 'numeric' }),
    });

  const custom = period.kind === 'days';
  const customLabel = !custom
    ? t('stats.pick')
    : sameDay(period.from, period.to)
      ? dayName(period.from)
      : t('stats.range', {
          from: dayName(compareDays(period.from, period.to) <= 0 ? period.from : period.to),
          to: dayName(compareDays(period.from, period.to) <= 0 ? period.to : period.from),
        });

  const scroll = useChromeScroll();

  const summary = totals(plays);
  const hours = byHour(plays);
  const peak = peakHour(plays);

  return (
    <View style={{ flex: 1 }}>
      <Animated.ScrollView
        ref={list}
        {...scroll}
        contentContainerStyle={{
          paddingTop: insets.top + 26,
          paddingBottom: CHROME_HEIGHT + insets.bottom,
          paddingHorizontal: PADDING,
        }}>
        {/* Sem botão de voltar: é uma aba, e aba não tem de onde voltar. */}
        <Display size={34} tracking={-0.04}>
          {t('stats.title')}
        </Display>
        <Body size={12.5} color={T.t42} style={{ marginTop: 6, lineHeight: 18 }}>
          {t('stats.openBlurb')}
        </Body>

        {/*
          Os atalhos de sempre, e um chip que abre o calendário.

          As duas formas convivem porque respondem a perguntas diferentes: "últimos 30
          dias" não exige escolha nenhuma, e "do dia 12 ao 19" é o recorte que não recua
          com o relógio — uma janela corrida nunca dá isso, porque muda de conteúdo todo
          dia.
        */}
        <ChipRow style={{ marginTop: 16 }}>
          {SPANS.map((option) => (
            <Chip
              key={option}
              label={t(SPAN_LABEL[option])}
              on={!custom && period.span === option}
              accent={accent}
              onPress={() => {
                setPeriod(rolling(option));
                setPicking(false);
              }}
            />
          ))}
          {reach && (
            <Chip
              label={customLabel}
              on={custom}
              accent={accent}
              onPress={() => setPicking((open) => !open)}
            />
          )}
        </ChipRow>

        {picking && reach && (
          <DayPicker
            period={period}
            reach={reach}
            readAt={readAt}
            accent={accent}
            onPick={(day) => {
              /*
                O primeiro toque escolhe um dia; o segundo estende o período até ele.

                Tocar de novo no mesmo dia volta ao dia sozinho, senão não haveria como
                desfazer um intervalo sem sair do calendário.
              */
              setPeriod((current) => {
                if (current.kind !== 'days') return { kind: 'days', from: day, to: day };
                if (sameDay(current.from, current.to)) {
                  return sameDay(current.from, day)
                    ? current
                    : { kind: 'days', from: current.from, to: day };
                }
                return { kind: 'days', from: day, to: day };
              });
            }}
          />
        )}

        {plays.length === 0 ? (
          <EmptyState icon={<Note size={26} color={T.full} />} title={t('stats.empty')}>
            {t('stats.emptyBody')}
          </EmptyState>
        ) : (
          // A `key` faz o bloco reentrar ao trocar de período: sem ela os números saltam
          // de um valor para outro sem que nada diga que a pergunta mudou.
          <Animated.View key={customLabel} entering={FadeIn.duration(220)}>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 22 }}>
              <Figure value={summary.seconds} unit={t('stats.hours')} asHours accent={accent} />
              <Figure value={summary.tracks} unit={t('stats.tracksCounted')} />
              <Figure value={summary.artists} unit={t('stats.artistsCounted')} />
            </View>

            <SectionLabel title={t('stats.when')} />
            <Hours hours={hours} accent={accent} />
            {peak !== null && (
              <Body size={12.5} color={T.t5} style={{ marginTop: 10 }}>
                {t('stats.peak', { hour: peak, next: (peak + 1) % 24 })}
              </Body>
            )}

            <Top title={t('stats.topArtists')} rows={topArtists(plays)} accent={accent} />
            <Top title={t('stats.topAlbums')} rows={topAlbums(plays)} accent={accent} />
            <Top title={t('stats.topTracks')} rows={topTracks(plays)} accent={accent} />

            <Forget
              onDone={() => {
                clearHistory();
                setReadAt(Date.now());
              }}
            />
          </Animated.View>
        )}
      </Animated.ScrollView>
    </View>
  );
}

/**
 * O calendário de onde saem os dois dias do período.
 *
 * Um mês por vez, com setas para virar a folha — e não a lista de todos os dias com
 * escuta, que numa biblioteca de um ano seriam trezentas pílulas. A grade também é o que
 * dá contexto à escolha: "sábado a domingo" é uma pergunta que só existe quando se vê a
 * semana.
 *
 * A escolha era por mês inteiro. A grade de meses tinha uma vantagem de graça — ela só
 * oferecia meses que existiam, então não havia como escolher um período vazio. Aqui isso
 * volta como informação e não como proibição: o dia com escuta leva um ponto embaixo, e o
 * dia vazio continua escolhível, porque "não ouvi nada naquela semana" também é resposta.
 */
function DayPicker({
  period,
  reach,
  readAt,
  accent,
  onPick,
}: {
  period: Period;
  /** O primeiro e o último dia que o calendário deixa alcançar, pontas incluídas. */
  reach: { first: Day; last: Day };
  /** O instante da leitura do banco: muda quando o histórico é apagado, e remarca a grade. */
  readAt: number;
  accent: string;
  onPick: (d: Day) => void;
}) {
  const t = useT();
  const lang = useLang();

  /**
   * A folha aberta. Começa no mês do que está escolhido, senão no último alcançável —
   * abrir o calendário em janeiro de 2025 para quem quer ontem seria uma navegação inútil.
   */
  const [shown, setShown] = useState<Month>(() =>
    monthOfDay(period.kind === 'days' ? period.to : reach.last)
  );

  /**
   * Os dias com escuta do mês aberto.
   *
   * Consultado por mês, e não o histórico inteiro de uma vez: são no máximo 31 dias para
   * marcar, e o banco é local. Vive aqui dentro porque o componente só monta quando o
   * calendário abre — na tela fechada esta consulta não acontece.
   *
   * `readAt` entra nas dependências sem aparecer no corpo, e é de propósito: o banco não
   * avisa quem está montado, então apagar o histórico avança esse valor e é ele que manda
   * remarcar a grade. É o mesmo papel que ele tem no `plays` da tela.
   */
  const marks = useMemo(() => {
    try {
      const from = new Date(shown.year, shown.month, 1).getTime();
      const to = new Date(shown.year, shown.month + 1, 1).getTime() - 1;
      return daysWithPlays(playsBetween(from, to));
    } catch {
      return new Set<string>();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, readAt]);

  const cells = useMemo(() => monthGrid(shown), [shown]);

  /** Até onde as setas vão. Fora disso não há folha para virar. */
  const canBack = compareMonths(shown, monthOfDay(reach.first)) > 0;
  const canForward = compareMonths(shown, monthOfDay(reach.last)) < 0;

  /** As pontas do período, já em ordem — a escolha pode ter sido feita de trás para a frente. */
  const ends =
    period.kind === 'days'
      ? compareDays(period.from, period.to) <= 0
        ? [period.from, period.to]
        : [period.to, period.from]
      : null;

  const inside = (d: Day) =>
    !!ends && compareDays(d, ends[0]) >= 0 && compareDays(d, ends[1]) <= 0;
  const edge = (d: Day) => !!ends && (sameDay(d, ends[0]) || sameDay(d, ends[1]));
  /** Fora do alcance: dia anterior à primeira escuta, ou depois de hoje. */
  const beyond = (d: Day) =>
    compareDays(d, reach.first) < 0 || compareDays(d, reach.last) > 0;

  const monthLabel = new Date(shown.year, shown.month, 1).toLocaleDateString(localeOf(lang), {
    month: 'long',
    year: 'numeric',
  });

  /**
   * As iniciais dos dias da semana, do domingo em diante — na língua do usuário, e tiradas
   * do próprio `Date`. Uma tabela nossa por idioma teria de crescer a cada idioma novo, e
   * o `Intl` já sabe disso em todos eles.
   *
   * `narrow` dá uma letra em português e em inglês, e o caractere certo em japonês e em
   * chinês, que não têm "inicial".
   */
  const weekdays = useMemo(() => {
    const locale = localeOf(lang);
    // 4 de janeiro de 2026 é um domingo: a semana inteira sai a partir dele.
    return Array.from({ length: 7 }, (_, i) =>
      new Date(2026, 0, 4 + i).toLocaleDateString(locale, { weekday: 'narrow' })
    );
  }, [lang]);

  return (
    <View style={{ marginTop: 14 }}>
      <Body size={12} color={T.t42} style={{ lineHeight: 17, marginBottom: 12 }}>
        {t('stats.pickHint')}
      </Body>

      {/* A folha aberta, entre as duas setas. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}>
        <Arrow
          back
          enabled={canBack}
          onPress={() => setShown((m) => addMonths(m, -1))}
          label={t('stats.prevMonth')}
        />
        {/* `capitalize` porque o `Intl` devolve "setembro" em minúscula em pt e es. */}
        <Body size={13.5} weight={600} style={{ textTransform: 'capitalize' }}>
          {monthLabel}
        </Body>
        <Arrow
          enabled={canForward}
          onPress={() => setShown((m) => addMonths(m, 1))}
          label={t('stats.nextMonth')}
        />
      </View>

      <View style={{ flexDirection: 'row' }}>
        {weekdays.map((initial, at) => (
          <View key={at} style={{ flex: 1, alignItems: 'center', paddingBottom: 6 }}>
            <Mono size={9} weight={500} tracking={0.12} caps color={T.t34}>
              {initial}
            </Mono>
          </View>
        ))}
      </View>

      {/*
        Sete colunas por `flexBasis`, e não por largura calculada da tela: a grade vive
        dentro do recuo do conteúdo, e medir a tela para descobrir a largura dela erraria
        pelo recuo. `flexWrap` quebra a linha a cada sete de 1/7.
      */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 4 }}>
        {cells.map((day, at) =>
          day === null ? (
            <View key={`gap${at}`} style={{ width: `${100 / 7}%`, height: CELL }} />
          ) : (
            <DayCell
              key={dayKey(day)}
              day={day}
              accent={accent}
              on={inside(day)}
              end={edge(day)}
              played={marks.has(dayKey(day))}
              disabled={beyond(day)}
              onPress={() => onPick(day)}
            />
          )
        )}
      </View>
    </View>
  );
}

/** Altura de uma célula do calendário. 40 é o alvo de toque mínimo confortável. */
const CELL = 40;

function DayCell({
  day,
  accent,
  on,
  end,
  played,
  disabled,
  onPress,
}: {
  day: Day;
  accent: string;
  /** Dentro do período escolhido, pontas incluídas. */
  on: boolean;
  /** Uma das duas pontas do período. */
  end: boolean;
  /** Teve escuta: leva o ponto. */
  played: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <View style={{ width: `${100 / 7}%`, height: CELL, padding: 2 }}>
      <Press
        onPress={onPress}
        disabled={disabled}
        style={{
          flex: 1,
          borderRadius: R.r13,
          alignItems: 'center',
          justifyContent: 'center',
          // A ponta do intervalo é o acento cheio; o miolo é o acento apagado.
          backgroundColor: end ? accent : on ? alpha(accent, 0.18) : 'transparent',
          borderWidth: 1,
          borderColor: on ? alpha(accent, 0.5) : 'transparent',
        }}
        dim={0.24}>
        <Body size={12.5} weight={end ? 600 : 500} color={end ? C.onAccent : on ? T.full : T.t72}>
          {day.day}
        </Body>
        {/*
          O ponto do dia com escuta. Fica **fora** do fluxo: como irmão do número ele
          empurrava o número para cima e a coluna deixava de alinhar entre um dia com
          escuta e um sem.
        */}
        <View
          style={{
            position: 'absolute',
            bottom: 5,
            width: 3,
            height: 3,
            borderRadius: 1.5,
            backgroundColor: played ? (end ? C.onAccent : accent) : 'transparent',
          }}
        />
      </Press>
    </View>
  );
}

/** Seta de virar o mês. Desabilitada quando não há folha do lado. */
function Arrow({
  back = false,
  enabled,
  onPress,
  label,
}: {
  back?: boolean;
  enabled: boolean;
  onPress: () => void;
  label: string;
}) {
  return (
    <Press
      onPress={onPress}
      disabled={!enabled}
      accessibilityLabel={label}
      hitSlop={8}
      style={{
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: C.card,
      }}>
      {back ? (
        <ChevronLeft size={15} color={T.t72} />
      ) : (
        <ChevronRight size={15} color={T.t72} />
      )}
    </Press>
  );
}

/** Um número grande com a unidade embaixo. Horas viram minutos quando são poucas. */
function Figure({
  value,
  unit,
  asHours,
  accent,
}: {
  value: number;
  unit: string;
  asHours?: boolean;
  accent?: string;
}) {
  const t = useT();
  // Abaixo de uma hora, "0 horas" é pior que inútil — é errado no que o usuário sente.
  const shown = asHours ? Math.round(value / 3600) : value;
  const minutes = asHours && shown === 0;

  return (
    <View
      style={{
        flex: 1,
        paddingVertical: 16,
        borderRadius: R.r15,
        backgroundColor: C.card,
        alignItems: 'center',
        gap: 3,
      }}>
      <Display size={26} tracking={-0.03} color={accent ?? T.full}>
        {minutes ? Math.round(value / 60) : shown}
      </Display>
      <Body size={11.5} color={T.t42}>
        {minutes ? t('stats.minutes') : unit}
      </Body>
    </View>
  );
}

/**
 * As 24 horas do dia em barras.
 *
 * Proporcional ao maior valor, e não a um teto fixo: quem ouve vinte minutos por dia e
 * quem ouve seis horas têm o mesmo direito a ver a própria forma. As marcas ficam em 0, 6,
 * 12 e 18 — vinte e quatro rótulos não cabem, e sem nenhum o gráfico não diz nada.
 */
function Hours({ hours, accent }: { hours: number[]; accent: string }) {
  const peak = Math.max(...hours, 1);

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 88 }}>
        {hours.map((seconds, hour) => (
          <View
            key={hour}
            style={{
              flex: 1,
              // Um mínimo visível: uma barra de zero altura some, e some junto com ela a
              // informação de que aquela hora existe e está vazia.
              height: Math.max(3, (seconds / peak) * 88),
              borderRadius: 3,
              backgroundColor: seconds > 0 ? alpha(accent, 0.25 + 0.75 * (seconds / peak)) : T.t08,
            }}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 7 }}>
        {[0, 6, 12, 18].map((hour) => (
          <View key={hour} style={{ flex: 1 }}>
            <Mono size={9} color={T.t34}>
              {String(hour).padStart(2, '0')}
            </Mono>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Um ranking, com a barra proporcional ao primeiro colocado atrás de cada linha. */
function Top({ title, rows, accent }: { title: string; rows: Rank[]; accent: string }) {
  const t = useT();
  if (!rows.length) return null;
  const top = rows.slice(0, TOP);
  const peak = top[0].seconds || 1;

  return (
    <View>
      <SectionLabel title={title} />
      <View style={{ gap: 8 }}>
        {top.map((row, at) => (
          <View
            key={row.key}
            style={{ borderRadius: R.r13, backgroundColor: C.card, overflow: 'hidden' }}>
            {/* A barra é fundo, não conteúdo: comparar dura menos que ler o número. */}
            <View
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${(row.seconds / peak) * 100}%`,
                backgroundColor: alpha(accent, 0.14),
              }}
            />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 14,
                paddingVertical: 11,
              }}>
              <Mono size={11} weight={500} color={at === 0 ? accent : T.t34}>
                {String(at + 1).padStart(2, '0')}
              </Mono>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Body size={13.5} weight={600} tracking={-0.01} numberOfLines={1}>
                  {row.label}
                </Body>
                {row.sub ? (
                  <Body size={11} color={T.t42} numberOfLines={1} style={{ marginTop: 1 }}>
                    {row.sub}
                  </Body>
                ) : null}
              </View>
              <Mono size={10} color={T.t42}>
                {t('stats.plays', { n: row.plays, min: Math.max(1, Math.round(row.seconds / 60)) })}
              </Mono>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Apagar o histórico, com a confirmação no próprio botão. */
function Forget({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [asked, setAsked] = useState(false);

  return (
    <Pressable
      onPress={() => {
        if (!asked) return setAsked(true);
        onDone();
        setAsked(false);
      }}
      style={{
        marginTop: 28,
        paddingVertical: 15,
        borderRadius: R.r15,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 9,
        backgroundColor: asked ? alpha(C.danger, 0.16) : 'transparent',
        borderWidth: 1,
        borderColor: asked ? alpha(C.danger, 0.5) : T.t07,
      }}>
      <Trash size={16} color={asked ? C.danger : T.t5} />
      <Body size={13.5} weight={600} color={asked ? C.danger : T.t5}>
        {t(asked ? 'common.delete' : 'stats.forget')}
      </Body>
    </Pressable>
  );
}
