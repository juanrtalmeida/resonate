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
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Check, Trash } from '@/components/icons';
import { Wordmark } from '@/components/logo';
import { SectionLabel } from '@/components/section-label';
import { Body, Display, Mono } from '@/components/text';
import { ACCENTS, C, CHROME_HEIGHT, PADDING, R, T, alpha } from '@/constants/theme';
import { chromeScroll } from '@/lib/chrome-scroll';
import { useLibrary } from '@/lib/library';
import { usePrefs, type Treatment } from '@/lib/prefs';

const TREATMENTS: { key: Treatment; title: string; blurb: string }[] = [
  { key: 'ember', title: 'Brasa', blurb: 'Capa grande, com o brilho pulsando atrás dela.' },
  { key: 'vinyl', title: 'Vinil', blurb: 'A capa vira um disco, e ele gira enquanto toca.' },
  {
    key: 'wave',
    title: 'Onda',
    blurb: 'A forma de onda da faixa inteira. Toque ou arraste nela para buscar.',
  },
];

export default function Settings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accent, treatment, setAccent, setTreatment } = usePrefs();
  const { library, reset } = useLibrary();

  const current = TREATMENTS.find((t) => t.key === treatment) ?? TREATMENTS[0];

  return (
    <ScrollView
      {...chromeScroll}
      contentContainerStyle={{
        paddingTop: insets.top + 24,
        paddingHorizontal: PADDING,
        paddingBottom: CHROME_HEIGHT + insets.bottom,
      }}>
      <Display size={33} tracking={-0.035}>
        Ajustes
      </Display>

      {/*
        Os três modos numa fileira, e não em cartões empilhados.

        Cada cartão tinha 72 de altura e uma capa de exemplo do lado — a *mesma* capa
        procedural nos três, semeada por "Resonate / Ajustes". Não dizia nada sobre o modo
        e ocupava metade da tela. Aqui cada tile desenha o próprio modo, e a explicação do
        escolhido fica numa linha abaixo da fileira.
      */}
      <SectionLabel title="Now Playing" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {TREATMENTS.map((t) => (
          <Mode
            key={t.key}
            kind={t.key}
            title={t.title}
            on={t.key === treatment}
            accent={accent}
            onPress={() => setTreatment(t.key)}
          />
        ))}
      </View>
      {/* A `key` faz a linha reentrar quando o modo muda: sem ela o texto troca seco. */}
      <Animated.View key={current.key} entering={FadeIn.duration(200)}>
        <Body size={12.5} color={T.t5} style={{ marginTop: 12, lineHeight: 18 }}>
          {current.blurb}
        </Body>
      </Animated.View>

      <SectionLabel title="Cor de acento" />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {ACCENTS.map((color) => (
          <Pressable
            key={color}
            onPress={() => setAccent(color)}
            style={{
              flex: 1,
              aspectRatio: 1,
              borderRadius: R.r17,
              backgroundColor: color,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: color === accent ? T.full : 'transparent',
            }}>
            {color === accent && <Check size={17} color={C.onAccent} />}
          </Pressable>
        ))}
      </View>

      <SectionLabel title="Biblioteca" />
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
          Varrer de novo
        </Body>
        <Body size={12} color={T.t5} style={{ marginTop: 3 }}>
          {library
            ? `${library.tracks.length} faixas · última varredura em ${new Date(
                library.scannedAt
              ).toLocaleDateString('pt-BR')}`
            : 'Nenhuma varredura ainda'}
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
          Versão {Constants.expoConfig?.version ?? '—'}
        </Mono>
      </View>
    </ScrollView>
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
          Apagar a biblioteca
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
        Apagar a biblioteca?
      </Body>
      <Body size={12} color={T.t5} align="center" style={{ marginTop: 6, lineHeight: 17 }}>
        As listas e as curtidas vão junto. Nenhum arquivo de música é apagado do aparelho —
        você pode varrer de novo depois.
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
            Cancelar
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
            Apagar
          </Body>
        </Pressable>
      </View>
    </Animated.View>
  );
}
