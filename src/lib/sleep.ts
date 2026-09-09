/**
 * Temporizador de desligar.
 *
 * Duas formas de dizer "para depois disto", porque são dois pedidos diferentes: um
 * relógio — meia hora e apaga — e o fim da faixa que está tocando, que é o que se quer
 * quando já se está quase dormindo e só falta a música acabar.
 *
 * Nada aqui é persistido, e é de propósito: um temporizador que sobrevive ao fechamento
 * do app pausaria a reprodução de amanhã de manhã, e ninguém liga um sleep timer
 * esperando que ele valha para a próxima sessão.
 *
 * Puro e sem React: o que decide é aritmética de tempo, e ela roda em `node --test`.
 * Quem conta os minutos de verdade é o `PlayerProvider`, que é quem tem o player.
 */

/** Os tempos oferecidos, em minutos. */
export const SLEEP_MINUTES = [5, 15, 30, 45, 60] as const;

export type Sleep =
  /** Desligado. */
  | { kind: 'off' }
  /** Um relógio: para quando `endsAt` chegar. */
  | { kind: 'clock'; endsAt: number; minutes: number }
  /** Para quando a faixa atual terminar. */
  | { kind: 'track' };

export const SLEEP_OFF: Sleep = { kind: 'off' };

/**
 * Quanto tempo o áudio leva para sumir antes da pausa, em segundos.
 *
 * Um corte seco no meio de uma faixa acorda quem estava adormecendo — que é justamente
 * quem ligou o temporizador. Oito segundos é curto o bastante para não parecer defeito e
 * longo o bastante para não ser um susto.
 */
export const FADE_SECONDS = 8;

export const startClock = (minutes: number, now: number): Sleep => ({
  kind: 'clock',
  endsAt: now + minutes * 60_000,
  minutes,
});

/** Segundos até a pausa, ou null quando não há relógio correndo. Nunca negativo. */
export function leftOf(sleep: Sleep, now: number): number | null {
  if (sleep.kind !== 'clock') return null;
  return Math.max(0, Math.ceil((sleep.endsAt - now) / 1000));
}

export const expired = (sleep: Sleep, now: number): boolean =>
  sleep.kind === 'clock' && now >= sleep.endsAt;

/** Se a faixa que acabou de terminar deve parar a reprodução em vez de avançar. */
export const stopsAtTrackEnd = (sleep: Sleep): boolean => sleep.kind === 'track';

/**
 * O volume durante o esmaecimento, de 1 a 0.
 *
 * Recebe quanto falta em segundos para não precisar saber que horas são — e devolve 1
 * enquanto ainda há tempo, o que faz chamar isto cedo demais não ter efeito nenhum.
 */
export function fadeVolume(secondsLeft: number): number {
  if (secondsLeft >= FADE_SECONDS) return 1;
  return Math.max(0, secondsLeft / FADE_SECONDS);
}

/** Rótulo curto do que está armado, para o botão. `null` quando está desligado. */
export function sleepLabel(sleep: Sleep, now: number): string | null {
  if (sleep.kind === 'off') return null;
  if (sleep.kind === 'track') return '·';
  const left = leftOf(sleep, now) ?? 0;
  // Acima de um minuto conta minutos arredondando para cima: mostrar "0 min" com 40
  // segundos restantes parece um temporizador que já falhou.
  return left >= 60 ? `${Math.ceil(left / 60)}` : `${left}s`;
}
