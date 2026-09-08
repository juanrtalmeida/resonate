/**
 * Os chips do app: uma fileira que rola, e a pílula que vive nela.
 *
 * Nasceram na fileira de abas da biblioteca e são usados também pelos gêneros e pelo
 * tamanho da sessão de leitura. Ficam aqui porque já são três chamadores, e os três
 * querem exatamente a mesma pílula.
 */

import type { ReactNode } from 'react';
import { Pressable, ScrollView } from 'react-native';

import { C, PADDING, R, T } from '@/constants/theme';
import { Body } from './text';

/**
 * A fileira rolável dos chips.
 *
 * Sangra para as bordas com a margem negativa e devolve o recuo por dentro: sem isso o
 * primeiro e o último chip encostam no ar em vez de alinharem com o resto da tela, e o
 * que rola para fora corta no recuo em vez de na borda.
 */
export function ChipRow({
  children,
  style,
}: {
  children: ReactNode;
  style?: { marginTop?: number };
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[{ marginHorizontal: -PADDING }, style]}
      contentContainerStyle={{ gap: 8, paddingHorizontal: PADDING, alignItems: 'center' }}>
      {children}
    </ScrollView>
  );
}

/** Um chip: aba ou gênero. Ativo vai no acento, com a tinta escura por cima. */
export function Chip({
  label,
  on,
  accent,
  onPress,
}: {
  label: string;
  on: boolean;
  accent: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        height: 34,
        paddingHorizontal: 14,
        borderRadius: R.r17,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: on ? accent : C.card,
        borderWidth: 1,
        borderColor: on ? accent : T.t07,
      }}>
      <Body size={12.5} weight={600} numberOfLines={1} color={on ? C.onAccent : T.t72}>
        {label}
      </Body>
    </Pressable>
  );
}
