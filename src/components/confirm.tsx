/**
 * Ação com confirmação: um salto curto e um visto no lugar do ícone por um instante.
 *
 * Enfileirar não muda nada visível na tela onde o gesto acontece — sem um retorno o
 * toque parece não ter funcionado, e o usuário repete a ação.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Check } from './icons';

/** Quanto tempo o visto fica no lugar do ícone. */
const HOLD = 1100;

export function useConfirm(action: () => void) {
  const [done, setDone] = useState(false);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(false), HOLD);
    return () => clearTimeout(timer);
  }, [done]);

  const fire = useCallback(() => {
    action();
    setDone(true);
    // eslint-disable-next-line react-hooks/immutability
    scale.value = withSequence(
      withTiming(1.22, { duration: 110 }),
      withSpring(1, { damping: 9, stiffness: 260 })
    );
  }, [action, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return { fire, done, style };
}

/** O ícone da ação, trocado pelo visto enquanto a confirmação dura. */
export function ConfirmIcon({
  done,
  accent,
  size = 18,
  children,
}: {
  done: boolean;
  accent: string;
  size?: number;
  children: React.ReactNode;
}) {
  return done ? <Check size={size} color={accent} /> : <>{children}</>;
}
