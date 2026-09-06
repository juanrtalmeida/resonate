/**
 * Parser de LRC. O formato é uma linha por verso, prefixada por um ou mais carimbos
 * de tempo `[mm:ss.xx]`. Linhas sem carimbo continuam valendo como letra — é assim que
 * a letra embutida numa tag chega aqui.
 */

export type LyricLine = {
  /** Segundos, ou null quando a letra não é sincronizada. */
  time: number | null;
  text: string;
};

export type Lyrics = {
  /** Se ao menos uma linha tem carimbo de tempo. */
  synced: boolean;
  lines: LyricLine[];
};

/** `[mm:ss]`, `[mm:ss.xx]` e `[mm:ss.xxx]`, um ou vários no início da linha. */
const STAMP = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

/** Metadados do cabeçalho: `[ar:...]`, `[ti:...]`, `[offset:...]`. */
const META = /^\[[a-z]+:/i;

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
      const fraction = match[3] ? Number(`0.${match[3]}`) : 0;
      times.push(Number(match[1]) * 60 + Number(match[2]) + fraction);
      end = STAMP.lastIndex;
    }

    const text = line.slice(end).trim();
    if (!times.length) {
      // Sem carimbo: ignora o cabeçalho de metadados, mantém o resto como letra solta.
      if (text && !META.test(line.trim())) lines.push({ time: null, text });
      continue;
    }
    synced = true;
    // Uma linha pode repetir em vários momentos (refrão).
    for (const time of times) lines.push({ time, text });
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

/** Quanto da linha atual já passou, de 0 a 1. Alimenta a barra de progresso do design. */
export function lineProgress(lines: LyricLine[], at: number, seconds: number, duration: number) {
  const start = lines[at]?.time;
  if (start == null) return 0;
  const end = lines[at + 1]?.time ?? duration;
  if (end <= start) return 0;
  return Math.max(0, Math.min(1, (seconds - start) / (end - start)));
}
