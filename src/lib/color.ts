/**
 * Conversões de cor do seletor de acento.
 *
 * O app inteiro lê a cor de acento como hex; o seletor trabalha em matiz e saturação,
 * que é o que se pode arrastar numa faixa. Estas duas funções são a ponte.
 *
 * Sem dependência: são doze linhas de aritmética cada uma, e a alternativa era um pacote
 * de conversão de cor inteiro para usar dois nomes dele.
 */

/** hsl → `#RRGGBB`. `h` em graus, `s` e `l` em porcento. */
export function hsl(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * v)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/** `#RRGGBB` → hsl. Serve para o seletor abrir na cor que já está em uso. */
export function toHsl(hex: string): { h: number; s: number; l: number } {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  // Cinza não tem matiz: qualquer valor serve, e zero é o que não move a faixa do lugar.
  if (d === 0) return { h: 0, s: 0, l: l * 100 };
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: (d / (1 - Math.abs(2 * l - 1))) * 100, l: l * 100 };
}

/** Um hex #RRGGBB de verdade? O que vem do prefs.json passa por aqui antes de virar cor. */
export function isHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}
