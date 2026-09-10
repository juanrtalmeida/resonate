/**
 * A interface do sistema, quando o usuário a prefere à nossa.
 *
 * O Resonate desenha tudo: a pílula de navegação, o cartão do mini player, os campos dos
 * Ajustes. Isso é o app — e é também uma escolha que nem todo mundo quer. Quem prefere o
 * que o aparelho faz liga o flag em Ajustes, e as superfícies passam a ser nativas de
 * verdade: SwiftUI com Liquid Glass no iOS, Jetpack Compose com Material 3 no Android.
 * Ver `app/settings.tsx`, `screens/settings-native.tsx` e `components/panel.tsx`.
 *
 * Aqui mora só a pergunta "isto vale agora?", que é duas perguntas: o usuário pediu, e o
 * aparelho sabe fazer. Elas são separadas de propósito — a preferência é guardada mesmo em
 * iPhone sem Liquid Glass, então trocar de aparelho não perde a escolha.
 */

import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Platform } from 'react-native';

import { MATERIAL_AVAILABLE } from './material';
import { usePrefs } from './prefs';

/**
 * O Liquid Glass existe *nesta* execução do app.
 *
 * São duas condições, e nenhuma delas é a versão do iOS: `isLiquidGlassAvailable` diz que
 * o binário foi compilado com o SDK 26 e não pediu compatibilidade no Info.plist, e
 * `isGlassEffectAPIAvailable` diz que a API responde neste sistema — algumas betas do iOS
 * 26 anunciam o desenho novo sem trazer a API, e chamar `GlassView` lá derruba o app.
 * Ver as notas de `expo-glass-effect` na documentação do SDK 57.
 *
 * Uma constante de módulo, e não um hook: as duas respostas não mudam enquanto o app está
 * aberto, e ler nativo a cada render de barra seria desperdício. O `try` cobre o caso de o
 * módulo nativo não estar no binário — um app antigo que ainda não foi recompilado depois
 * de a dependência entrar.
 */
export const LIQUID_GLASS: boolean = (() => {
  if (Platform.OS !== 'ios') return false;
  try {
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
})();

/**
 * O Material 3 do aparelho.
 *
 * Sem condição de versão do Android: `@expo/ui` traz o Compose junto do app, e a paleta cai
 * no Material 3 de base nos aparelhos abaixo do Android 12, onde as cores do papel de
 * parede não existem. A condição que sobra é o módulo nativo estar no binário — ver
 * `lib/material.ts`.
 */
export const MATERIAL: boolean = MATERIAL_AVAILABLE;

/** O aparelho sabe desenhar a interface nativa. Falso na web e em iOS antigo. */
export const NATIVE_UI_AVAILABLE = LIQUID_GLASS || MATERIAL;

/** O usuário pediu a interface do sistema **e** o aparelho sabe desenhá-la. */
export function useNativeUI(): boolean {
  return usePrefs().nativeUI && NATIVE_UI_AVAILABLE;
}
