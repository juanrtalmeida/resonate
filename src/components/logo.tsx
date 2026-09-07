/**
 * Nought — a identidade do Resonate.
 *
 * Não há símbolo separado do logotipo: o "o" da palavra *é* o símbolo. Um disco vazado
 * com um núcleo vivo, que sozinho serve de ícone do app e, dentro da palavra, ocupa o
 * lugar da letra.
 *
 * A especificação da marca vem em `em`, porque nasceu no navegador. Aqui tudo é derivado
 * do `size` pela mesma proporção — é o que garante que o anel continue alinhado à altura-x
 * do texto em qualquer tamanho, e não à baseline.
 *
 * As cores não são novas: ember é `ACCENTS[0]`, gold é `ACCENTS[1]`, cream é `T.full` e
 * ink é `C.onAccent`. A marca foi desenhada sobre a paleta que o app já tinha, então os
 * tokens ficam em `constants/theme.ts` e não num arquivo à parte.
 */

import { Text, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { useEffect } from 'react';

import { ACCENTS, C, F, T } from '@/constants/theme';

/** Ember: o anel. Gold: o núcleo. Fixos — a marca não segue o acento escolhido. */
export const EMBER = ACCENTS[0];
export const GOLD = ACCENTS[1];
export const INK = C.onAccent;
export const CREAM = T.full;

/**
 * O logotipo. Sempre minúsculo, sempre Bricolage 800 — as duas regras que a marca não
 * abre mão, e é por isso que nem o texto nem a família entram por prop.
 */
export function Wordmark({
  size = 24,
  color = CREAM,
  ring = EMBER,
  core = GOLD,
  /** Liga a pulsação do núcleo. Use só quando houver áudio tocando. */
  animated = false,
}: {
  size?: number;
  color?: string;
  ring?: string;
  core?: string;
  animated?: boolean;
}) {
  const type = {
    fontFamily: F.displayHeavy,
    fontSize: size,
    letterSpacing: -0.04 * size,
    lineHeight: size,
    color,
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text style={type}>res</Text>
      <View
        style={{
          width: 0.66 * size,
          height: 0.66 * size,
          borderRadius: 0.33 * size,
          borderWidth: 0.12 * size,
          borderColor: ring,
          marginHorizontal: 0.045 * size,
          alignItems: 'center',
          justifyContent: 'center',
          // Alinha o anel à altura-x. Sem isto ele flutua acima do texto.
          position: 'relative',
          top: 0.055 * size,
        }}>
        <Core size={0.2 * size} color={core} animated={animated} />
      </View>
      <Text style={type}>nate</Text>
    </View>
  );
}

/**
 * O núcleo, e a única coisa animada em toda a marca.
 *
 * `ReduceMotion.System` é o que respeita o "reduzir movimento" do aparelho sem nenhum
 * listener nosso: o Reanimated congela a animação no valor final quando a preferência
 * está ligada.
 */
function Core({
  size,
  color,
  animated,
}: {
  size: number;
  color: string;
  animated: boolean;
}) {
  const pulse = useSharedValue(animated ? 0 : 1);

  useEffect(() => {
    if (!animated) {
      pulse.value = withTiming(1, { duration: 200, reduceMotion: ReduceMotion.System });
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, {
        duration: 900,
        easing: Easing.inOut(Easing.ease),
        reduceMotion: ReduceMotion.System,
      }),
      -1,
      true
    );
  }, [animated, pulse]);

  // 0.68 → 1 na escala, 0.7 → 1 na opacidade: os valores do keyframe da marca.
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 0.68 + pulse.value * 0.32 }],
    opacity: 0.7 + pulse.value * 0.3,
  }));

  return (
    <Animated.View
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]}
    />
  );
}

/**
 * O "o" isolado, para tudo que não é texto: ícone, notificação, tela de bloqueio.
 *
 * O desenho muda com o tamanho, não só a escala. Abaixo de 16 o núcleo empasta contra o
 * anel e sai de cena; entre 16 e 23 o anel engrossa para não desaparecer. É a tabela de
 * redução da marca, e é o motivo de isto ser um componente e não um arquivo de imagem.
 */
export function Mark({
  size = 64,
  ring = EMBER,
  core = GOLD,
}: {
  size?: number;
  /** Em monocromia, passe a mesma cor nos dois: ink sobre claro, cream sobre escuro. */
  ring?: string;
  core?: string;
}) {
  const { stroke, radius } = reduction(size);
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      {/* Raio fixo em 24: a redução engrossa o traço, não muda o tamanho do anel. */}
      <Circle cx={32} cy={32} r={24} stroke={ring} strokeWidth={stroke} />
      {radius > 0 && <Circle cx={32} cy={32} r={radius} fill={core} />}
    </Svg>
  );
}

/** A tabela de redução, num lugar só — o gerador dos ícones usa os mesmos números. */
export function reduction(size: number): { stroke: number; radius: number } {
  if (size <= 15) return { stroke: 13, radius: 0 };
  if (size < 24) return { stroke: 10, radius: 6 };
  return { stroke: 8, radius: 7 };
}
