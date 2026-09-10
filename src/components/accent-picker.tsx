/**
 * O seletor de acento: os quatro atalhos do design e as faixas de matiz e saturação.
 *
 * Morava em `app/settings.tsx`. Saiu de lá quando a tela de Ajustes ganhou uma segunda
 * versão, desenhada com os componentes do sistema (`screens/settings-native.tsx`): não há
 * seletor de cor nem no SwiftUI nem no Compose que faça o que este faz, então a versão
 * nativa hospeda **este mesmo componente** dentro do formulário, por um `RNHostView`. Uma
 * peça, dois desenhos de tela.
 */

import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

import { ACCENTS, C, R, T } from '@/constants/theme';
import { hsl, toHsl } from '@/lib/color';
import { useT } from '@/lib/prefs';
import { Check } from './icons';
import { Mono } from './text';

/**
 * A luminosidade de todo acento, presa.
 *
 * `C.onAccent` é a tinta escura que escreve em cima do acento — no botão de tocar, na
 * pílula da barra, no visto da cor escolhida. Livre no eixo da luminosidade, o acento
 * podia nascer escuro e apagar esse texto. 58% é onde os quatro do design vivem (56 a
 * 62), então qualquer cor do seletor tem o contraste que eles já tinham.
 *
 * É por isso que o seletor tem duas faixas e não três: matiz e saturação são livres, e a
 * terceira seria justamente a que quebra a legibilidade.
 */
export const ACCENT_L = 58;

/** Saturação: nem cinza, nem néon. */
const S_MIN = 30;
const S_MAX = 92;

/** A faixa de matiz nas cores que ela produz de verdade — não no arco-íris puro. */
const HUE_STRIP = `linear-gradient(90deg, ${[0, 60, 120, 180, 240, 300, 360]
  .map((h, i, all) => `${hsl(h, 78, ACCENT_L)} ${(i / (all.length - 1)) * 100}%`)
  .join(', ')})`;

/** Altura da faixa e diâmetro da alça. */
const STRIP = 30;
const KNOB = 26;

/**
 * Os quatro atalhos do design, mais o seletor livre.
 *
 * O quinto tile é o arco-íris: ele abre matiz e saturação para quem quer a própria cor, e
 * fica fechado para quem não quer — a paleta desenhada continua sendo o caminho de um
 * toque. Já vem aberto quando a cor em uso não é nenhuma das quatro, que é o caso de quem
 * escolheu a sua e voltou aos Ajustes.
 */
export function AccentPicker({
  accent,
  onPick,
}: {
  accent: string;
  onPick: (hex: string) => void;
}) {
  const t = useT();
  const preset = (ACCENTS as readonly string[]).includes(accent);
  const [open, setOpen] = useState(!preset);
  /*
    O rascunho: matiz e saturação enquanto o dedo está na faixa. `onPick` só quando ele
    sai.

    Cada `setAccent` escreve o prefs.json inteiro, e a cada quadro de arraste seriam umas
    sessenta escritas por segundo. A alça, a faixa de saturação e a prévia acompanham o
    dedo daqui, que é onde o movimento precisa ser visto.

    Nulo quer dizer "o que vale é a cor em uso": escolher um dos quatro atalhos zera o
    rascunho, e as alças vão para a cor escolhida em vez de ficarem onde o dedo parou.
  */
  const [draft, setDraft] = useState<{ h: number; s: number } | null>(null);
  const base = toHsl(accent);
  const h = draft?.h ?? base.h;
  const s = draft?.s ?? Math.min(S_MAX, Math.max(S_MIN, base.s));
  // Sem rascunho a cor mostrada é a de verdade, e não a que `ACCENT_L` reconstruiria: os
  // quatro atalhos vivem entre 56 e 62 de luminosidade, não cravados em 58.
  const shown = draft ? hsl(h, s, ACCENT_L) : accent;

  const choose = (hex: string) => {
    setDraft(null);
    onPick(hex);
  };

  return (
    <>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {ACCENTS.map((color) => (
          <Swatch
            key={color}
            background={color}
            on={color === accent}
            onPress={() => choose(color)}
          />
        ))}
        {/* O tile do seletor mostra a cor escolhida quando ela está em uso, e o arco-íris
            quando não — é o convite, e depois o próprio visto. */}
        <Swatch
          background={preset ? undefined : accent}
          gradient={preset ? HUE_STRIP : undefined}
          on={!preset}
          onPress={() => setOpen((v) => !v)}
        />
      </View>

      {open && (
        <Animated.View
          entering={FadeInDown.duration(240)}
          exiting={FadeOut.duration(140)}
          layout={LinearTransition.duration(240)}
          style={{ marginTop: 16, gap: 14 }}>
          <Strip
            label={t('settings.hue')}
            value={h / 360}
            gradient={HUE_STRIP}
            knob={shown}
            onSlide={(f) => setDraft({ h: f * 360, s })}
            onDone={(f) => onPick(hsl(f * 360, s, ACCENT_L))}
          />
          <Strip
            label={t('settings.saturation')}
            value={(s - S_MIN) / (S_MAX - S_MIN)}
            gradient={`linear-gradient(90deg, ${hsl(h, S_MIN, ACCENT_L)} 0%, ${hsl(
              h,
              S_MAX,
              ACCENT_L
            )} 100%)`}
            knob={shown}
            onSlide={(f) => setDraft({ h, s: S_MIN + f * (S_MAX - S_MIN) })}
            onDone={(f) => onPick(hsl(h, S_MIN + f * (S_MAX - S_MIN), ACCENT_L))}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: shown }} />
            <Mono size={11} tracking={0.06} color={T.t62}>
              {shown.toUpperCase()}
            </Mono>
          </View>
        </Animated.View>
      )}
    </>
  );
}

/** Um quadrado da fileira de acentos. */
function Swatch({
  background,
  gradient,
  on,
  onPress,
}: {
  background?: string;
  /** Usado no tile do seletor, que não tem uma cor só. */
  gradient?: string;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        aspectRatio: 1,
        borderRadius: R.r17,
        backgroundColor: background,
        experimental_backgroundImage: gradient,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: on ? T.full : 'transparent',
      }}>
      {on && <Check size={17} color={C.onAccent} />}
    </Pressable>
  );
}

/**
 * Uma faixa do seletor: o gradiente ao fundo, a alça em cima, toque e arraste.
 *
 * Toque e arraste são dois gestos em disputa, como na fita do player: o Pan sozinho
 * precisaria ativar ao primeiro pixel para o toque valer, e aí roubaria a rolagem da tela
 * de Ajustes. `failOffsetY` desiste quando o dedo sobe ou desce, e o Tap cobre o toque
 * seco.
 */
function Strip({
  label,
  value,
  gradient,
  knob,
  onSlide,
  onDone,
}: {
  label: string;
  /** Posição na faixa, 0 a 1. */
  value: number;
  gradient: string;
  /** Cor de dentro da alça: o que a escolha atual produz. */
  knob: string;
  onSlide: (fraction: number) => void;
  onDone: (fraction: number) => void;
}) {
  const [width, setWidth] = useState(0);
  // A alça tem largura: o curso útil é a faixa menos ela, senão as pontas ficam fora.
  const travel = Math.max(0, width - KNOB);
  const at = (x: number) => Math.min(1, Math.max(0, (x - KNOB / 2) / Math.max(1, travel)));

  /*
    Os dois terminam pelo mesmo caminho: `onSlide` assenta a alça no ponto exato onde o
    dedo saiu, e só então `onDone` grava. Sem o `onSlide` aqui, um toque seco na faixa
    gravava a cor e deixava a alça onde estava — a faixa não seguia o toque.
  */
  const settle = (x: number) => {
    const fraction = at(x);
    onSlide(fraction);
    onDone(fraction);
  };
  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((e) => settle(e.x));
  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-6, 6])
    .failOffsetY([-12, 12])
    .onUpdate((e) => onSlide(at(e.x)))
    .onEnd((e) => settle(e.x));

  return (
    <View>
      <Mono size={9.5} weight={500} tracking={0.16} caps color={T.t4}>
        {label}
      </Mono>
      <GestureDetector gesture={Gesture.Race(tap, pan)}>
        <View
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          style={{
            height: STRIP,
            borderRadius: STRIP / 2,
            marginTop: 9,
            experimental_backgroundImage: gradient,
            justifyContent: 'center',
          }}>
          <View
            style={{
              position: 'absolute',
              left: travel * value,
              width: KNOB,
              height: KNOB,
              borderRadius: KNOB / 2,
              borderWidth: 3,
              borderColor: T.full,
              backgroundColor: knob,
            }}
          />
        </View>
      </GestureDetector>
    </View>
  );
}
