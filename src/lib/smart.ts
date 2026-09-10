/**
 * Recortes automáticos da biblioteca — as "listas inteligentes".
 *
 * A tela de Escuta mostra o que você ouviu; ela não dá nada para **fazer** com isso. Os
 * dados já estão todos no aparelho: contagem por faixa nas preferências, e a data de cada
 * escuta na tabela `plays` do banco. O que faltava era transformá-los em recortes que se
 * pode tocar.
 *
 * Quatro perguntas, e cada uma resolve um incômodo real de acervo grande:
 *
 * - **Nunca ouvidas** — o que entrou na biblioteca e nunca foi tocado. Numa coleção de
 *   downloads isso costuma ser um terço do acervo.
 * - **Mais tocadas** — as suas, por tempo de convivência e não por curtida declarada.
 * - **Esquecidas** — o que você ouviu e não ouve mais. É a lista que devolve disco antigo
 *   para a rotação, e a única que não dá para montar sem histórico com data.
 * - **Desta semana** — o que está em rotação agora.
 *
 * Puro e testado, no mesmo espírito de `history.ts`: são regras sobre datas e contagens, e
 * um limite errado não quebra nada visivelmente — só devolve a lista errada em silêncio.
 * As entradas chegam por parâmetro (o relógio inclusive), então cada regra é conferível
 * sem banco e sem React.
 */

import type { Track } from './scan';

export type SmartKey = 'all' | 'unplayed' | 'most' | 'forgotten' | 'week';

export const SMART_KEYS: SmartKey[] = ['all', 'unplayed', 'most', 'forgotten', 'week'];

const DAY = 86_400_000;

/**
 * Quanto tempo sem tocar já conta como esquecida.
 *
 * Seis meses. Três seriam pouco — um disco de estação volta sozinho —, e um ano é mais que
 * a idade de muita biblioteca, o que deixaria a lista vazia justamente para quem começou a
 * usar o app este ano.
 */
export const FORGOTTEN_DAYS = 180;

/** A janela de "desta semana", nos mesmos sete dias que a tela de Escuta usa. */
export const WEEK_DAYS = 7;

export type SmartInput = {
  tracks: Track[];
  /** Quantas vezes cada faixa tocou. Das preferências. */
  playsOf: (trackId: string) => number;
  /** Quando cada faixa tocou por último, em ms. Do histórico — ver `db.lastPlayedAt`. */
  lastPlayed: Map<string, number>;
  /** O "agora" de quem pergunta. Por parâmetro para a regra ser pura. */
  now: number;
};

/**
 * O recorte pedido.
 *
 * A ordem importa e é diferente em cada um: "mais tocadas" é um ranking, "desta semana" é
 * cronológico invertido, e "nunca ouvidas" preserva a ordem da biblioteca — ali não há o
 * que ranquear, e reordenar por título tiraria o agrupamento por álbum que a lista já tem.
 */
export function smartList(key: SmartKey, input: SmartInput): Track[] {
  const { tracks, playsOf, lastPlayed, now } = input;

  if (key === 'all') return tracks;

  if (key === 'unplayed') {
    /*
      As duas fontes têm de concordar em "nunca".

      `plays` é a contagem das preferências e `lastPlayed` vem do histórico, e as duas
      podem divergir: apagar o histórico em Escuta zera as datas e **não** zera a contagem.
      Exigir zero nas duas é o que mantém "nunca ouvidas" honesta depois disso — uma faixa
      que você ouviu continua fora da lista mesmo sem data para provar.
    */
    return tracks.filter((t) => playsOf(t.id) === 0 && !lastPlayed.has(t.id));
  }

  if (key === 'most') {
    return tracks
      .filter((t) => playsOf(t.id) > 0)
      .sort((a, b) => playsOf(b.id) - playsOf(a.id) || a.title.localeCompare(b.title));
  }

  if (key === 'week') {
    const since = now - WEEK_DAYS * DAY;
    return tracks
      .filter((t) => (lastPlayed.get(t.id) ?? 0) >= since)
      .sort((a, b) => (lastPlayed.get(b.id) ?? 0) - (lastPlayed.get(a.id) ?? 0));
  }

  // forgotten: tocada alguma vez, e não há muito tempo.
  const cutoff = now - FORGOTTEN_DAYS * DAY;
  return tracks
    .filter((t) => {
      const at = lastPlayed.get(t.id);
      // Sem data não é esquecida: é nunca ouvida, que é a outra lista. Uma faixa com
      // contagem mas sem data — histórico apagado — também fica fora, porque não há como
      // dizer *quando* ela foi esquecida.
      return at != null && at < cutoff;
    })
    // A mais antiga primeiro: é a que está mais esquecida, e a que a lista quer oferecer.
    .sort((a, b) => (lastPlayed.get(a.id) ?? 0) - (lastPlayed.get(b.id) ?? 0));
}
