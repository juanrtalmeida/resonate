/**
 * O que é música e o que é palavra falada.
 *
 * O Resonate não tem rede: não existe feed de podcast nem catálogo de audiolivro para
 * consultar. O que há é o que o arquivo diz de si, e o que o usuário disser dele. Três
 * regras, na ordem em que se confia nelas:
 *
 *   1. a marca manual, por álbum — o usuário sempre vence;
 *   2. a tag de gênero, que é o que a maioria dos aplicativos de podcast escreve;
 *   3. a duração, como último recurso: nada de 25 minutos numa faixa é canção.
 *
 * A terceira erra por natureza — um set ao vivo ou um mix cai nela. É o preço de
 * classificar sem tag, e é por isso que a marca manual existe.
 */

import type { Track } from './scan';

export type Spoken = 'podcast' | 'audiobook';

/**
 * A marca manual, por id de álbum.
 *
 * Por álbum, e não por faixa: um programa é um álbum, um livro é um álbum, e ninguém quer
 * marcar episódio por episódio. `'music'` é a marca de volta — serve para desfazer o que
 * o gênero ou a duração classificaram errado.
 */
export type SpokenMarks = Record<string, Spoken | 'music'>;

/** A partir de quantos segundos uma faixa sem tag conta como falada. */
export const LONG = 25 * 60;

const PODCAST = /podcast|epis[oó]dio|talk\s?show/i;
const BOOK = /audio\s?-?book|audiolivro|livro\s?falado|spoken\s?word|narra[cç][aã]o/i;

/** O que esta faixa é, ou null quando é música. */
export function spokenOf(track: Track, marks: SpokenMarks = {}): Spoken | null {
  const mark = marks[track.albumId];
  if (mark) return mark === 'music' ? null : mark;

  const genre = track.genre ?? '';
  if (BOOK.test(genre)) return 'audiobook';
  if (PODCAST.test(genre)) return 'podcast';

  // Sem tag que ajude, a duração decide — e o que ela acha vai para podcast, que é o
  // destino mais provável de um arquivo longo e solto. A marca manual conserta o resto.
  if ((track.duration ?? 0) >= LONG) return 'podcast';
  return null;
}

export const isSpoken = (track: Track, marks?: SpokenMarks): boolean =>
  spokenOf(track, marks) !== null;

/** Ouvido até o fim? O que sobra no fim de um episódio é crédito, não conteúdo. */
export function finished(position: number, duration: number | null): boolean {
  if (!duration || duration <= 0) return false;
  return position >= duration - 20;
}
