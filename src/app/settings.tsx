/**
 * Ajustes — a rota, que só escolhe com qual interface a tela se desenha.
 *
 * Duas versões da mesma tela, e não uma tela cheia de `if`: a nossa, desenhada em React
 * Native (`screens/settings-drawn.tsx`), e a do sistema, feita com os componentes do
 * `@expo/ui` — SwiftUI no iOS, Jetpack Compose no Android (`screens/settings-native.tsx`).
 *
 * A escolha é do usuário e vive nas preferências; ver `lib/native-ui.ts`. Ela é resolvida
 * aqui, no alto, porque as duas versões têm cada uma os seus hooks: pôr o desvio no meio
 * de uma delas seria chamar hook dentro de condição, que é justamente o que não se pode.
 *
 * Trocar o flag desmonta uma e monta a outra. É uma troca de tela inteira, e é o que se
 * quer — as duas árvores não têm nada em comum além do que elas leem das preferências.
 */

import { useNativeUI } from '@/lib/native-ui';
import DrawnSettings from '@/screens/settings-drawn';
import NativeSettings from '@/screens/settings-native';

export default function Settings() {
  return useNativeUI() ? <NativeSettings /> : <DrawnSettings />;
}
