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
import { useCallback, useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Chrome } from '@/components/chrome';
import { Details, PlayerLayer } from '@/components/details';
import { Splash, SplashGround } from '@/components/splash';
import { C } from '@/constants/theme';
import { LibraryProvider } from '@/lib/library';
import { DetailProvider } from '@/lib/detail';
import { PlayerProvider } from '@/lib/player';
import { PlaylistsProvider } from '@/lib/playlists';
import { PrefsProvider } from '@/lib/prefs';

SplashScreen.preventAutoHideAsync();

/**
 * A splash nativa sai em fade, e não num corte.
 *
 * Por cima dela entra a nossa camada animada (`components/splash.tsx`), que desenha a
 * mesma marca no mesmo lugar — mas as duas ainda são imagens diferentes em processos
 * diferentes, e um corte seco entre elas pisca. 220 ms de fade cobrem a troca sem somar
 * espera perceptível.
 *
 * No escopo do módulo, junto do `preventAutoHideAsync`: as duas configuram a mesma coisa,
 * e chamar isto de dentro de um componente correria depois do primeiro render.
 */
SplashScreen.setOptions({ duration: 220, fade: true });

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

  /**
   * A abertura ainda está na tela.
   *
   * Estado, e não só a animação: é ele que desmonta a camada no fim, e enquanto ele é
   * verdade a camada cobre o app — que monta atrás dela, com a thread de JS livre para
   * isso porque a animação corre na de UI.
   */
  const [opening, setOpening] = useState(true);
  const opened = useCallback(() => setOpening(false), []);

  /*
    A splash nativa sai **depois** do primeiro render da nossa camada, não junto com ele.

    Escondê-la no mesmo commit descobria o app por um quadro antes de a nossa camada
    pintar. O efeito corre depois do commit, então quando ele chama `hideAsync` a marca já
    está desenhada por cima — e o fade de 220 ms troca uma pela outra sem que se veja.
  */
  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  // Sem as fontes o layout mede errado e a tela salta quando elas chegam. Só o fundo: por
  // cima dele a splash nativa ainda está mostrando a marca — ver `SplashGround`.
  if (!loaded) return <SplashGround />;

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
              {/*
                Último de todos, e acima de todos por `zIndex`: a abertura cobre o app
                inteiro enquanto ele monta, e sai revelando o que já está pronto atrás.
              */}
              {opening && <Splash onDone={opened} />}
            </DetailProvider>
          </PlayerProvider>
          </PlaylistsProvider>
        </LibraryProvider>
      </PrefsProvider>
    </GestureHandlerRootView>
  );
}
