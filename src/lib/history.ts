/**
 * Estatísticas de escuta, calculadas do histórico local.
 *
 * O que existe aqui não existe em nenhum servidor: as linhas vêm da tabela `plays` do
 * banco do próprio aparelho, escritas pelo player quando uma faixa é de fato ouvida. É a
 * versão do "seu ano em música" que cabe num app sem rede — e a única honesta, porque
 * ninguém precisou mandar a escuta para lugar nenhum para tê-la.
 *
 * Tudo aqui é puro e roda em `node --test`: a agregação é onde erro passa despercebido,
 * já que um total errado continua parecendo um total. Quem escreve as linhas é
 * `PlayerProvider`; quem as guarda é `lib/db.ts`.
 */

/** Uma escuta registrada. Denormalizada de propósito — ver `keep` abaixo. */
export type Play = {
  /** Quando terminou, em ms. */
  at: number;
  trackId: string;
  albumId: string;
  artist: string;
  album: string;
  title: string;
  /** Segundos de áudio realmente ouvidos, já descontados os saltos. */
  seconds: number;
};

/**
 * A partir de quantos segundos uma faixa conta como ouvida.
 *
 * Trinta: abaixo disso é alguém procurando o que ouvir, e contar isso encheria as
 * estatísticas de faixas que ninguém escutou. É o mesmo limiar que o scrobbling usa há
 * vinte anos, pelo mesmo motivo.
 */
export const MIN_LISTEN = 30;

export const keep = (seconds: number): boolean => seconds >= MIN_LISTEN;

export type Span = 'week' | 'month' | 'year' | 'all';

export const SPANS: Span[] = ['week', 'month', 'year', 'all'];

const DAY = 86_400_000;

/** Um intervalo fechado, em ms. É o que toda consulta de histórico recebe. */
export type Bounds = { from: number; to: number };

/**
 * O período consultado: uma janela que corre com o relógio, ou dois dias escolhidos à mão.
 *
 * As duas formas coexistem porque respondem a perguntas diferentes. "Últimos 30 dias" é
 * a pergunta de sempre e não exige escolha nenhuma; "do dia 12 ao dia 19" é a pergunta de
 * quem quer um recorte que não recua com o relógio — uma janela corrida nunca dá isso,
 * porque muda de conteúdo a cada dia que passa.
 *
 * A escolha era por mês, e a granularidade não bastava: uma viagem, um fim de semana ou a
 * semana de lançamento de um disco não começam no dia 1º. Dois dias descrevem qualquer um
 * desses recortes, e o mês inteiro continua a um gesto de distância — primeiro dia,
 * último dia.
 */
export type Period =
  | { kind: 'rolling'; span: Span }
  /** Dias inteiros, da meia-noite do primeiro ao fim do último. `to` é inclusivo. */
  | { kind: 'days'; from: Day; to: Day };

/** Um mês, com o mês de 0 a 11 como no `Date`. */
export type Month = { year: number; month: number };

/** Um dia do calendário. `month` de 0 a 11 e `day` de 1 a 31, como no `Date`. */
export type Day = { year: number; month: number; day: number };

export const rolling = (span: Span): Period => ({ kind: 'rolling', span });

/** O instante a partir do qual contar, para uma janela corrida. */
export function startOf(span: Span, now: number): number {
  if (span === 'week') return now - 7 * DAY;
  if (span === 'month') return now - 30 * DAY;
  if (span === 'year') return now - 365 * DAY;
  return 0;
}

export const sameMonth = (a: Month, b: Month): boolean =>
  a.year === b.year && a.month === b.month;

/** Ordem no calendário. Negativo quando `a` vem antes. */
export const compareMonths = (a: Month, b: Month): number =>
  a.year - b.year || a.month - b.month;

export const monthOf = (at: number): Month => {
  const d = new Date(at);
  return { year: d.getFullYear(), month: d.getMonth() };
};

export const sameDay = (a: Day, b: Day): boolean =>
  a.year === b.year && a.month === b.month && a.day === b.day;

/** Ordem no calendário. Negativo quando `a` vem antes. */
export const compareDays = (a: Day, b: Day): number =>
  a.year - b.year || a.month - b.month || a.day - b.day;

export const dayOf = (at: number): Day => {
  const d = new Date(at);
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
};

export const monthOfDay = (d: Day): Month => ({ year: d.year, month: d.month });

/**
 * Chave estável de um dia, para `Set` e `Map`.
 *
 * Zero-padded para a chave ordenar como o calendário ordena — o seletor marca os dias com
 * escuta a partir de um `Set` destas, e uma chave que ordena de graça evita um comparador
 * separado quando se quer o primeiro ou o último.
 */
export const dayKey = (d: Day): string =>
  `${d.year}-${String(d.month + 1).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;

/** Quantos dias tem o mês. Dia 0 do mês seguinte é o último dia deste. */
export const monthLength = (m: Month): number => new Date(m.year, m.month + 1, 0).getDate();

/**
 * Anda `delta` meses. Pela conta em meses absolutos, e não por `setMonth`: somar 1 a 31 de
 * janeiro com `Date` devolve 3 de março, porque fevereiro não tem 31 — e o seletor só
 * quer virar a folha do calendário, não mexer no dia.
 */
export function addMonths(m: Month, delta: number): Month {
  const total = m.year * 12 + m.month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/**
 * As células de um mês em grade de sete colunas.
 *
 * Os `null` da frente são os dias da semana anterior: sem eles o dia 1º cai debaixo da
 * coluna errada e a grade inteira mente. A semana começa no domingo, como `Date.getDay` e
 * como `byWeekday` — um começo só, em vez de dois que precisariam concordar.
 *
 * Sem `null` no fim: a grade quebra por `flexWrap`, e célula vazia no rabo não alinha
 * nada que já não esteja alinhado.
 */
export function monthGrid(m: Month): (Day | null)[] {
  const lead = new Date(m.year, m.month, 1).getDay();
  const cells: (Day | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= monthLength(m); day++) cells.push({ year: m.year, month: m.month, day });
  return cells;
}

/**
 * O intervalo de um período.
 *
 * Em hora **local**, e não UTC: quem escolhe o dia 12 quer o dia 12 do relógio dele. O
 * `Date` com ano, mês e dia já resolve isso, inclusive a virada de mês e de ano — dia
 * `day + 1` de um dia 31 cai no primeiro do mês seguinte sem precisar saber onde estava.
 */
export function boundsOf(period: Period, now: number): Bounds {
  if (period.kind === 'rolling') return { from: startOf(period.span, now), to: now };

  // Fora de ordem é escolha válida: quem toca no dia 19 e depois no dia 12 quis o
  // intervalo, não uma seleção inválida.
  const [first, last] =
    compareDays(period.from, period.to) <= 0
      ? [period.from, period.to]
      : [period.to, period.from];

  return {
    from: new Date(first.year, first.month, first.day).getTime(),
    // Meia-noite do dia seguinte ao último, menos um milissegundo.
    to: new Date(last.year, last.month, last.day + 1).getTime() - 1,
  };
}

export type Totals = {
  seconds: number;
  plays: number;
  /** Faixas distintas. */
  tracks: number;
  artists: number;
  albums: number;
};

export function totals(plays: Play[]): Totals {
  const tracks = new Set<string>();
  const artists = new Set<string>();
  const albums = new Set<string>();
  let seconds = 0;
  for (const play of plays) {
    seconds += play.seconds;
    tracks.add(play.trackId);
    artists.add(play.artist);
    albums.add(play.albumId);
  }
  return { seconds, plays: plays.length, tracks: tracks.size, artists: artists.size, albums: albums.size };
}

export type Rank = {
  key: string;
  label: string;
  /** Linha de baixo: o artista, para álbum e faixa. Vazia para artista. */
  sub: string;
  seconds: number;
  plays: number;
};

/**
 * Ranking genérico: agrupa, soma e ordena.
 *
 * Ordena por **tempo**, e não por número de reproduções. Uma faixa de dois minutos
 * repetida vinte vezes e um lado inteiro de disco ouvido uma vez são coisas diferentes, e
 * contar cabeças faria a primeira ganhar sempre. O empate desempata pelo número de
 * escutas e, se persistir, pelo rótulo — sem isso a ordem muda entre duas aberturas da
 * mesma tela.
 */
function rank(plays: Play[], of: (p: Play) => { key: string; label: string; sub: string }): Rank[] {
  const groups = new Map<string, Rank>();
  for (const play of plays) {
    const { key, label, sub } = of(play);
    const found = groups.get(key);
    if (found) {
      found.seconds += play.seconds;
      found.plays += 1;
    } else {
      groups.set(key, { key, label, sub, seconds: play.seconds, plays: 1 });
    }
  }
  return [...groups.values()].sort(
    (a, b) => b.seconds - a.seconds || b.plays - a.plays || a.label.localeCompare(b.label)
  );
}

export const topArtists = (plays: Play[]): Rank[] =>
  rank(plays, (p) => ({ key: p.artist, label: p.artist, sub: '' }));

export const topAlbums = (plays: Play[]): Rank[] =>
  rank(plays, (p) => ({ key: p.albumId, label: p.album, sub: p.artist }));

export const topTracks = (plays: Play[]): Rank[] =>
  rank(plays, (p) => ({ key: p.trackId, label: p.title, sub: p.artist }));

/**
 * Segundos por hora do dia, em 24 posições.
 *
 * Hora local, e não UTC: a pergunta é "quando eu ouço", e ela só faz sentido no fuso de
 * quem ouve. `Date` já resolve isso a partir do timestamp.
 */
export function byHour(plays: Play[]): number[] {
  const hours = new Array<number>(24).fill(0);
  for (const play of plays) hours[new Date(play.at).getHours()] += play.seconds;
  return hours;
}

/**
 * Os dias que tiveram escuta, por `dayKey`.
 *
 * O seletor marca esses dias com um ponto. Sem a marca, um calendário deixa escolher
 * qualquer intervalo — inclusive um sem escuta nenhuma — e o usuário só descobre o vazio
 * depois de escolher. Era a vantagem que a grade de meses tinha de graça, porque ela só
 * oferecia meses que existiam; aqui ela volta como informação em vez de como proibição.
 */
export function daysWithPlays(plays: Play[]): Set<string> {
  const days = new Set<string>();
  for (const play of plays) days.add(dayKey(dayOf(play.at)));
  return days;
}

/** Segundos por dia da semana, começando no domingo, como `Date.getDay`. */
export function byWeekday(plays: Play[]): number[] {
  const days = new Array<number>(7).fill(0);
  for (const play of plays) days[new Date(play.at).getDay()] += play.seconds;
  return days;
}

/**
 * A hora em que mais se ouviu, ou null quando não há escuta nenhuma.
 *
 * Devolver `0` num histórico vazio diria "você ouve à meia-noite" para quem nunca ouviu.
 */
export function peakHour(plays: Play[]): number | null {
  if (!plays.length) return null;
  const hours = byHour(plays);
  let best = 0;
  for (let h = 1; h < 24; h++) if (hours[h] > hours[best]) best = h;
  return hours[best] > 0 ? best : null;
}
