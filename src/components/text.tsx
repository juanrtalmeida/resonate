/**
 * As três vozes tipográficas do design. O letter-spacing do .dc.html está em `em`;
 * o React Native só aceita pixels, então cada componente converte pelo próprio tamanho.
 */

import { Text, type TextProps, type TextStyle } from 'react-native';

import { F, T } from '@/constants/theme';

type Common = TextProps & {
  size: number;
  color?: string;
  /** Em `em`, como no design. */
  tracking?: number;
  align?: TextStyle['textAlign'];
};

export function Display({
  size,
  color = T.full,
  tracking = -0.035,
  weight = 700,
  align,
  style,
  ...rest
}: Common & { weight?: 700 | 800 }) {
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: weight === 800 ? F.displayHeavy : F.display,
          fontSize: size,
          lineHeight: size * 1.06,
          letterSpacing: size * tracking,
          color,
          textAlign: align,
        },
        style,
      ]}
    />
  );
}

export function Body({
  size,
  color = T.full,
  tracking = 0,
  weight = 400,
  align,
  style,
  ...rest
}: Common & { weight?: 400 | 500 | 600 }) {
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: weight === 600 ? F.bodySemi : weight === 500 ? F.bodyMedium : F.body,
          fontSize: size,
          letterSpacing: size * tracking,
          color,
          textAlign: align,
        },
        style,
      ]}
    />
  );
}

export function Mono({
  size,
  color = T.t4,
  tracking = 0,
  weight = 400,
  caps = false,
  align,
  style,
  ...rest
}: Common & { weight?: 400 | 500; caps?: boolean }) {
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: weight === 500 ? F.monoMedium : F.mono,
          fontSize: size,
          letterSpacing: size * tracking,
          color,
          textAlign: align,
          textTransform: caps ? 'uppercase' : undefined,
          fontVariant: ['tabular-nums'],
        },
        style,
      ]}
    />
  );
}
