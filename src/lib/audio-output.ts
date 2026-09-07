/**
 * Saída de áudio: fone, alto-falante, bluetooth.
 *
 * Escolher a saída é do sistema operacional, não do app — o expo-audio 57 não expõe rota
 * de reprodução (só `shouldRouteThroughEarpiece`, que é de gravação no iOS, e a escolha de
 * *entrada* do gravador). O Android tem exatamente essa tela pronta desde o 11: o Output
 * Switcher, um painel do próprio sistema que lista tudo o que está pareado e troca ao
 * vivo. Abrimos ele por intent, passando o pacote do app para o painel já vir apontado
 * para a nossa reprodução.
 *
 * ponytail: no iOS a mesma coisa exigiria um `AVRoutePickerView` nativo — uma view que só
 * existe em Swift. Fica para o dia em que o app tiver build de iOS; hoje não há nem
 * pasta `ios/` no projeto.
 */

import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';

/** Painel do sistema com as saídas de áudio (Android 11+). */
const PANEL = 'android.settings.panel.action.MEDIA_OUTPUT';
/** Chave que diz ao painel de qual app é a reprodução. */
const PANEL_PACKAGE = 'com.android.settings.panel.extra.PACKAGE_NAME';
/** Reserva para aparelhos sem o painel: a lista de pareados resolve o caso comum. */
const BLUETOOTH = 'android.settings.BLUETOOTH_SETTINGS';

/** Se vale mostrar o botão. Fora do Android não há para onde mandar o usuário. */
export const canPickOutput = Platform.OS === 'android';

export async function pickAudioOutput(): Promise<boolean> {
  if (!canPickOutput) return false;
  const pkg = Constants.expoConfig?.android?.package;
  try {
    await Linking.sendIntent(PANEL, pkg ? [{ key: PANEL_PACKAGE, value: pkg }] : undefined);
    return true;
  } catch {
    try {
      await Linking.sendIntent(BLUETOOTH);
      return true;
    } catch {
      return false;
    }
  }
}
