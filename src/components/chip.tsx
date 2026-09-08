/**
 * Os chips do app: uma fileira que rola, e a pílula que vive nela.
 *
 * Nasceram na fileira de abas da biblioteca e são usados também pelos gêneros e pelo
 * tamanho da sessão de leitura. Ficam aqui porque já são três chamadores, e os três
 * querem exatamente a mesma pílula.
 */

import type { ComponentType, ReactNode } from 'react';
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
  icon: Icon,
  on,
  accent,
  onPress,
}: {
  label: string;
  /**
   * O glifo do chip, como componente — não como elemento pronto.
   *
   * A cor depende do estado, e um elemento já criado traria a cor de quem o criou: cada
   * chamador teria de repetir o `on ? C.onAccent : T.t72`. Recebendo o componente, a cor
   * é decidida aqui, uma vez.
   *
   * Opcional porque gênero não tem ícone: os nomes vêm da tag, e inventar um glifo por
   * gênero seria adivinhar.
   */
  icon?: ComponentType<{ size?: number; color?: string }>;
  on: boolean;
  accent: string;
  onPress: () => void;
}) {
  const color = on ? C.onAccent : T.t72;

  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        height: 34,
        // Com ícone o recuo da esquerda encolhe: o glifo já traz o próprio ar.
        paddingLeft: Icon ? 11 : 14,
        paddingRight: 14,
        borderRadius: R.r17,
        justifyContent: 'center',
        backgroundColor: on ? accent : C.card,
        borderWidth: 1,
        borderColor: on ? accent : T.t07,
      }}>
      {Icon ? <Icon size={15} color={color} /> : null}
      <Body size={12.5} weight={600} numberOfLines={1} color={color}>
        {label}
      </Body>
    </Pressable>
  );
}
