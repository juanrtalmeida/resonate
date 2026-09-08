/**
 * Ajustes.
 *
 * Três blocos e nada mais: como o Now Playing se apresenta, a cor de acento, e o que
 * fazer com a biblioteca. Continuação da fila, embaralhar e repetir moram no player, ao
 * lado da fila que eles governam — trazê-los para cá seria pedir ao usuário que saísse da
 * música para mexer na música.
 */

import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Check, Trash } from '@/components/icons';
import { Wordmark } from '@/components/logo';
import { SectionLabel } from '@/components/section-label';
import { Body, Display, Mono } from '@/components/text';
import { ACCENTS, C, CHROME_HEIGHT, PADDING, R, T, alpha } from '@/constants/theme';
import { chromeScroll } from '@/lib/chrome-scroll';
import { useTabTop } from '@/lib/tab-top';
import { hsl, toHsl } from '@/lib/color';
import { useLibrary } from '@/lib/library';
import { usePrefs, useLang, useT, type Treatment } from '@/lib/prefs';
import { LANGS, localeOf, type Key } from '@/lib/i18n';
import { Chip, ChipRow } from '@/components/chip';

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
const ACCENT_L = 58;

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

/** Os três modos. Título e explicação são chaves de tradução. */
const TREATMENTS = [
  { key: 'ember', title: 'treatment.ember', blurb: 'treatment.ember.blurb' },
  { key: 'vinyl', title: 'treatment.vinyl', blurb: 'treatment.vinyl.blurb' },
  { key: 'wave', title: 'treatment.wave', blurb: 'treatment.wave.blurb' },
] as const satisfies { key: Treatment; title: Key; blurb: Key }[];

export default function Settings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accent, treatment, setAccent, setTreatment, language, setLanguage } = usePrefs();
  const { library, reset } = useLibrary();
  const t = useT();
  const lang = useLang();

  // Tocar em Ajustes já estando nela volta ao topo.
  const list = useRef<ScrollView>(null);
  useTabTop(
    'Settings',
    useCallback(() => list.current?.scrollTo({ y: 0, animated: true }), [])
  );

  const current = TREATMENTS.find((t) => t.key === treatment) ?? TREATMENTS[0];

  return (
    <ScrollView
      ref={list}
      {...chromeScroll}
      contentContainerStyle={{
        paddingTop: insets.top + 24,
        paddingHorizontal: PADDING,
        paddingBottom: CHROME_HEIGHT + insets.bottom,
      }}>
      <Display size={33} tracking={-0.035}>
        {t('settings.title')}
      </Display>

      {/*
        Os três modos numa fileira, e não em cartões empilhados.

        Cada cartão tinha 72 de altura e uma capa de exemplo do lado — a *mesma* capa
        procedural nos três, semeada por "Resonate / Ajustes". Não dizia nada sobre o modo
        e ocupava metade da tela. Aqui cada tile desenha o próprio modo, e a explicação do
        escolhido fica numa linha abaixo da fileira.
      */}
      <SectionLabel title={t('settings.nowPlaying')} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {TREATMENTS.map((mode) => (
          <Mode
            key={mode.key}
            kind={mode.key}
            title={t(mode.title)}
            on={mode.key === treatment}
            accent={accent}
            onPress={() => setTreatment(mode.key)}
          />
        ))}
      </View>
      {/* A `key` faz a linha reentrar quando o modo muda: sem ela o texto troca seco. */}
      <Animated.View key={current.key} entering={FadeIn.duration(200)}>
        <Body size={12.5} color={T.t5} style={{ marginTop: 12, lineHeight: 18 }}>
          {t(current.blurb)}
        </Body>
      </Animated.View>

      <SectionLabel title={t('settings.accent')} />
      <AccentPicker accent={accent} onPick={setAccent} />

      {/*
        O idioma, entre a cor e a biblioteca: as duas primeiras seções são aparência, e
        idioma é a terceira coisa que se procura aqui. "Automático" segue o aparelho.
      */}
      <SectionLabel title={t('settings.language')} />
      <ChipRow>
        <Chip
          label={t('settings.languageAuto')}
          on={language === 'auto'}
          accent={accent}
          onPress={() => setLanguage('auto')}
        />
        {LANGS.map((item) => (
          <Chip
            key={item.key}
            // O nome de cada idioma no próprio idioma: ninguém procura "Japonês" numa
            // tela que já está em japonês.
            label={item.label}
            on={language === item.key}
            accent={accent}
            onPress={() => setLanguage(item.key)}
          />
        ))}
      </ChipRow>

      <SectionLabel title={t('settings.library')} />
      <Pressable
        onPress={() => router.push('/onboarding')}
        style={{
          padding: 16,
          borderRadius: 16,
          backgroundColor: C.raised,
          borderWidth: 1,
          borderColor: T.t07,
        }}>
        <Body size={14.5} weight={600}>
          {t('settings.rescan')}
        </Body>
        <Body size={12} color={T.t5} style={{ marginTop: 3 }}>
          {library
            ? t('settings.scanned', {
                tracks: library.tracks.length,
                // A data no formato de quem lê: o idioma escolhido manda no locale.
                date: new Date(library.scannedAt).toLocaleDateString(localeOf(lang)),
              })
            : t('settings.neverScanned')}
        </Body>
      </Pressable>

      <Wipe
        onConfirm={() => {
          reset();
          router.replace('/onboarding');
        }}
      />

      {/* Assinatura no pé, onde ela cabe: é a tela em que se procura de quem é o app. */}
      <View style={{ alignItems: 'center', marginTop: 40, gap: 8 }}>
        <Wordmark size={17} />
        <Mono size={9.5} weight={500} tracking={0.16} caps color={T.t24}>
          {t('settings.version', { version: Constants.expoConfig?.version ?? '—' })}
        </Mono>
      </View>
    </ScrollView>
  );
}

/**
 * Os quatro atalhos do design, mais o seletor livre.
 *
 * O quinto tile é o arco-íris: ele abre matiz e saturação para quem quer a própria cor, e
 * fica fechado para quem não quer — a paleta desenhada continua sendo o caminho de um
 * toque. Já vem aberto quando a cor em uso não é nenhuma das quatro, que é o caso de quem
 * escolheu a sua e voltou aos Ajustes.
 */
function AccentPicker({ accent, onPick }: { accent: string; onPick: (hex: string) => void }) {
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

/**
 * Um modo, desenhando a si mesmo.
 *
 * As miniaturas são compostas de primitivas em vez de imagem: a brasa é um quadrado com o
 * brilho, o vinil é um disco com sulcos, a onda são barras. Um `AlbumArt` de exemplo — o
 * que havia antes — mostra uma capa, e capa é o que os três têm em comum; o que muda é
 * justamente o tratamento.
 */
function Mode({
  kind,
  title,
  on,
  accent,
  onPress,
}: {
  kind: Treatment;
  title: string;
  on: boolean;
  accent: string;
  onPress: () => void;
}) {
  const ink = on ? accent : T.t3;

  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        alignItems: 'center',
        gap: 10,
        paddingVertical: 14,
        borderRadius: 16,
        backgroundColor: on ? alpha(accent, 0.09) : C.raised,
        borderWidth: 1,
        borderColor: on ? alpha(accent, 0.5) : T.t07,
      }}>
      <View style={{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center' }}>
        {kind === 'ember' && (
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              borderWidth: 1.5,
              borderColor: ink,
              experimental_backgroundImage: on
                ? `radial-gradient(circle at 50% 50%, ${alpha(accent, 0.5)} 0%, transparent 70%)`
                : undefined,
            }}
          />
        )}

        {kind === 'vinyl' && (
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              borderWidth: 1.5,
              borderColor: ink,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            {/* Dois sulcos e o furo: é o que faz um círculo ler como disco. */}
            <View
              style={{
                position: 'absolute',
                width: 28,
                height: 28,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: on ? alpha(accent, 0.45) : T.t18,
              }}
            />
            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: ink }} />
          </View>
        )}

        {kind === 'wave' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 42 }}>
            {[0.45, 0.85, 0.6, 1, 0.35].map((h, i) => (
              <View
                key={i}
                style={{
                  width: 3.5,
                  height: 42 * h,
                  borderRadius: 2,
                  backgroundColor: ink,
                }}
              />
            ))}
          </View>
        )}
      </View>

      <Body size={12.5} weight={600} tracking={-0.01} color={on ? T.full : T.t5}>
        {title}
      </Body>
    </Pressable>
  );
}

/**
 * Apagar a biblioteca — em vermelho, e com confirmação no lugar.
 *
 * Antes era um texto cinza de 13,5 que chamava `reset()` e mandava para o onboarding **no
 * primeiro toque**, sem perguntar nada. É a ação mais destrutiva do app e a que menos
 * parecia um botão.
 *
 * A confirmação troca o botão em vez de abrir um diálogo, como no menu do toque longo:
 * a decisão fica onde o dedo já está.
 */
function Wipe({ onConfirm }: { onConfirm: () => void }) {
  const t = useT();
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <Pressable
        onPress={() => setAsking(true)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 9,
          marginTop: 10,
          height: 52,
          borderRadius: 16,
          backgroundColor: alpha(C.danger, 0.12),
          borderWidth: 1,
          borderColor: alpha(C.danger, 0.4),
        }}>
        <Trash size={16} color={C.danger} />
        <Body size={13.5} weight={600} color={C.danger}>
          {t('settings.wipe')}
        </Body>
      </Pressable>
    );
  }

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      style={{
        marginTop: 10,
        padding: 16,
        borderRadius: 16,
        backgroundColor: alpha(C.danger, 0.08),
        borderWidth: 1,
        borderColor: alpha(C.danger, 0.4),
      }}>
      <Body size={14} weight={600} align="center">
        {t('settings.wipe.confirm')}
      </Body>
      <Body size={12} color={T.t5} align="center" style={{ marginTop: 6, lineHeight: 17 }}>
        {t('settings.wipe.warning')}
      </Body>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
        <Pressable
          onPress={() => setAsking(false)}
          style={{
            flex: 1,
            height: 46,
            borderRadius: R.r15,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: T.t12,
          }}>
          <Body size={13.5} weight={600} color={T.t72}>
            {t('common.cancel')}
          </Body>
        </Pressable>
        <Pressable
          onPress={onConfirm}
          style={{
            flex: 1,
            height: 46,
            borderRadius: R.r15,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: C.danger,
          }}>
          <Body size={13.5} weight={600} color={T.full}>
            {t('common.delete')}
          </Body>
        </Pressable>
      </View>
    </Animated.View>
  );
}
