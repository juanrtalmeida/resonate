/** O rótulo de seção do design: mono em caixa alta, filete esmaecido e um valor à direita. */

import type { ReactNode } from 'react';
import { View } from 'react-native';

import { T } from '@/constants/theme';
import { Body, Mono } from './text';

export function SectionLabel({
  title,
  trailing,
  action,
  style,
}: {
  title: string;
  trailing?: string;
  /** Controle no fim da linha — o seletor de visualização, por exemplo. */
  action?: ReactNode;
  style?: { marginTop?: number; marginBottom?: number; paddingHorizontal?: number };
}) {
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 26, marginBottom: 12 },
        style,
      ]}>
      <Mono size={10} weight={500} tracking={0.16} caps color={T.t4}>
        {title}
      </Mono>
      <View
        style={{
          flex: 1,
          height: 1,
          experimental_backgroundImage: `linear-gradient(90deg, ${T.t14} 0%, transparent 100%)`,
        }}
      />
      {trailing ? (
        <Body size={11} color={T.t34}>
          {trailing}
        </Body>
      ) : null}
      {action}
    </View>
  );
}
