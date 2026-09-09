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
import { Details, PlayerLayer } from '@/components/details';
import { C } from '@/constants/theme';
import { LibraryProvider } from '@/lib/library';
import { DetailProvider } from '@/lib/detail';
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
            <DetailProvider>
              <Stack
                screenOptions={{
                  headerShown: false,
                  animation: 'fade',
                  contentStyle: { backgroundColor: C.bg },
                }}>
                {/*
                  Álbum, artista e o Now Playing **não** são rotas: são camadas deste
                  layout, e a ordem entre elas é nossa — ver `lib/detail.tsx`. Este Stack
                  fica só com as páginas: biblioteca, busca, pastas, ajustes, listas,
                  onboarding e varredura.
                */}
              </Stack>
              {/*
                A ordem é a pilha: telas do router embaixo, camadas de álbum e artista no
                meio, barra inferior por cima de tudo — e o player numa janela acima, por
                ser `transparentModal`.
              */}
              <Details />
              <Chrome />
              {/*
                O `zIndex` de cada camada (`details.tsx`, `chrome.tsx`) é quem decide a
                pilha, não a ordem aqui — mas a ordem ainda segue a pilha para leitura.
              */}
              <PlayerLayer />
            </DetailProvider>
          </PlayerProvider>
          </PlaylistsProvider>
        </LibraryProvider>
      </PrefsProvider>
    </GestureHandlerRootView>
  );
}
