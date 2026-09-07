/**
 * A folha de especificação da marca, como tela do app.
 *
 * Existe pelo mesmo motivo que uma página `/brand` num site: pôr o logotipo, o símbolo em
 * todos os tamanhos da tabela de redução e as duas versões do ícone lado a lado, onde dá
 * para ver se algum deles quebrou. Não tem entrada na navegação — chega-se por
 * `/brand`, e é para isso que ela serve.
 */

import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SectionLabel } from '@/components/section-label';
import { Body, Mono } from '@/components/text';
import { CREAM, EMBER, GOLD, INK, Mark, Wordmark } from '@/components/logo';
import { C, PADDING, T } from '@/constants/theme';

export default function BrandScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 40,
        paddingHorizontal: PADDING,
      }}>
      <Wordmark size={30} />
      <Mono size={10} weight={500} tracking={0.16} caps color={T.t4} style={{ marginTop: 10 }}>
        Nought · identidade
      </Mono>

      <SectionLabel title="Logotipo" />
      <View style={{ gap: 22 }}>
        {[58, 24, 19].map((size) => (
          <View key={size} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Wordmark size={size} animated={size === 58} />
            <Mono size={9.5} color={T.t24}>
              {size}
            </Mono>
          </View>
        ))}
      </View>

      <SectionLabel title="Símbolo · tabela de redução" />
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 22 }}>
        {[64, 24, 16, 12].map((size) => (
          <View key={size} style={{ alignItems: 'center', gap: 8 }}>
            <Mark size={size} />
            <Mono size={9.5} color={T.t24}>
              {size}
            </Mono>
          </View>
        ))}
      </View>
      <Body size={12} color={T.t42} style={{ marginTop: 12 }}>
        Abaixo de 16 o núcleo sai: nesse tamanho ele empasta contra o anel. Entre 16 e 23
        o traço engrossa para não desaparecer.
      </Body>

      <SectionLabel title="Ícone do app" />
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <Icon label="Ember">
          <View
            style={{
              width: 84,
              height: 84,
              borderRadius: 84 * 0.285,
              alignItems: 'center',
              justifyContent: 'center',
              experimental_backgroundImage:
                'linear-gradient(150deg, #FF8A5C 0%, #F2653A 44%, #B33C1E 100%)',
            }}>
            <Mark size={Math.round(84 * 0.57)} ring={INK} core={INK} />
          </View>
        </Icon>
        <Icon label="Dark">
          <View
            style={{
              width: 84,
              height: 84,
              borderRadius: 84 * 0.285,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: 'rgba(246,241,234,0.07)',
              experimental_backgroundImage:
                'radial-gradient(120% 120% at 20% 0%, #2A1710 0%, #12100E 62%)',
            }}>
            <Mark size={Math.round(84 * 0.57)} />
          </View>
        </Icon>
      </View>

      <SectionLabel title="Monocromia" />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {/* Numa cor só, anel e núcleo assumem a mesma tinta. O gold é da versão colorida. */}
        <Swatch background={CREAM}>
          <Wordmark size={22} color={INK} ring={INK} core={INK} />
        </Swatch>
        <Swatch background={C.bg}>
          <Wordmark size={22} color={CREAM} ring={CREAM} core={CREAM} />
        </Swatch>
      </View>

      <SectionLabel title="Cores" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {(
          [
            ['ember', EMBER],
            ['gold', GOLD],
            ['cream', CREAM],
            ['ink', INK],
            ['bg', C.bg],
          ] as const
        ).map(([name, value]) => (
          <View key={name} style={{ alignItems: 'center', gap: 6 }}>
            <View
              style={{
                width: 54,
                height: 54,
                borderRadius: 14,
                backgroundColor: value,
                borderWidth: 1,
                borderColor: T.t12,
              }}
            />
            <Mono size={9} weight={500} tracking={0.1} caps color={T.t4}>
              {name}
            </Mono>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function Icon({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ alignItems: 'center', gap: 9 }}>
      {children}
      <Mono size={9} weight={500} tracking={0.12} caps color={T.t4}>
        {label}
      </Mono>
    </View>
  );
}

function Swatch({ background, children }: { background: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        flex: 1,
        paddingVertical: 22,
        alignItems: 'center',
        borderRadius: 16,
        backgroundColor: background,
        borderWidth: 1,
        borderColor: T.t12,
      }}>
      {children}
    </View>
  );
}
