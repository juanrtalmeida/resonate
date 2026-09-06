import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlbumArt } from '@/components/album-art';
import { Body, Display, Mono } from '@/components/text';
import { ACCENTS, C, CHROME_HEIGHT, PADDING, R, T, alpha } from '@/constants/theme';
import { artworkFor } from '@/lib/artwork';
import { useLibrary } from '@/lib/library';
import { usePrefs, type Treatment } from '@/lib/prefs';

const TREATMENTS: { key: Treatment; title: string; blurb: string }[] = [
  { key: 'ember', title: 'Brasa', blurb: 'Capa grande com brilho pulsante' },
  { key: 'vinyl', title: 'Vinil', blurb: 'Disco girando com braço' },
  { key: 'wave', title: 'Forma de onda', blurb: 'Onda da faixa inteira, com busca por toque' },
];

export default function Settings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accent, treatment, setAccent, setTreatment } = usePrefs();
  const { library, reset } = useLibrary();

  const art = artworkFor('Resonate', 'Ajustes');

  return (
    <ScrollView
      contentContainerStyle={{
        paddingTop: insets.top + 24,
        paddingHorizontal: PADDING,
        paddingBottom: CHROME_HEIGHT + insets.bottom,
      }}>
      <Display size={33} tracking={-0.035}>
        Ajustes
      </Display>

      <Label>Now Playing</Label>
      <View style={{ gap: 9 }}>
        {TREATMENTS.map((t) => {
          const on = t.key === treatment;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTreatment(t.key)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 13,
                padding: 14,
                borderRadius: 16,
                backgroundColor: C.raised,
                borderWidth: 1,
                borderColor: on ? alpha(accent, 0.55) : T.t07,
              }}>
              <AlbumArt
                art={art}
                size={44}
                radius={t.key === 'vinyl' ? 22 : 12}
                detail={t.key === 'wave' ? 'plain' : 'ring'}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Body size={14.5} weight={600} tracking={-0.01}>
                  {t.title}
                </Body>
                <Body size={12} color={T.t5} style={{ marginTop: 2 }}>
                  {t.blurb}
                </Body>
              </View>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  borderWidth: on ? 7 : 1.5,
                  borderColor: on ? accent : T.t24,
                }}
              />
            </Pressable>
          );
        })}
      </View>

      <Label>Cor de acento</Label>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {ACCENTS.map((color) => (
          <Pressable
            key={color}
            onPress={() => setAccent(color)}
            style={{
              width: 56,
              height: 56,
              borderRadius: R.r17,
              backgroundColor: color,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: color === accent ? T.full : 'transparent',
            }}>
            {color === accent && (
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.onAccent }} />
            )}
          </Pressable>
        ))}
      </View>

      <Label>Biblioteca</Label>
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

      <Pressable
        onPress={() => {
          reset();
          router.replace('/onboarding');
        }}
        style={{ marginTop: 9, padding: 16 }}>
        <Body size={13.5} weight={500} color={T.t42}>
          Apagar a biblioteca e começar do zero
        </Body>
      </Pressable>
    </ScrollView>
  );
}

function Label({ children }: { children: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 28, marginBottom: 12 }}>
      <Mono size={10} weight={500} tracking={0.16} caps color={T.t4}>
        {children}
      </Mono>
      <View
        style={{
          flex: 1,
          height: 1,
          experimental_backgroundImage: `linear-gradient(90deg, ${T.t14} 0%, transparent 100%)`,
        }}
      />
    </View>
  );
}
