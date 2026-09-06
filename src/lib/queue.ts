/**
 * Continuação automática da fila: o que tocar quando a última faixa acabar.
 *
 * Tudo aqui é puro e sem I/O — decide sobre a biblioteca já em memória. "Parecido" é o
 * que dá para saber offline: mesmo gênero declarado na tag. Não existe catálogo nem
 * similaridade calculada, e inventar uma seria pior que ser explícito sobre o critério.
 */

import type { Track } from './scan';

export type Continuation = 'off' | 'album' | 'artist' | 'genre';

export const CONTINUATIONS: {
  key: Continuation;
  /** Rótulo curto, para as abas. */
  short: string;
  label: string;
  blurb: string;
}[] = [
  { key: 'off', short: 'Parar', label: 'Parar no fim', blurb: 'a fila termina e o áudio para' },
  { key: 'album', short: 'Álbum', label: 'Seguir pelo álbum', blurb: 'o resto do álbum' },
  { key: 'artist', short: 'Artista', label: 'Seguir pelo artista', blurb: 'mais do mesmo artista' },
  { key: 'genre', short: 'Parecidas', label: 'Parecidas', blurb: 'outros artistas do mesmo gênero' },
];

/** Teto do que se anexa de uma vez: continuar não é despejar a biblioteca na fila. */
const LIMIT = 30;

const norm = (s: string | null) => (s ?? '').trim().toLowerCase();

/**
 * Faixas para anexar depois de `current`, sem repetir nada que já esteja na fila.
 * Devolve vazio quando não há candidato — aí a fila realmente acaba.
 */
export function continuationFor(
  mode: Continuation,
  current: Track,
  tracks: Track[],
  /** Ids já presentes na fila. */
  queued: Set<string>,
  /** Injetável para o teste; por padrão, aleatório de verdade. */
  random: () => number = Math.random
): Track[] {
  if (mode === 'off') return [];
  const free = tracks.filter((t) => !queued.has(t.id));

  if (mode === 'album') {
    return free
      .filter((t) => t.albumId === current.albumId)
      .sort((a, b) => (a.trackNumber ?? 1e9) - (b.trackNumber ?? 1e9))
      .slice(0, LIMIT);
  }

  if (mode === 'artist') {
    const who = norm(current.albumArtist ?? current.artist);
    return free
      .filter((t) => norm(t.artist) === who || norm(t.albumArtist) === who)
      .sort((a, b) => (a.trackNumber ?? 1e9) - (b.trackNumber ?? 1e9))
      .slice(0, LIMIT);
  }

  // genre: mesmo gênero, mas de outros artistas — é o que dá sentido a "parecidas".
  const genre = norm(current.genre);
  if (!genre) return [];
  const who = norm(current.albumArtist ?? current.artist);
  const others = free.filter((t) => norm(t.genre) === genre && norm(t.artist) !== who);
  return shuffle(others, random).slice(0, LIMIT);
}

/** Embaralha sem mutar a entrada. */
export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  return items
    .map((item) => ({ item, key: random() }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.item);
}

/** Move um item da fila de uma posição para outra, sem mutar. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }
  const copy = [...items];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}
