/**
 * Parser de LRC. O formato é uma linha por verso, prefixada por um ou mais carimbos
 * de tempo `[mm:ss.xx]`. Linhas sem carimbo continuam valendo como letra — é assim que
 * a letra embutida numa tag chega aqui.
 *
 * A extensão "enhanced" (A2) marca cada palavra com `<mm:ss.xx>` dentro da linha. Esses
 * carimbos nunca podem sobrar no texto: eram eles que apareciam colados na letra.
 */

export type LyricWord = {
  time: number;
  text: string;
};

export type LyricLine = {
  /** Segundos, ou null quando a letra não é sincronizada. */
  time: number | null;
  text: string;
  /** Carimbo por palavra, quando o arquivo traz. Null é a linha inteira de uma vez. */
  words: LyricWord[] | null;
};

export type Lyrics = {
  /** Se ao menos uma linha tem carimbo de tempo. */
  synced: boolean;
  lines: LyricLine[];
};

/** `[mm:ss]`, `[mm:ss.xx]` e `[mm:ss.xxx]`, um ou vários no início da linha. */
const STAMP = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

/** O mesmo carimbo em `<>`, que é como o formato por palavra marca cada trecho. */
const WORD = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>/g;

/** Metadados do cabeçalho: `[ar:...]`, `[ti:...]`, `[offset:...]`. */
const META = /^\[[a-z]+:/i;

const stamp = (m: string, s: string, frac?: string) =>
  Number(m) * 60 + Number(s) + (frac ? Number(`0.${frac}`) : 0);

/**
 * Quebra o resto da linha nos carimbos por palavra. `start` é o tempo da linha, que vale
 * para o texto que vier antes do primeiro `<...>`. Devolve null quando não há carimbo
 * nenhum — aí a linha continua sendo uma frase só.
 */
function wordsOf(rest: string, start: number | null): LyricWord[] | null {
  WORD.lastIndex = 0;
  if (!WORD.test(rest)) return null;

  const out: LyricWord[] = [];
  let time = start;
  let cursor = 0;
  let match: RegExpExecArray | null;

  WORD.lastIndex = 0;
  while ((match = WORD.exec(rest)) !== null) {
    const text = rest.slice(cursor, match.index).trim();
    if (text && time !== null) out.push({ time, text });
    time = stamp(match[1], match[2], match[3]);
    cursor = WORD.lastIndex;
  }
  const tail = rest.slice(cursor).trim();
  if (tail && time !== null) out.push({ time, text: tail });

  return out.length ? out : null;
}

export function parseLrc(raw: string): Lyrics {
  const lines: LyricLine[] = [];
  let synced = false;

  for (const line of raw.split(/\r?\n/)) {
    STAMP.lastIndex = 0;
    const times: number[] = [];
    let end = 0;
    let match: RegExpExecArray | null;

    // Os carimbos só contam enquanto forem contíguos a partir do começo da linha.
    while ((match = STAMP.exec(line)) !== null && match.index === end) {
      times.push(stamp(match[1], match[2], match[3]));
      end = STAMP.lastIndex;
    }

    const rest = line.slice(end);
    // Uma linha repetida em vários momentos (refrão) não pode levar os carimbos por
    // palavra junto: eles valem para a primeira aparição e mentiriam nas outras.
    const words = times.length > 1 ? null : wordsOf(rest, times[0] ?? null);
    const text = (words ? words.map((w) => w.text).join(' ') : rest.replace(WORD, '')).trim();

    if (!times.length) {
      // Só carimbo por palavra: a linha começa junto com a primeira delas.
      if (words) {
        synced = true;
        lines.push({ time: words[0].time, text, words });
        continue;
      }
      // Sem carimbo: ignora o cabeçalho de metadados, mantém o resto como letra solta.
      if (text && !META.test(line.trim())) lines.push({ time: null, text, words: null });
      continue;
    }
    synced = true;
    for (const time of times) lines.push({ time, text, words });
  }

  if (synced) {
    lines.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
  }
  return { synced, lines };
}

/**
 * Índice da linha que está tocando. Devolve -1 antes do primeiro carimbo.
 * ponytail: busca linear. São dezenas de linhas por faixa; uma busca binária aqui
 * economizaria microssegundos e custaria clareza.
 */
export function lineAt(lines: LyricLine[], seconds: number): number {
  let at = -1;
  for (let i = 0; i < lines.length; i++) {
    const time = lines[i].time;
    if (time === null || time > seconds) break;
    at = i;
  }
  return at;
}

/** O mesmo, para as palavras de uma linha: -1 antes da primeira. */
export function wordAt(words: LyricWord[], seconds: number): number {
  let at = -1;
  for (let i = 0; i < words.length; i++) {
    if (words[i].time > seconds) break;
    at = i;
  }
  return at;
}

/** Quanto da linha atual já passou, de 0 a 1. Alimenta a barra de progresso do design. */
export function lineProgress(lines: LyricLine[], at: number, seconds: number, duration: number) {
  const start = lines[at]?.time;
  if (start == null) return 0;
  const end = lines[at + 1]?.time ?? duration;
  if (end <= start) return 0;
  return Math.max(0, Math.min(1, (seconds - start) / (end - start)));
}
