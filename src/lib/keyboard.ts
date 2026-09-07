/**
 * Quanto do fundo da tela o teclado cobre, em dp. 0 quando ele está fechado.
 *
 * Existe porque o `windowSoftInputMode="adjustResize"` do manifesto não vale mais: o
 * Android do Expo 57 mira o SDK 35+, e aí o edge-to-edge é obrigatório — a janela deixa
 * de encolher quando o teclado sobe e ele passa a cobrir o conteúdo. Vale também para a
 * janela do Modal: o React Native liga o edge-to-edge nela junto com a do app.
 *
 * O evento do Android já desconta a barra de navegação, que continua desenhada por cima
 * do teclado; o do iOS vem cheio, do fundo da tela. Somar a barra de volta no Android é
 * o que faz o número dos dois lados querer dizer a mesma coisa — e é por isso que quem
 * usa isto pode compará-lo direto com `insets.bottom`, com um `Math.max`, em vez de
 * empilhar os dois e reservar o mesmo espaço duas vezes.
 */

import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function useKeyboardOverlap(): number {
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(0);

  useEffect(() => {
    // No Android só existem os eventos `did`; no iOS os `will` chegam antes da animação,
    // o que faz o conteúdo subir junto com o teclado em vez de depois dele.
    const rise = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const fall = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const shown = Keyboard.addListener(rise, (e) => setHeight(e.endCoordinates.height));
    const hidden = Keyboard.addListener(fall, () => setHeight(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  if (height === 0) return 0;
  return Platform.OS === 'android' ? height + insets.bottom : height;
}
