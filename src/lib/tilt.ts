/**
 * Paralaxe de inclinação: a capa acompanha o aparelho, bem de leve.
 *
 * Acelerômetro, não giroscópio. O giroscópio mede velocidade angular — integrar isso
 * acumula deriva, e depois de um minuto a capa fica torta com o aparelho parado. A
 * gravidade dá a inclinação direta, sem integral e sem deriva.
 *
 * O repouso não é lido de um valor fixo: o sinal de cada eixo muda entre iOS e Android e
 * ninguém segura o telefone reto. A primeira leitura vira a referência, e a referência
 * persegue o sinal devagar — quem inclina e fica assim volta ao centro em alguns
 * segundos, e o efeito responde ao movimento, não à postura.
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

const clamp = (v: number) => (v > 1 ? 1 : v < -1 ? -1 : v);

/**
 * Filtro com estado. Recebe as leituras cruas do acelerômetro (em g) e devolve os
 * ângulos em graus. Fora de um hook de propósito: é aritmética pura, testável sem
 * sensor.
 */
export function createTilt(max = TILT_MAX) {
  let base: { x: number; y: number } | null = null;
  let sx = 0;
  let sy = 0;

  return (x: number, y: number) => {
    if (!base) base = { x, y };
    else {
      base.x += (x - base.x) * RECENTER;
      base.y += (y - base.y) * RECENTER;
    }
    sx += (clamp((x - base.x) / RANGE) - sx) * SMOOTH;
    sy += (clamp((y - base.y) / RANGE) - sy) * SMOOTH;
    // Inclinar o topo para longe empurra a capa para trás: rotateX segue o eixo y
    // invertido.
    return { rx: -sy * max, ry: sx * max };
  };
}
