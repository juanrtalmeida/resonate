/** Tokens do Resonate. Extraídos dos inline styles do .dc.html — ele é a fonte da verdade. */

export const C = {
  bg: '#0B0A09',
  surface: '#0E0C0B',
  card: '#141110',
  raised: '#171412',
  art: '#241E1A',
  onAccent: '#12100E',
  ok: '#5FBF7E',
  /**
   * Vermelho de ação destrutiva.
   *
   * Fora da paleta de acentos de propósito: o acento é escolha do usuário e pode ser o
   * laranja, e aí um botão de apagar no acento não se distinguiria de um botão comum.
   * Perigo não é tema.
   */
  danger: '#E5484D',
} as const;

/** Texto #F6F1EA nas opacidades usadas pelo design. */
export const T = {
  full: '#F6F1EA',
  t72: 'rgba(246,241,234,.72)',
  t62: 'rgba(246,241,234,.62)',
  t55: 'rgba(246,241,234,.55)',
  t5: 'rgba(246,241,234,.5)',
  t46: 'rgba(246,241,234,.46)',
  t42: 'rgba(246,241,234,.42)',
  t4: 'rgba(246,241,234,.4)',
  t34: 'rgba(246,241,234,.34)',
  t3: 'rgba(246,241,234,.3)',
  t24: 'rgba(246,241,234,.24)',
  t18: 'rgba(246,241,234,.18)',
  t14: 'rgba(246,241,234,.14)',
  t12: 'rgba(246,241,234,.12)',
  t1: 'rgba(246,241,234,.1)',
  t08: 'rgba(246,241,234,.08)',
  t07: 'rgba(246,241,234,.07)',
  t06: 'rgba(246,241,234,.06)',
} as const;

export const ACCENTS = ['#F2653A', '#E8B44A', '#5FBFA8', '#8A6BD1'] as const;
export type Accent = (typeof ACCENTS)[number];

export const R = { r9: 9, r13: 13, r15: 15, r17: 17, r21: 21, r26: 26 } as const;

export const F = {
  display: 'BricolageGrotesque_700Bold',
  displayHeavy: 'BricolageGrotesque_800ExtraBold',
  body: 'FamiljenGrotesk_400Regular',
  bodyMedium: 'FamiljenGrotesk_500Medium',
  bodySemi: 'FamiljenGrotesk_600SemiBold',
  mono: 'DMMono_400Regular',
  monoMedium: 'DMMono_500Medium',
} as const;

/** Espaço reservado embaixo pelo mini player + pílula de navegação. */
export const CHROME_HEIGHT = 168;

/**
 * Recuo lateral de todo conteúdo de tela. Fica no container da lista, nunca nos filhos:
 * quando cada aba aplicava o seu, o cabeçalho saltava de posição ao trocar de aba.
 */
export const PADDING = 22;

/**
 * rgba a partir de um hex #RRGGBB.
 *
 * Worklet porque cor entra em estilo animado: chamada de dentro de um `useAnimatedStyle`,
 * uma função comum estoura na thread de UI — foi o que derrubava a tela de busca. Marcada
 * aqui, e não contornada em cada chamador, porque qualquer estilo animado do app pode
 * precisar dela.
 */
export function alpha(hex: string, a: number): string {
  'worklet';
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** m:ss */
export function fmt(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
