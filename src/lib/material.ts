/**
 * As cores do Material 3, para as superfícies do app quando a interface nativa está
 * ligada. Este arquivo é o lado de fora do Android: ele devolve `null`, e quem chama
 * mantém o desenho do Resonate.
 *
 * Arquivo dividido por plataforma (`material.android.ts` é o outro) porque
 * `@expo/ui/jetpack-compose` fala com um módulo nativo que só existe no Android — um
 * `Platform.OS === 'android'` dentro de um arquivo só ainda importaria o módulo no iOS.
 */

/**
 * O trio que uma superfície precisa: o tom de um cartão, o de algo que flutua acima dele,
 * e a linha que fecha os dois.
 */
export type MaterialSurface = {
  /** Tom de cartão — `surfaceContainer`. */
  surface: string;
  /** Um tom acima, para o que flutua — `surfaceContainerHigh`. */
  raised: string;
  /** A borda discreta do Material — `outlineVariant`. */
  outline: string;
};

/**
 * O Material 3 está disponível nesta execução do app.
 *
 * Fora do Android, nunca — e é isto que `lib/native-ui.ts` lê para decidir se a interface
 * nativa é oferecível.
 */
export const MATERIAL_AVAILABLE = false;

export function useMaterialSurface(_seed: string): MaterialSurface | null {
  return null;
}
