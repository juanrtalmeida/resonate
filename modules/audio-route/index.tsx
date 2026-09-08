/**
 * O seletor de saída de áudio do iOS, como componente.
 *
 * O Android abre um painel do sistema por intent (`src/lib/audio-output.ts`); o iOS não
 * tem equivalente imperativo, e o único caminho sancionado é o `AVRoutePickerView` — um
 * botão da AVKit que precisa estar na tela. Daí um render em vez de uma chamada.
 *
 * `requireOptionalNativeModule` antes de tudo: num build feito sem o módulo, `available`
 * é falso e o player simplesmente não mostra o controle, do mesmo jeito que já faz no
 * Android quando o painel não existe.
 */

import { requireNativeViewManager, requireOptionalNativeModule } from 'expo-modules-core';
import { type ComponentType } from 'react';
import { Platform, type ViewStyle } from 'react-native';

type Props = { tint?: string; style?: ViewStyle };

/** Se o controle pode ser desenhado. Falso fora do iOS e em build sem o módulo. */
export const canShowRoutePicker =
  Platform.OS === 'ios' && requireOptionalNativeModule('AudioRoute') !== null;

/**
 * O `requireNativeViewManager` só é chamado quando o módulo existe: fora disso ele lança,
 * e a avaliação deste arquivo derrubaria o app no boot.
 */
const Native: ComponentType<Props> | null = canShowRoutePicker
  ? requireNativeViewManager('AudioRoute')
  : null;

export function RoutePicker({ size = 34, tint }: { size?: number; tint?: string }) {
  if (!Native) return null;
  return <Native tint={tint} style={{ width: size, height: size }} />;
}
