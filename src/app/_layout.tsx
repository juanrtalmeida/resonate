import {
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';
import { DMMono_400Regular, DMMono_500Medium } from '@expo-google-fonts/dm-mono';
import {
  FamiljenGrotesk_400Regular,
  FamiljenGrotesk_500Medium,
  FamiljenGrotesk_600SemiBold,
} from '@expo-google-fonts/familjen-grotesk';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Chrome } from '@/components/chrome';
import { C } from '@/constants/theme';
import { LibraryProvider } from '@/lib/library';
import { PlayerProvider } from '@/lib/player';
import { PlaylistsProvider } from '@/lib/playlists';
import { PrefsProvider } from '@/lib/prefs';

SplashScreen.preventAutoHideAsync();

/**
 * Sem isto o React Navigation adota como rota inicial o primeiro <Stack.Screen> declarado
 * — que aqui é `album/[id]`, e o app abria em "Álbum não encontrado".
 */
export const unstable_settings = { initialRouteName: 'index' };

export default function RootLayout() {
  const [loaded] = useFonts({
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    FamiljenGrotesk_400Regular,
    FamiljenGrotesk_500Medium,
    FamiljenGrotesk_600SemiBold,
    DMMono_400Regular,
    DMMono_500Medium,
  });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  // Sem as fontes o layout mede errado e a tela salta quando elas chegam.
  if (!loaded) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="light" />
      <PrefsProvider>
        <LibraryProvider>
          <PlaylistsProvider>
          <PlayerProvider>
              <Stack
                screenOptions={{
                  headerShown: false,
                  animation: 'fade',
                  contentStyle: { backgroundColor: C.bg },
                }}>
                {/*
                  Estas duas telas fazem a própria transição: o stack não anima
                  (animation: 'none') e a tela de baixo continua montada atrás
                  (transparentModal).

                  O contentStyle transparente é obrigatório aqui. O padrão acima pinta
                  C.bg no container de toda tela, e esse fundo opaco fica *atrás* do
                  conteúdo que esmaece — durante a animação sobrava um retângulo preto no
                  lugar da tela anterior.
                */}
                <Stack.Screen
                  name="album/[id]"
                  options={{
                    presentation: 'transparentModal',
                    animation: 'none',
                    contentStyle: { backgroundColor: 'transparent' },
                  }}
                />
                <Stack.Screen
                  name="artist/[name]"
                  options={{
                    presentation: 'transparentModal',
                    animation: 'none',
                    contentStyle: { backgroundColor: 'transparent' },
                  }}
                />
                <Stack.Screen
                  name="player"
                  options={{
                    presentation: 'transparentModal',
                    animation: 'none',
                    contentStyle: { backgroundColor: 'transparent' },
                  }}
                />
              </Stack>
              <Chrome />
          </PlayerProvider>
          </PlaylistsProvider>
        </LibraryProvider>
      </PrefsProvider>
    </GestureHandlerRootView>
  );
}
