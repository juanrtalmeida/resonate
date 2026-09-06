/**
 * Capa procedural. O design nunca usa arte embutida: gera tudo a partir de três cores,
 * uma rotação e as iniciais, semeadas por um hash de "artista + álbum".
 * Determinístico, offline, zero I/O.
 */

/** Paleta de 8 do protótipo (albums[] do .dc.html). */
const PALETTE = [
  { a: '#F2653A', b: '#7A2E1E', c: '#2A1512' },
  { a: '#3E7CA8', b: '#1D3B52', c: '#101B24' },
  { a: '#B7C24A', b: '#4E5A20', c: '#191C10' },
  { a: '#D89A6A', b: '#7A4B2C', c: '#241811' },
  { a: '#8A6BD1', b: '#3D2A63', c: '#15102A' },
  { a: '#E8B44A', b: '#8A5A1C', c: '#241A0E' },
  { a: '#5FBFA8', b: '#22574C', c: '#0F1E1B' },
  { a: '#D65A8E', b: '#5C2340', c: '#1D0F17' },
] as const;

export type Artwork = {
  a: string;
  b: string;
  c: string;
  rot: number;
  initials: string;
};

/** FNV-1a 32 bits. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Até 3 iniciais das palavras do artista. "The Long Sundays" -> "TLS" */
function initialsOf(artist: string): string {
  const letters = artist
    .split(/[\s\-_&]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 3);
  return letters || '??';
}

export function artworkFor(artist: string, album: string): Artwork {
  const h = hash(`${artist} ${album}`);
  const p = PALETTE[h % PALETTE.length];
  return {
    ...p,
    rot: ((h >>> 8) % 121) - 60, // [-60, 60], como o rot do protótipo
    initials: `${initialsOf(artist)} / ${String(((h >>> 16) % 99) + 1).padStart(2, '0')}`,
  };
}

/** O empilhamento de radial-gradients do design, para experimental_backgroundImage. */
export function artGradient(art: Pick<Artwork, 'a' | 'b'>): string {
  return (
    `radial-gradient(120% 90% at 18% 12%, ${art.a} 0%, transparent 62%),` +
    `radial-gradient(100% 100% at 84% 86%, ${art.b} 0%, transparent 58%)`
  );
}

/**
 * Forma de onda procedural, semeada pelo id da faixa — as mesmas senoides do protótipo.
 * ponytail: decorativa. PCM real exigiria useAudioSampleListener, que no Android pede
 * RECORD_AUDIO — inaceitável num player. O seek é exato de qualquer forma.
 */
export function waveform(seed: string, length: number): number[] {
  const s = (hash(seed) % 1000) / 1000;
  return Array.from({ length }, (_, i) => {
    const v =
      0.32 +
      0.34 * Math.sin(i * 0.55 + s * 6.3) +
      0.22 * Math.sin(i * 1.7 + 1.2 + s * 3.1) +
      0.14 * Math.sin(i * 3.1 + s);
    return Math.max(0.14, Math.min(1, Math.abs(v)));
  });
}
