/**
 * Sessões de leitura: o audiolivro fatiado em blocos de tempo igual.
 *
 * Capítulo não é sessão. Um capítulo tem 8 minutos ou 90, e quem ouve livro ouve por
 * tempo — meia hora antes de dormir, três quartos de hora no trajeto. As sessões cortam o
 * livro nesse tamanho, independentes de onde os capítulos começam, e dizem em qual delas
 * a escuta está.
 *
 * Fatiar é escolha de quem ouve, e por livro: `0` quer dizer desligado, e é o padrão. Sem
 * a escolha o audiolivro se comporta como qualquer álbum.
 *
 * Nada aqui pausa o áudio. A sessão é a régua do livro, não um temporizador — parar no
 * fim dela é decisão de quem está ouvindo.
 */

/** Os tamanhos de sessão oferecidos, em minutos. */
export const SESSIONS = [30, 45, 60] as const;

export type Book = {
  /** Duração de cada capítulo, na ordem do livro. */
  chapters: (number | null)[];
  /** Quanto já foi ouvido de cada capítulo: a duração inteira quando terminou. */
  heard: number[];
};

export type Reading = {
  /** Em que sessão a escuta está, de 1 em diante. */
  at: number;
  /** Quantas sessões o livro tem. */
  total: number;
  /** Segundos que faltam para o fim da sessão atual. */
  left: number;
  /** Quanto da sessão atual já passou, de 0 a 1. */
  done: number;
};

const sum = (values: number[]) => values.reduce((n, v) => n + v, 0);

/**
 * Onde a escuta está, em sessões.
 *
 * `minutes` a zero devolve null: é o desligado, e quem chama não desenha nada.
 *
 * O total arredonda para cima — a última sessão de um livro raramente fecha redonda, e
 * ela conta como sessão de qualquer forma. `at` é limitado ao total: no último segundo do
 * livro a divisão dá uma sessão além da última.
 */
export function reading(book: Book, minutes: number): Reading | null {
  if (minutes <= 0) return null;
  const block = minutes * 60;
  const length = sum(book.chapters.map((c) => c ?? 0));
  if (length <= 0) return null;

  const heard = Math.min(sum(book.heard), length);
  const total = Math.max(1, Math.ceil(length / block));
  const at = Math.min(total, Math.floor(heard / block) + 1);
  const into = heard - (at - 1) * block;
  // A última sessão é mais curta que as outras: o que falta nela é o que falta do livro.
  const size = Math.min(block, length - (at - 1) * block);
  return { at, total, left: Math.max(0, size - into), done: size > 0 ? into / size : 0 };
}
