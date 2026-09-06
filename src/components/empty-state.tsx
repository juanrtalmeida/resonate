/**
 * Estado vazio com alguma presença visual: um bloco no acento, com a mesma linguagem de
 * gradiente das capas, em vez de uma frase solta no meio da tela.
 */

import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { C, R, T, alpha } from '@/constants/theme';
import { usePrefs } from '@/lib/prefs';
import { Body, Display } from './text';

export function EmptyState({
  icon,
  title,
  children,
  action,
  onAction,
  compact = false,
}: {
  /** Um ícone dos de `icons.tsx`, já dimensionado. */
  icon: ReactNode;
  title: string;
  children?: string;
  action?: string;
  onAction?: () => void;
  /** Sem o espaço vertical grande, para caber dentro de uma lista. */
  compact?: boolean;
}) {
  const { accent } = usePrefs();

  return (
    <View
      style={{
        alignItems: 'center',
        paddingHorizontal: 32,
        paddingTop: compact ? 40 : 72,
        gap: 16,
      }}>
      <View
        style={{
          width: 96,
          height: 96,
          borderRadius: 28,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          backgroundColor: C.card,
          borderWidth: 1,
          borderColor: T.t07,
        }}>
        <View
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.5,
            experimental_backgroundImage:
              `radial-gradient(120% 90% at 22% 14%, ${alpha(accent, 0.55)} 0%, transparent 64%),` +
              `radial-gradient(100% 100% at 82% 88%, ${alpha(accent, 0.22)} 0%, transparent 58%)`,
          }}
        />
        {/* O mesmo anel branco da capa procedural, para o vazio pertencer ao app. */}
        <View
          style={{
            position: 'absolute',
            width: 62,
            height: 62,
            borderRadius: 31,
            borderWidth: 1.5,
            borderColor: 'rgba(255,255,255,.22)',
            transform: [{ rotate: '-18deg' }],
          }}
        />
        {icon}
      </View>

      <Display size={21} tracking={-0.03} align="center">
        {title}
      </Display>

      {children ? (
        <Body
          size={13.5}
          color={T.t55}
          align="center"
          style={{ maxWidth: 280, lineHeight: 20, marginTop: -6 }}>
          {children}
        </Body>
      ) : null}

      {action && onAction ? (
        <Pressable
          onPress={onAction}
          style={{
            marginTop: 2,
            paddingVertical: 12,
            paddingHorizontal: 20,
            borderRadius: R.r15,
            backgroundColor: accent,
          }}>
          <Display size={14.5} tracking={-0.015} color={C.onAccent}>
            {action}
          </Display>
        </Pressable>
      ) : null}
    </View>
  );
}
