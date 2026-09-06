/**
 * Colapso da barra inferior por rolagem.
 *
 * O estado vive num shared value de módulo, não num contexto: a Chrome é um overlay
 * sobre o <Stack>, então as telas que rolam não são filhas dela e não há caminho de
 * contexto entre as duas.
 */

import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { makeMutable, withTiming } from 'react-native-reanimated';

/** 0 = barra inteira, 1 = só o item ativo e o player. */
export const chromeCollapsed = makeMutable(0);

/** O alvo, guardado à parte: `chromeCollapsed` no meio da animação vale 0.37. */
const target = makeMutable(0);
const lastY = makeMutable(0);

/** Perto do topo a barra volta inteira: não há o que economizar ali. */
const TOP = 12;
/** Rolagem mínima para trocar de estado. Sem isso o tremor do dedo pisca a barra. */
const STEP = 6;

/**
 * Worklet de propósito: a tela do artista já roda um handler de rolagem na thread de UI
 * para o parallax, e é ali que ela chama isto.
 */
export function chromeScrollTo(y: number) {
  'worklet';
  const dy = y - lastY.value;
  lastY.value = y;
  const next = y <= TOP ? 0 : dy > STEP ? 1 : dy < -STEP ? 0 : target.value;
  if (next === target.value) return;
  target.value = next;
  chromeCollapsed.value = withTiming(next, { duration: 260 });
}

/** Barra inteira de novo — ao trocar de tela, ou quando o usuário toca no item ativo. */
export function chromeExpand() {
  target.value = 0;
  lastY.value = 0;
  chromeCollapsed.value = withTiming(0, { duration: 200 });
}

/** Props de qualquer lista vertical: `<FlatList {...chromeScroll} />`. */
export const chromeScroll = {
  scrollEventThrottle: 16,
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    chromeScrollTo(e.nativeEvent.contentOffset.y),
};
