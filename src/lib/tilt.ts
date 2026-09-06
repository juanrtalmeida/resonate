/**
 * Paralaxe de inclinação: a capa acompanha o aparelho, bem de leve.
 *
 * Vetor da gravidade, não giroscópio. O giroscópio mede velocidade angular — integrar
 * isso acumula deriva, e depois de um minuto a capa fica torta com o aparelho parado. A
 * gravidade dá a inclinação direta, sem integral e sem deriva, e o sistema já entrega o
 * vetor separado da aceleração do movimento.
 *
 * O repouso não é lido de um valor fixo: o sinal de cada eixo muda entre iOS e Android e
 * ninguém segura o telefone reto. A primeira leitura vira a referência, e a referência
 * persegue o sinal devagar — quem inclina e fica assim volta ao centro em alguns
 * segundos, e o efeito responde ao movimento, não à postura.
 *
 * Tudo aqui é worklet: o filtro roda na thread de UI, alimentado pelo sensor do próprio
 * Reanimated. Nada disso passa pelo JavaScript.
 */

/** Amplitude, em graus. Passar disso deixa de ser sutil. */
export const TILT_MAX = 5;

/** Intervalo entre leituras, em ms. As constantes abaixo são calibradas para ele. */
export const TILT_INTERVAL = 80;

/** Inclinação, em g, que já leva ao ângulo cheio. ~17°. */
const RANGE = 0.3;
/** Quanto a referência persegue o sinal por leitura. A 80 ms, recentra em ~4 s. */
const RECENTER = 0.02;
/** Quanto do valor novo entra por leitura. Baixo = mais calmo. */
const SMOOTH = 0.18;

function clamp(v: number): number {
  'worklet';
  return v > 1 ? 1 : v < -1 ? -1 : v;
}

/** Estado do filtro. Explícito para o passo ser puro — e testável sem sensor. */
export type TiltState = {
  /** Referência de repouso, perseguindo o sinal. */
  baseX: number;
  baseY: number;
  /** Sinal suavizado, em [-1, 1]. */
  sx: number;
  sy: number;
  /** Falso até a primeira leitura, que é quem define a referência. */
  ready: boolean;
};

export const TILT_REST: TiltState = { baseX: 0, baseY: 0, sx: 0, sy: 0, ready: false };

/** Um passo do filtro: estado e leitura crua (em g) entram, estado novo sai. */
export function tiltStep(s: TiltState, x: number, y: number): TiltState {
  'worklet';
  if (!s.ready) return { baseX: x, baseY: y, sx: 0, sy: 0, ready: true };

  const baseX = s.baseX + (x - s.baseX) * RECENTER;
  const baseY = s.baseY + (y - s.baseY) * RECENTER;
  return {
    baseX,
    baseY,
    sx: s.sx + (clamp((x - baseX) / RANGE) - s.sx) * SMOOTH,
    sy: s.sy + (clamp((y - baseY) / RANGE) - s.sy) * SMOOTH,
    ready: true,
  };
}

/**
 * Ângulos em graus. Inclinar o topo para longe empurra a capa para trás: `rotateX` segue
 * o eixo y invertido.
 */
export function tiltAngles(s: TiltState, max = TILT_MAX): { rx: number; ry: number } {
  'worklet';
  return { rx: -s.sy * max, ry: s.sx * max };
}
