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
import { Note, Trash } from '@/components/icons';
import { SectionLabel } from '@/components/section-label';
import { Body, Display, Mono } from '@/components/text';
import { C, CHROME_HEIGHT, PADDING, R, T, alpha } from '@/constants/theme';
import { chromeScroll } from '@/lib/chrome-scroll';
import { useTabTop } from '@/lib/tab-top';
import { clearHistory, playSpan, playsBetween } from '@/lib/db';
import {
  boundsOf,
  byHour,
  compareMonths,
  monthOf,
  peakHour,
  rolling,
  sameMonth,
  SPANS,
  topAlbums,
  topArtists,
  topTracks,
  totals,
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
  /** O painel de meses fica escondido até alguém pedir: é a escolha rara. */
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

  /**
   * Os meses que o seletor oferece, do mais recente para o mais antigo.
   *
   * Saem do próprio histórico: oferecer 2019 a quem instalou o app semana passada é
   * oferecer telas vazias. Sem escuta nenhuma, o seletor nem aparece.
   */
  const months = useMemo<Month[]>(() => {
    let span;
    try {
      span = playSpan();
    } catch {
      return [];
    }
    if (!span) return [];
    const out: Month[] = [];
    // Nunca além do mês de agora: um relógio adiantado num aparelho já gravou escuta com
    // data no futuro, e oferecer esse mês seria oferecer uma tela que não existe.
    const here = monthOf(readAt);
    const newest = monthOf(span.last);
    const last = compareMonths(newest, here) <= 0 ? newest : here;
    for (let m = monthOf(span.first); compareMonths(m, last) <= 0; ) {
      out.push(m);
      m = m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 };
    }
    return out.reverse();
  }, [readAt]);

  const monthName = (m: Month) =>
    new Date(m.year, m.month, 1).toLocaleDateString(localeOf(lang), {
      month: 'short',
      year: 'numeric',
    });

  const custom = period.kind === 'months';
  const customLabel = !custom
    ? t('stats.pick')
    : sameMonth(period.from, period.to)
      ? monthName(period.from)
      : t('stats.range', { from: monthName(period.from), to: monthName(period.to) });

  const summary = totals(plays);
  const hours = byHour(plays);
  const peak = peakHour(plays);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={list}
        {...chromeScroll}
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
          Os atalhos de sempre, e um chip que abre a escolha por mês.

          As duas formas convivem porque respondem a perguntas diferentes: "últimos 30
          dias" não exige escolha nenhuma, e "agosto" é o que se quer para comparar dois
          meses — uma janela corrida nunca dá isso, porque muda de conteúdo todo dia.
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
          {months.length > 0 && (
            <Chip
              label={customLabel}
              on={custom}
              accent={accent}
              onPress={() => setPicking((open) => !open)}
            />
          )}
        </ChipRow>

        {picking && (
          <MonthPicker
            months={months}
            period={period}
            accent={accent}
            name={monthName}
            onPick={(month) => {
              /*
                O primeiro toque escolhe um mês; o segundo estende até ele.

                Tocar de novo no mesmo mês volta ao mês sozinho, senão não haveria como
                desfazer um intervalo sem sair do painel.
              */
              setPeriod((current) => {
                if (current.kind !== 'months') return { kind: 'months', from: month, to: month };
                if (sameMonth(current.from, current.to)) {
                  return sameMonth(current.from, month)
                    ? current
                    : { kind: 'months', from: current.from, to: month };
                }
                return { kind: 'months', from: month, to: month };
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
      </ScrollView>
    </View>
  );
}

/**
 * Os meses com escuta, em grade, com o intervalo escolhido aceso.
 *
 * Uma grade e não um seletor de datas do sistema: o histórico é do aparelho e cresce mês
 * a mês, então a granularidade útil é o mês — e uma grade de meses existentes não permite
 * escolher um período vazio, o que um calendário permitiria.
 */
function MonthPicker({
  months,
  period,
  accent,
  name,
  onPick,
}: {
  months: Month[];
  period: Period;
  accent: string;
  name: (m: Month) => string;
  onPick: (m: Month) => void;
}) {
  const t = useT();

  /** Se o mês cai dentro do que está escolhido — as pontas incluídas. */
  const inside = (m: Month) => {
    if (period.kind !== 'months') return false;
    const [first, last] =
      compareMonths(period.from, period.to) <= 0
        ? [period.from, period.to]
        : [period.to, period.from];
    return compareMonths(m, first) >= 0 && compareMonths(m, last) <= 0;
  };

  const edge = (m: Month) =>
    period.kind === 'months' && (sameMonth(m, period.from) || sameMonth(m, period.to));

  return (
    <View style={{ marginTop: 14 }}>
      <Body size={12} color={T.t42} style={{ lineHeight: 17, marginBottom: 10 }}>
        {t('stats.pickHint')}
      </Body>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
        {months.map((m) => {
          const on = inside(m);
          return (
            <Pressable
              key={`${m.year}-${m.month}`}
              onPress={() => onPick(m)}
              style={{
                paddingHorizontal: 12,
                height: 32,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                // A ponta do intervalo é o acento cheio; o miolo é o acento apagado.
                backgroundColor: edge(m) ? accent : on ? alpha(accent, 0.18) : C.card,
                borderWidth: 1,
                borderColor: on ? alpha(accent, 0.5) : 'transparent',
              }}>
              <Body size={12.5} weight={600} color={edge(m) ? C.onAccent : on ? T.full : T.t62}>
                {name(m)}
              </Body>
            </Pressable>
          );
        })}
      </View>
    </View>
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
