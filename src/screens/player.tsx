import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ScrollView, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeInDown,
  FadeOutDown,
  ReduceMotion,
  SensorType,
  type SharedValue,
  runOnJS,
  useAnimatedReaction,
  useAnimatedSensor,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlbumArt } from '@/components/album-art';
import { Backdrop } from '@/components/backdrop';
import {
  ChevronDown,
  Disc,
  Heart,
  Lyrics as LyricsIcon,
  Moon,
  Next,
  Output,
  Pause,
  Play,
  Previous,
  Queue,
  Instagram,
  Repeat,
  Share as ShareIcon,
  Shuffle,
} from '@/components/icons';
import { Panel } from '@/components/panel';
import { Ribbon, Vinyl, Waveform } from '@/components/player-visuals';
import { Beat, Press } from '@/components/press';
import { useShareCard } from '@/components/share-card';
import { QueueRow } from '@/components/queue-row';
import { Body, Display, Mono } from '@/components/text';
import { C, R, T, alpha, fmt } from '@/constants/theme';
import { artworkFor } from '@/lib/artwork';
import { canPickOutput, pickAudioOutput } from '@/lib/audio-output';
import { RoutePicker, canShowRoutePicker } from '../../modules/audio-route';
import { chromeReveal } from '@/lib/chrome-scroll';
import { useDetail } from '@/lib/detail';
import { canShareToStories } from '@/lib/share';
import { usePlayer } from '@/lib/player';
import { usePrefs, useT } from '@/lib/prefs';
import type { Track } from '@/lib/scan';
import { TILT_INTERVAL, TILT_REST, tiltAngles, tiltStep } from '@/lib/tilt';
import { LyricsView, NoLyrics } from '@/components/lyrics';
import { type Lyrics } from '@/lib/lrc';
import { forgetLyrics, useLyrics } from '@/lib/lyrics';
import { CONTINUATIONS, continuationFor, type Continuation } from '@/lib/queue';
import { importLrc } from '@/lib/scan';
import { leftOf, SLEEP_MINUTES, type Sleep } from '@/lib/sleep';
import { useLibrary } from '@/lib/library';
import {
  ZoomFade,
  ZoomScreen,
  ZoomTarget,
  useZoomClose,
  useZoomFade,
  useZoomProgress,
} from '@/lib/zoom';

/**
 * Respiro entre a barra do topo e a capa.
 *
 * Aplicado como `marginTop` de verdade, e não deixado por conta da folga: com
 * `justifyContent: 'center'`, tela sem folga nenhuma cola a capa na barra — foi o que
 * apareceu no iPhone. Entra também na reserva abaixo, então a capa encolhe o suficiente
 * para o respiro existir em vez de empurrar o conteúdo para fora.
 */
const ART_TOP = 22;

/**
 * Altura reservada ao que não é a capa, em dp: fechar (38), título grande (70), fita (44),
 * tempo (32), transporte (92), fileira secundária (60), recuos da tela (20), as margens
 * entre eles, e o respiro do topo.
 *
 * Conservadora de propósito: errar para cima encolhe a capa alguns dp numa tela curta, e
 * errar para baixo cola ela na barra do topo. O primeiro ninguém nota.
 */
const ROOM = 400 + ART_TOP;

/** A troca entre capa e letra. Curta de propósito: é uma aba, não uma transição de tela. */
const PANE = { duration: 240, easing: Easing.out(Easing.cubic) } as const;

/**
 * O Now Playing, como camada. Não é rota — ver `lib/detail.tsx`.
 */
export function PlayerScreen() {
  const insets = useSafeAreaInsets();
  const { closePlayer } = useDetail();
  const { height: screen } = useWindowDimensions();
  const { track, playing, duration, toggle, next, previous, seekTo, canNext, canPrevious, elapsed } =
    usePlayer();
  const { accent, treatment, isLiked, toggleLike } = usePrefs();
  const t = useT();
  const { albumById } = useLibrary();
  /**
   * 0 = capa, 1 = letra. Shared value, e não estado: a troca anima na thread de UI sem
   * acordar o React.
   *
   * Como estado, tocar na aba re-renderizava o Now Playing inteiro e trocava um painel
   * pelo outro na árvore: a capa desmontava e a imagem recarregava, o vinil voltava a
   * zero, a letra remontava linha por linha. Era o piscar com travada de carregamento —
   * e, entre um painel e outro, não havia animação nenhuma para ver.
   */
  const lyricsOn = useSharedValue(0);
  const [showQueue, setShowQueue] = useState(false);
  const { share, card: shareCardView } = useShareCard();

  // 0 = capa cheia, 1 = capa reduzida com a fila embaixo.
  const q = useSharedValue(0);
  useEffect(() => {
    q.value = withTiming(showQueue ? 1 : 0, { duration: 320 });
  }, [showQueue, q]);

  /**
   * Trava o arrasto para baixo com a letra **ou** a fila abertas.
   *
   * A fila é um `ScrollView` comum, sem "bounce" no topo no Android: arrastar para baixo
   * ali, com nada mais para rolar, deixava o toque livre para o gesto de fechar por baixo
   * — o player minimizava sem o usuário pedir. Só `lyricsOn` travava antes; a fila lia o
   * arrasto como se fosse a capa.
   */
  const dismissBlocked = useDerivedValue<number>(() =>
    lyricsOn.value > 0.5 || q.value > 0.5 ? 1 : 0
  );

  // Derivado na thread de UI: a fita e a forma de onda leem isto sem passar pelo React.
  const progress = useDerivedValue(() =>
    duration > 0 ? Math.min(1, elapsed.value / duration) : 0
  );

  const dragX = useSharedValue(0);
  const tilt = useTilt();
  const dragStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 900 },
      { translateX: dragX.value },
      { rotate: `${dragX.value * 0.02}deg` },
      { rotateX: `${tilt.rx.value}deg` },
      { rotateY: `${tilt.ry.value}deg` },
    ],
  }));
  const slideOnly = useAnimatedStyle(() => ({
    transform: [
      { perspective: 900 },
      { translateX: dragX.value },
      { rotateX: `${tilt.rx.value}deg` },
      { rotateY: `${tilt.ry.value}deg` },
    ],
  }));

  /*
    A capa mede pelo espaço que sobra, não por um número fixo.

    Com 286 cravado, tela mais curta não tinha para onde encolher: a área da arte é
    `flex: 1` e apertava, mas a capa é uma View de tamanho fixo — o que cedia era o vão em
    volta dela, e ela encostava na barra do topo. Foi o que apareceu no iPhone.

    `ROOM` é a soma do que não é capa: botão de fechar, título grande, fita, tempo,
    transporte, a fileira secundária e os recuos da tela — mais 24 de respiro no topo, que
    é a margem pedida. O que sobra disso é o teto da capa; o piso impede que ela vire uma
    miniatura numa tela muito curta.
  */
  const artRoom = screen - insets.top - Math.max(insets.bottom, 18) - ROOM;
  const artSize =
    treatment === 'vinyl'
      ? Math.max(180, Math.min(310, artRoom))
      : treatment === 'wave'
        ? 96
        : Math.max(170, Math.min(286, artRoom));

  /**
   * A capa encolhendo para dar lugar à fila — e voltando.
   *
   * O `artSize` era trocado por `ART_MINI` no mesmo render em que `showQueue` virava: a
   * capa aparecia com 92 px no primeiro quadro e o `LinearTransition` do invólucro animava
   * uma caixa vazia em volta dela. Não havia transição para ver, nem na ida nem na volta —
   * era o salto que a fila dava ao abrir e ao fechar.
   *
   * Agora a capa é sempre do tamanho cheio e quem encolhe é um `scale`, que não passa pelo
   * layout: a arte muda de tamanho quadro a quadro, na thread de UI. O espaço que a escala
   * libera não é devolvido de graça — `scale` não mexe no layout —, então uma margem
   * negativa proporcional puxa o que vem embaixo exatamente na medida em que a capa
   * encolheu. Só as duas margens passam pelo layout, uma vez por transição, e o que se vê
   * mover está no caminho rápido.
   *
   * `transformOrigin: 'top center'` é o que faz a capa encolher **para cima**, em direção
   * ao lugar dela na fila, em vez de para o próprio centro. O valor é reconhecido; foi um
   * `transformOrigin` inválido caindo em silêncio no centro que derrubou as tentativas
   * anteriores de escalar esta capa.
   *
   * O modo onda fica de fora: ali a capa já é 96 contra os 92 da fila, e escalar o bloco
   * inteiro — que tem título e forma de onda dentro — encolheria o texto por 4 px de
   * ganho.
   */
  const shrink = treatment === 'wave' ? 1 : ART_MINI / artSize;
  const artShrink = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - q.value * (1 - shrink) }],
    marginTop: (1 - q.value) * ART_TOP,
    marginBottom: -q.value * artSize * (1 - shrink),
  }));

  /**
   * O que existe só fora da fila: a fileira de pílulas embaixo da capa.
   *
   * Esmaece e recolhe em vez de desmontar — desmontar é o que fazia a fila subir num
   * salto. `pointerEvents` desliga junto: esmaecida, ela não pode continuar sob o dedo.
   */
  const SECONDARY_H = 34;
  const queueless = useAnimatedStyle(() => ({
    opacity: 1 - q.value,
    transform: [{ scale: 1 - q.value * 0.08 }],
    marginTop: (1 - q.value) * 26,
    marginBottom: -q.value * SECONDARY_H,
    pointerEvents: q.value > 0.5 ? 'none' : 'auto',
  }));


  /*
    A letra é pedida desde que a tela monta, e não quando o painel abre: a leitura é I/O
    de arquivo, e assim ela corre enquanto o usuário olha a capa. `useLyrics` guarda o
    resultado, então reabrir o painel é instantâneo.

    Antes do `return` de "nada tocando": hook não pode ficar atrás de um return.
  */
  const lyrics = useLyrics(track);

  if (!track) {
    return (
      <ZoomScreen background={C.surface} onClosed={closePlayer}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Body size={14} color={T.t5}>
            {t('player.nothing')}
          </Body>
        </View>
      </ZoomScreen>
    );
  }

  const art = artworkFor(track.artist, track.album);
  const cover = albumById(track.albumId)?.cover ?? null;
  const liked = isLiked(track.id);

  // Os callbacks rodam na thread de UI, fora do render: escrever no shared value ali é
  // o contrato do Reanimated, mas a regra de imutabilidade do compilador não sabe disso.
  const swipe = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .onUpdate((e) => {
      // eslint-disable-next-line react-hooks/immutability
      dragX.value = e.translationX;
    })
    .onEnd((e) => {
      // 56 px para os lados troca de faixa, como no protótipo.
      if (e.translationX < -56 && canNext) runOnJS(next)();
      else if (e.translationX > 56 && canPrevious) runOnJS(previous)();
      // eslint-disable-next-line react-hooks/immutability
      dragX.value = withSpring(0, { damping: 16, stiffness: 180 });
    });

  /*
    Com a letra aberta o título grande sai de cena, como no Music; com a fila aberta saem
    título e fita, que o espaço é da lista.

    Nenhum dos dois desmonta mais. A letra os esmaece por `Fade`, que guarda o lugar; a
    fila os recolhe por `Collapse`, que devolve o lugar à lista. Os dois casos eram `&&`
    de estado, e nos dois o bloco sumia de um quadro para o outro com o rodapé saltando
    atrás dele.
  */
  /** O que o card leva quando se compartilha do Now Playing. */
  const nowPlaying = () => ({
    title: track.title,
    subtitle: track.artist,
    detail: track.album,
    cover,
    art,
  });

  return (
    <ZoomScreen
      background={C.surface}
      dismissable
      /* Arrastar para baixo fecha, menos com a letra ou a fila abertas — ver
         `dismissBlocked`. Por shared value para a troca não reconstruir o gesto. */
      dragBlocked={dismissBlocked}
      onClosed={closePlayer}>
      <ChromeReveal />
      {/*
        O fundo é a própria capa, borrada — o mesmo `Backdrop` das telas de álbum e de
        lista. Eram dois radial-gradients tingidos com `art.a` e `art.b`, cores sorteadas
        pelo hash de "artista + álbum": quando o arquivo tem capa embutida, o fundo
        combinava com ela só por acaso. Fora do ZoomFade abaixo porque o Backdrop já traz
        o seu — dois aninhados multiplicariam a opacidade.
      */}
      <Backdrop cover={cover} color={art.a} height={screen} />
      <ZoomFade style={{ position: 'absolute', inset: 0 }}>
      <Glow color={art.a} playing={playing} />
      </ZoomFade>

      <View
        style={{
          flex: 1,
          paddingTop: insets.top + 16,
          // Só o recuo do sistema, mais um fio: o inset já reserva a barra de gestos, e o
      // que havia além dele era vão puro no pé da tela.
      paddingBottom: Math.max(insets.bottom, 18) + 4,
          paddingHorizontal: 24,
        }}>
        {/*
          barra superior

          O bloco do meio é absoluto, e não um `flex: 1` entre os dois lados: os lados têm
          larguras diferentes — 38 do botão de fechar contra ~64 das abas de arte e letra —
          e um filho centrado no espaço que sobra entre eles nasce fora do centro da tela.
          Era o que jogava o nome do álbum para a esquerda. O recuo simétrico de 72 é a
          largura do lado mais largo: mantém o centro no centro e impede a colisão.
        */}
        <ZoomFade style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <CloseButton />
          <ArtLyricsTabs on={lyricsOn} />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              alignItems: 'center',
              paddingHorizontal: 72,
            }}>
            <Mono size={9.5} weight={500} tracking={0.16} caps color={T.t4}>
              {t('player.playingFrom')}
            </Mono>
            <Body size={12.5} weight={600} numberOfLines={1} style={{ marginTop: 4 }}>
              {track.album}
            </Body>
          </View>
        </ZoomFade>

        {/* área da arte, com a letra na mesma caixa */}
        <Stage
          on={lyricsOn}
          lyrics={
            <ZoomFade style={{ flex: 1 }}>
              <LyricsPane track={track} lyrics={lyrics} onSeek={seekTo} />
            </ZoomFade>
          }>
        <GestureDetector gesture={swipe}>
          {/*
            `justifyContent: 'center'` sempre, e não um ternário de `showQueue`.

            O ternário trocava de valor no mesmo quadro em que a fila abria, e a capa
            saltava para o topo antes de começar a encolher. Com a fila aberta o
            `QueuePanel` é `flex: 1` e não sobra espaço livre nenhum para distribuir, então
            os dois valores fazem exatamente a mesma coisa ali — e o salto vai embora.
          */}
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Animated.View style={[{ alignItems: 'center', transformOrigin: 'top center' }, artShrink]}>
            {treatment === 'ember' && (
              <Animated.View style={[{ alignSelf: 'center' }, dragStyle]}>
                <ZoomFade
                  style={{
                    position: 'absolute',
                    top: -24,
                    left: -24,
                    right: -24,
                    bottom: -24,
                    borderRadius: 44,
                    opacity: 0.6,
                    experimental_backgroundImage: `radial-gradient(circle at 50% 50%, ${art.a} 0%, transparent 68%)`,
                  }}
                />
                <ZoomTarget radius={30}>
                  <AlbumArt art={art} size={artSize} radius={30} cover={cover} />
                </ZoomTarget>
              </Animated.View>
            )}

            {treatment === 'vinyl' && (
              <Animated.View style={[{ alignSelf: 'center', alignItems: 'center' }, slideOnly]}>
                {/* O vinil é redondo: o raio de destino é o do próprio disco. */}
                <ZoomTarget radius={artSize / 2}>
                  <Vinyl art={art} size={artSize} playing={playing} cover={cover} />
                </ZoomTarget>
                <ZoomFade style={{ marginTop: 26 }}>
                  <Mono size={9.5} weight={500} tracking={0.18} caps color={T.t34}>
                    {t(playing ? 'player.sideA' : 'player.needleUp')}
                  </Mono>
                </ZoomFade>
              </Animated.View>
            )}

            {treatment === 'wave' && (
              /*
                `alignSelf: 'stretch'` é o que faz este modo existir. O envoltório acima
                centraliza (é o que os outros dois querem), e centralizar encolhe o filho
                até o conteúdo: o bloco de texto `flex: 1` colapsava para largura zero — o
                título e o artista simplesmente não apareciam — e as 52 barras da onda
                viravam fios de 1 px.

                O `slideOnly` vem para cá, e não fica só na fileira da capa: o arraste
                move o modo inteiro, como nos outros dois.
              */
              <Animated.View style={[{ alignSelf: 'stretch' }, slideOnly]}>
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                  <ZoomTarget radius={20}>
                    <AlbumArt art={art} size={artSize} radius={20} detail="ring" cover={cover} />
                  </ZoomTarget>
                  <ZoomFade style={{ flex: 1, minWidth: 0 }}>
                    <Display size={34} weight={800} tracking={-0.045} numberOfLines={3}>
                      {track.title}
                    </Display>
                    <Body size={13.5} color="rgba(246,241,234,.58)" style={{ marginTop: 7 }}>
                      {track.artist}
                    </Body>
                  </ZoomFade>
                </View>
                <ZoomFade style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 30 }}>
                  <Mono size={10} weight={500} tracking={0.16} caps color={T.t62}>
                    {t('player.wholeTrack')}
                  </Mono>
                  <View
                    style={{
                      flex: 1,
                      height: 1,
                      experimental_backgroundImage: `linear-gradient(90deg, ${T.t12} 0%, transparent 100%)`,
                    }}
                  />
                </ZoomFade>
                <ZoomFade style={{ marginTop: 10 }}>
                  <Waveform
                    seed={track.id}
                    progress={progress}
                    accent={accent}
                    onSeek={(f) => seekTo(f * duration)}
                  />
                </ZoomFade>
              </Animated.View>
            )}
            </Animated.View>

            {/*
              Fileira secundária, logo abaixo da arte — e não no pé da tela.

              No rodapé ela virava a última coisa de uma pilha que já tinha tempo,
              transporte e fita: três pílulas empurradas para baixo, lendo como sobra.
              Aqui elas encostam no que descrevem, e o pé da tela fica só com o que é
              reprodução.

              Compartilhar não vai na fileira do transporte: ali são cinco alvos de toque
              já colados, e um sexto deixaria todos pequenos demais para a mão.

              Distribuída na largura, com o mesmo recuo do resto do conteúdo: centrada,
              ela lia como um aglomerado solto.

              Fora com a fila aberta, como o título grande e a fita: o espaço é da lista.

              "Fora" por `q`, e não por `{!showQueue && …}`: desmontar tirava as três
              pílulas da tela de um quadro para o outro, e o que vinha embaixo — a fila —
              subia no salto. Montada e esmaecida, ela sai junto com a capa e volta junto
              com ela. A margem negativa devolve os 34 px dela à lista, como na capa.
            */}
            <Animated.View style={queueless}>
              <ZoomFade
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 22,
                  alignSelf: 'center',
                  // Presa à largura do card, e centrada dentro dela: nas beiradas os três
                  // ícones liam como cantos de uma moldura, não como um grupo.
                  width: treatment === 'wave' ? '100%' : artSize,
                }}>
                {/*
                  Trocar de saída é do sistema nos dois lados, por caminhos opostos.

                  No Android abrimos o painel de saída por intent, já apontado para a nossa
                  reprodução — daí uma pílula nossa com o nosso ícone. No iOS não existe API
                  para apresentar o seletor: o único caminho é o `AVRoutePickerView`, um
                  botão da AVKit que tem de estar na tela. Ali o controle é o próprio botão
                  da Apple, com o glifo do AirPlay que o usuário já conhece.
                */}
                {canPickOutput && (
                  <Pill
                    onPress={() => {
                      void pickAudioOutput();
                    }}>
                    <Output size={16} color={T.t72} />
                  </Pill>
                )}
                {canShowRoutePicker && <RouteBox />}
                {canShareToStories && (
                  <Pill onPress={() => share(nowPlaying(), 'stories')}>
                    <Instagram size={16} color={T.t72} />
                  </Pill>
                )}
                <Pill onPress={() => share(nowPlaying(), 'sheet')}>
                  <ShareIcon size={15} color={T.t72} />
                </Pill>
              </ZoomFade>
            </Animated.View>

            {showQueue && (
              <Animated.View
                entering={FadeInDown.duration(280)}
                /*
                  Sai pelo caminho por onde entrou.
                  Era um `FadeOut` seco de 140 ms: a lista sumia no lugar enquanto a capa
                  crescia por cima dela. Descendo, ela devolve o espaço à capa em vez de
                  disputá-lo — e 200 ms para casar com os 320 do encolher da capa.
                */
                exiting={FadeOutDown.duration(200)}
                style={{ flex: 1, marginTop: 12 }}>
                <QueuePanel />
              </Animated.View>
            )}
          </View>
        </GestureDetector>
        </Stage>

        {/* rodapé */}
        <ZoomFade style={{ marginTop: 14 }}>
          {/*
            Título grande e fita saem com a fila aberta — o espaço é da lista. Mas saem
            **recolhendo**, e não desmontando: era o `{bigTitle && …}` e o `{ribbon && …}`
            que faziam os dois desaparecerem de um quadro para o outro, e o rodapé inteiro
            saltar para baixo junto. O `Collapse` mede a altura de verdade e devolve
            exatamente ela à lista.

            O `treatment !== 'wave'` fica como `&&` porque não é estado: no modo onda o
            título vive ao lado da capa e este bloco nunca existiu.
          */}
          {treatment !== 'wave' && (
            <Collapse on={q} gap={20} style={{ alignItems: 'center' }}>
              <Fade on={lyricsOn} style={{ alignItems: 'center' }}>
                <Display size={26} tracking={-0.035} align="center" numberOfLines={2}>
                  {track.title}
                </Display>
                <Body size={14} color={T.t62} style={{ marginTop: 5 }}>
                  {track.artist}
                </Body>
              </Fade>
            </Collapse>
          )}

          {/*
            A fita vale nos três tratamentos, inclusive no da onda.

            Antes ela era escondida ali — quem buscava era a própria forma de onda — e
            voltava quando a letra abria, que é quando a onda sai de cena. Manter o
            lugar dela custava 40 px vazios embaixo do transporte, e recolher a altura
            de verdade re-mede a caixa da letra a cada quadro da transição, que é a
            travada que o `Fade` existe para não ter. Com a fita sempre lá, nada no
            rodapé se move ao trocar de aba: no modo onda ela e a onda dizem a mesma coisa
            em dois tamanhos, o que é barato demais para valer um vão morto.

            Com a **fila**, não: ali a fita recolhe, porque a lista quer os 44 px dela.
          */}
          <Collapse on={q}>
            <Ribbon
              seed={track.id}
              progress={progress}
              accent={accent}
              onSeek={(delta) => seekTo(elapsed.value + delta * duration)}
            />
          </Collapse>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              marginTop: 16,
            }}>
            <Elapsed />
            {/*
              O ponto e o rótulo dizem o estado da reprodução — e, quando não há
              reprodução possível, dizem isso.

              `uri` vazia é faixa remota sem servidor que a resolva (ver `cue` em
              `lib/player.tsx`). Sem esta linha, um toque nela não fazia nada e não
              explicava nada: o transporte ficava parado sem motivo visível.
            */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 2.5,
                  backgroundColor: track.uri ? accent : C.danger,
                }}
              />
              <Mono
                size={10}
                weight={500}
                tracking={0.14}
                caps
                color={track.uri ? T.t62 : C.danger}>
                {!track.uri
                  ? t('streaming.unavailable')
                  : playing
                    ? track.file.split('.').pop()
                    : t('player.paused')}
              </Mono>
            </View>
            <Remaining duration={duration} />
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 16,
            }}>
            {/*
              O `Beat` pulsa quando `liked` muda, e não quando o dedo desce: curtir passa
              pelo `PrefsProvider` e volta como prop, então o pulso no toque mentiria sobre
              quando a curtida entrou. O `Press` cobre o toque; o `Beat`, o resultado.
            */}
            <Press onPress={() => toggleLike(track.id)} hitSlop={8} style={round(44)}>
              <Beat on={liked}>
                <Heart size={20} color={accent} filled={liked} />
              </Beat>
            </Press>
            {/* O empurrão de 3 px vai no sentido da viagem: para trás em "anterior". */}
            <Press
              onPress={previous}
              disabled={!canPrevious}
              hitSlop={8}
              nudge={-3}
              style={round(52)}>
              <Previous />
            </Press>
            <PlayButton playing={playing} accent={accent} onPress={toggle} />
            <Press onPress={next} disabled={!canNext} hitSlop={8} nudge={3} style={round(52)}>
              <Next />
            </Press>
            {/* No protótipo este slot abria a tela de bloqueio, que é do sistema; aqui
                ele abre a fila. */}
            <Press onPress={() => setShowQueue((on) => !on)} hitSlop={8} style={round(44)}>
              <Beat on={showQueue} amount={0.18}>
                <Queue size={20} color={showQueue ? accent : T.t72} />
              </Beat>
            </Press>
          </View>

        </ZoomFade>
      </View>
      {shareCardView}
    </ZoomScreen>
  );
}

/**
 * Apaga a barra inferior enquanto o player está aberto, e a devolve no ritmo em que ele
 * fecha.
 *
 * A barra fica **montada** embaixo: é o que faz a pílula já estar no lugar quando a capa
 * pousa nela, e o que mantém a capa de origem escondida durante o voo. Ver `chromeReveal`.
 *
 * Componente à parte, e não um efeito no PlayerScreen: `useZoomProgress` lê o contexto
 * que o próprio `ZoomScreen` provê, então do componente que o *renderiza* ele volta nulo.
 * Aqui dentro ele é o progresso de verdade.
 */
function ChromeReveal() {
  const zoom = useZoomProgress();

  useAnimatedReaction(
    () => 1 - (zoom?.value ?? 1),
    (reveal) => {
      chromeReveal.value = reveal;
    },
    [zoom]
  );

  // Sair por qualquer outro caminho não pode deixar a barra apagada para sempre.
  useEffect(
    () => () => {
      chromeReveal.value = 1;
    },
    []
  );

  return null;
}

/** Pílula das ações secundárias do player. */
function Pill({
  onPress,
  label,
  children,
}: {
  onPress: () => void;
  /** Sem rótulo a pílula fica redonda, só com o ícone. */
  label?: string;
  children: React.ReactNode;
}) {
  // A opacidade que o `ZoomFade` em volta está aplicando: o vidro precisa dela para não
  // ser pedido enquanto a tela ainda está em zero. Ver `useZoomFade` em `lib/zoom.tsx`.
  const fade = useZoomFade();

  return (
    <Press
      onPress={onPress}
      // Pílula pequena: afunda mais que um botão grande para o gesto aparecer.
      sink={0.09}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: label ? 8 : 0,
        paddingHorizontal: label ? 14 : 0,
        width: label ? undefined : 34,
        height: 34,
        borderRadius: 17,
      }}>
      {/*
        Vidro interativo no iOS, superfície Material no Android, e a nossa pílula quando a
        interface nativa está desligada — ver `components/panel.tsx`. É o controle mais
        repetido do Now Playing, então é aqui que a troca de material mais se vê.
      */}
      <Panel
        interactive
        fade={fade}
        style={{ borderRadius: 17 }}
        fallback={{ background: T.t06, border: T.t12 }}
      />
      {children}
      {label ? (
        <Body size={12} weight={600} color={T.t72}>
          {label}
        </Body>
      ) : null}
    </Press>
  );
}

/**
 * O seletor de saída de áudio da Apple, na mesma pílula das outras ações.
 *
 * Componente próprio, e não uma `View` no meio da fileira, porque o fundo dele precisa do
 * `useZoomFade` — e esse hook lê o contexto que o `ZoomScreen` provê, que do componente
 * que *renderiza* o ZoomScreen volta nulo. Renderizado daqui, ele está dentro.
 */
function RouteBox() {
  const fade = useZoomFade();

  return (
    <View
      style={{
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Panel
        interactive
        fade={fade}
        style={{ borderRadius: 17 }}
        fallback={{ background: T.t06, border: T.t12 }}
      />
      <RoutePicker size={26} tint={T.full} />
    </View>
  );
}

/** Encolhe o Now Playing de volta para o mini player. */
function CloseButton() {
  const close = useZoomClose();
  const fade = useZoomFade();
  return (
    <Press
      onPress={close}
      hitSlop={8}
      sink={0.09}
      style={{
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Panel interactive fade={fade} style={{ borderRadius: 19 }} fallback={{ background: T.t08 }} />
      <ChevronDown />
    </Press>
  );
}


/** Altura da capa quando a fila está aberta. */
const ART_MINI = 92;

/**
 * O segundo decorrido, e só ele.
 *
 * Uma folha de propósito, e alimentada pelo shared value. A posição chega várias vezes
 * por segundo; ler isso em estado do React re-renderizaria os dois contadores a cada
 * leitura — trabalho na thread de JS para redesenhar um texto que muda uma vez por
 * segundo. A reação corre na thread de UI e só acorda o React quando o segundo vira.
 */
function useSecond(): number {
  const { elapsed } = usePlayer();
  const [second, setSecond] = useState(0);
  useAnimatedReaction(
    () => Math.floor(elapsed.value),
    (now, before) => {
      if (now !== before) runOnJS(setSecond)(now);
    },
    []
  );
  return second;
}

function Elapsed() {
  const second = useSecond();
  return (
    <Mono size={13} weight={500} color={T.full} style={{ minWidth: 48 }}>
      {fmt(second)}
    </Mono>
  );
}

function Remaining({ duration }: { duration: number }) {
  const second = useSecond();
  return (
    <Mono size={13} weight={500} color={T.t5} align="right" style={{ minWidth: 48 }}>
      {duration > 0 ? `-${fmt(duration - second)}` : '--:--'}
    </Mono>
  );
}

/**
 * Ângulos do tilt, em shared values. Sem sensor — web, emulador sem acelerômetro — fica
 * em zero e nada se move.
 *
 * O sensor é o do próprio Reanimated: leitura e filtro rodam na thread de UI, e o
 * JavaScript não é acordado uma vez sequer. A versão anterior assinava o `expo-sensors`
 * e escrevia os shared values de um callback em JS a cada 80 ms — trabalho na thread
 * errada, e bem no meio da transição de entrada do Now Playing.
 *
 * O `withTiming` entre leituras é o que separa o efeito do serrilhado: a 80 ms o sinal
 * chega em degraus, e a animação preenche o intervalo.
 */
function useTilt() {
  const gravity = useAnimatedSensor(SensorType.GRAVITY, { interval: TILT_INTERVAL });
  const state = useSharedValue(TILT_REST);
  const rx = useSharedValue(0);
  const ry = useSharedValue(0);

  // useAnimatedReaction, e não useDerivedValue: o passo lê e escreve o mesmo estado, e um
  // derived value que depende do que ele próprio escreve se realimenta.
  useAnimatedReaction(
    () => gravity.sensor.value,
    (reading) => {
      state.value = tiltStep(state.value, reading.x, reading.y);
      const angle = tiltAngles(state.value);
      const ease = { duration: TILT_INTERVAL * 1.6 };
      rx.value = withTiming(angle.rx, ease);
      ry.value = withTiming(angle.ry, ease);
    }
  );

  return { rx, ry };
}

/**
 * A fila dentro do próprio Now Playing: modos em ícones no topo e o que vem a seguir
 * abaixo. Era uma tela à parte, mas sair do player para ver a fila do player não fazia
 * sentido — e o seletor em cartões grandes comia o espaço da própria lista.
 */
function QueuePanel() {
  const { track, queue, index, play, removeAt, reorder, toggleShuffle, sleep, setSleep } =
    usePlayer();
  const { library } = useLibrary();
  const { accent, shuffle, repeat, setRepeat, continuation, setContinuation } = usePrefs();
  const t = useT();

  // As opções do temporizador aparecem sob demanda: cinco tempos sempre à vista roubariam
  // do que a fila tem a mostrar, e armar um sleep timer é raro.
  const [pickingSleep, setPickingSleep] = useState(false);

  const upcoming = queue.slice(index + 1);

  // Quem está na mão e para qual posição ele aponta. Compartilhados para que cada linha
  // saiba se precisa abrir espaço.
  const activeAt = useSharedValue(-1);
  const targetAt = useSharedValue(-1);

  const cycleRepeat = () =>
    setRepeat(repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off');

  const current = CONTINUATIONS.find((c) => c.key === continuation);

  /**
   * Prévia do que a continuação vai anexar. Sem isto, escolher "seguir pelo álbum" não
   * mudava nada na tela — a continuação só era calculada quando a faixa acabava, e a
   * fila parecia ignorar a escolha.
   */
  const preview = useMemo(
    () =>
      track
        ? continuationFor(
            continuation,
            track,
            library?.tracks ?? [],
            new Set(queue.map((t) => t.id))
          ).slice(0, 12)
        : [],
    [continuation, track, library, queue]
  );

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: T.t07,
        }}>
        <Mode on={shuffle} accent={accent} onPress={toggleShuffle}>
          <Shuffle size={18} color={shuffle ? accent : T.t5} />
        </Mode>
        <Mode on={repeat !== 'off'} accent={accent} onPress={cycleRepeat}>
          <Repeat
            size={18}
            one={repeat === 'one'}
            color={repeat === 'off' ? T.t5 : accent}
          />
        </Mode>
        <Mode
          on={sleep.kind !== 'off'}
          accent={accent}
          onPress={() => setPickingSleep((open) => !open)}>
          <Moon size={18} color={sleep.kind === 'off' ? T.t5 : accent} />
        </Mode>

        <View style={{ flex: 1 }} />

        {/* O que está armado, em texto: um ícone aceso não diz quanto falta. */}
        {sleep.kind !== 'off' && <SleepStatus sleep={sleep} accent={accent} />}
      </View>

      {pickingSleep && (
        <SleepPicker
          sleep={sleep}
          accent={accent}
          onChoose={(choice) => {
            setSleep(choice);
            setPickingSleep(false);
          }}
        />
      )}

      {/* Abas do modo de continuação: as quatro opções à vista, sem ciclar às cegas. */}
      <ContinuationTabs accent={accent} value={continuation} onPick={setContinuation} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
        {upcoming.map((item, at) => (
          <QueueRow
            key={item.id}
            track={item}
            at={at}
            count={upcoming.length}
            activeAt={activeAt}
            targetAt={targetAt}
            onPress={() => play(queue, index + 1 + at)}
            onRemove={() => removeAt(index + 1 + at)}
            onMove={(from, to) => reorder(index + 1 + from, index + 1 + to)}
          />
        ))}

        {upcoming.length === 0 && (
          <Body size={12.5} color={T.t42} style={{ paddingVertical: 12 }}>
            {t('player.queueEmpty')}
          </Body>
        )}

        {/*
          A seção da continuação aparece sempre, com ou sem candidato: era ela que
          respondia às abas, e escondê-la quando o modo não achava nada fazia o toque
          parecer não ter efeito nenhum sobre a lista.
        */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 }}>
          <Mono size={9.5} weight={500} tracking={0.16} caps color={T.t4}>
            {t('player.after')} · {current ? t(current.blurb) : ''}
          </Mono>
          <View
            style={{
              flex: 1,
              height: 1,
              experimental_backgroundImage: `linear-gradient(90deg, ${T.t14} 0%, transparent 100%)`,
            }}
          />
        </View>
        {preview.map((item) => (
          <View
            key={item.id}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, opacity: 0.6 }}>
            <View style={{ width: 20, alignItems: 'center' }}>
              <View
                style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: accent }}
              />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Body size={13.5} weight={500} tracking={-0.01} numberOfLines={1}>
                {item.title}
              </Body>
              <Body size={11} color={T.t42} numberOfLines={1}>
                {item.artist}
              </Body>
            </View>
          </View>
        ))}
        {preview.length === 0 && (
          <Body size={12.5} color={T.t42} style={{ paddingVertical: 10 }}>
            {t(continuation === 'off' ? 'player.queueEnds' : 'player.noMatch')}
          </Body>
        )}
      </ScrollView>
    </View>
  );
}

/**
 * As abas do modo de continuação, com o realce deslizando entre elas.
 *
 * O realce era um `backgroundColor` no botão escolhido: trocava de aba num quadro, sem
 * nada ligando a de onde saiu à que recebeu o toque — quatro opções acendendo e apagando
 * em seco. Agora é uma peça só que viaja, como a pílula das abas de arte e letra no topo
 * da tela, e a cor do texto atravessa junto com ela.
 *
 * A largura vem do `onLayout` porque a fileira é `flex: 1` em quatro: o passo do realce é
 * um quarto do que a tela deu à caixa, e isso não é um número que se possa cravar. Até a
 * primeira medida o realce fica em largura zero — invisível, em vez de um retângulo no
 * lugar errado por um quadro.
 */
function ContinuationTabs({
  accent,
  value,
  onPick,
}: {
  accent: string;
  value: Continuation;
  onPick: (key: Continuation) => void;
}) {
  const t = useT();
  const fade = useZoomFade();
  const [width, setWidth] = useState(0);

  const at = Math.max(0, CONTINUATIONS.findIndex((option) => option.key === value));

  /** Posição do realce, em índice de aba. Anima; o índice em si é estado. */
  const slide = useSharedValue(at);
  useEffect(() => {
    slide.value = withTiming(at, PANE);
  }, [at, slide]);

  const step = width / CONTINUATIONS.length;
  const highlight = useAnimatedStyle(() => ({
    width: step,
    transform: [{ translateX: slide.value * step }],
  }));

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{
        flexDirection: 'row',
        borderRadius: R.r13,
        padding: 3,
        marginTop: 10,
      }}>
      {/* O fundo da fileira. Não é interativo: quem responde ao toque são as abas, e o
          realce que corre atrás delas já é o retorno do gesto. */}
      <Panel fade={fade} style={{ borderRadius: R.r13 }} fallback={{ background: C.card }} />
      {/*
        O realce mora **atrás** das abas, num absoluto que respeita o `padding: 3` da
        caixa. Como irmão anterior ele pintaria embaixo dos rótulos, que é o que se quer;
        como filho de uma das abas viajaria junto com ela.
      */}
      {width > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: 3,
              top: 3,
              bottom: 3,
              borderRadius: 10,
              backgroundColor: alpha(accent, 0.18),
            },
            highlight,
          ]}
        />
      )}
      {CONTINUATIONS.map((option) => (
        <Tab
          key={option.key}
          label={t(option.short)}
          index={CONTINUATIONS.indexOf(option)}
          slide={slide}
          onPress={() => onPick(option.key)}
        />
      ))}
    </View>
  );
}

/**
 * Uma aba da fileira de continuação.
 *
 * A cor do rótulo sai da distância até o realce, e não de um booleano: assim ela acende no
 * ritmo em que a peça chega, em vez de trocar de valor no quadro do toque. Interpolar a
 * opacidade da View dispensa animar a cor do texto, que exigiria `animatedProps`.
 */
function Tab({
  label,
  index,
  slide,
  onPress,
}: {
  label: string;
  index: number;
  slide: SharedValue<number>;
  onPress: () => void;
}) {
  const lit = useAnimatedStyle(() => ({
    // 1 quando o realce está em cima, 0.42 a uma aba de distância ou mais.
    opacity: 0.42 + 0.58 * Math.max(0, 1 - Math.abs(slide.value - index)),
  }));

  return (
    <Press
      onPress={onPress}
      sink={0.04}
      style={{
        flex: 1,
        height: 30,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Animated.View style={lit}>
        <Body size={11.5} weight={600}>
          {label}
        </Body>
      </Animated.View>
    </Press>
  );
}

/**
 * Quanto falta para a pausa, em texto.
 *
 * Um relógio próprio de um segundo, e só enquanto está montado: o tempo do temporizador
 * não é o tempo da reprodução, e pendurá-lo no status do player faria a conta andar aos
 * saltos de 200 ms — ou parar junto com o áudio pausado, que é quando ele mais importa.
 */
function SleepStatus({ sleep, accent }: { sleep: Sleep; accent: string }) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (sleep.kind !== 'clock') return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [sleep]);

  if (sleep.kind === 'track') {
    return (
      <Body size={11.5} weight={500} color={accent}>
        {t('sleep.atEnd')}
      </Body>
    );
  }

  const left = leftOf(sleep, now) ?? 0;
  return (
    <Body size={11.5} weight={500} color={accent}>
      {left >= 60
        ? t('sleep.left', { min: Math.ceil(left / 60) })
        : t('sleep.leftSeconds', { s: left })}
    </Body>
  );
}

/** Os tempos oferecidos, mais "fim da faixa" e o desligar. */
function SleepPicker({
  sleep,
  accent,
  onChoose,
}: {
  sleep: Sleep;
  accent: string;
  onChoose: (choice: number | 'track' | null) => void;
}) {
  const t = useT();
  const fade = useZoomFade();

  const options: { key: string; label: string; on: boolean; choice: number | 'track' | null }[] = [
    { key: 'off', label: t('sleep.off'), on: sleep.kind === 'off', choice: null },
    ...SLEEP_MINUTES.map((n) => ({
      key: `${n}`,
      label: t('sleep.min', { n }),
      on: sleep.kind === 'clock' && sleep.minutes === n,
      choice: n as number | 'track' | null,
    })),
    { key: 'track', label: t('sleep.track'), on: sleep.kind === 'track', choice: 'track' as const },
  ];

  return (
    <View style={{ marginTop: 10 }}>
      <Mono size={9.5} weight={500} tracking={0.14} caps color={T.t42}>
        {t('sleep.label')}
      </Mono>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 7, paddingVertical: 8 }}>
        {options.map((option) => (
          <Press
            key={option.key}
            onPress={() => onChoose(option.choice)}
            sink={0.07}
            style={{
              height: 32,
              paddingHorizontal: 14,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: option.on ? alpha(accent, 0.18) : undefined,
              borderWidth: 1,
              borderColor: option.on ? alpha(accent, 0.5) : 'transparent',
            }}>
            {/*
              O material só entra na opção **não** escolhida: a escolhida é o acento, que é
              o que responde "este é o tempo que vai valer". Vidro em cima do acento
              apagaria justamente essa resposta.
            */}
            {!option.on && (
              <Panel
                interactive
                fade={fade}
                style={{ borderRadius: 16 }}
                fallback={{ background: C.card }}
              />
            )}
            <Body size={12.5} weight={600} color={option.on ? T.full : T.t62}>
              {option.label}
            </Body>
          </Press>
        ))}
      </ScrollView>
    </View>
  );
}

function Mode({
  on,
  accent,
  onPress,
  children,
}: {
  on: boolean;
  accent: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Press
      onPress={onPress}
      hitSlop={8}
      sink={0.09}
      style={{
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: on ? alpha(accent, 0.16) : 'transparent',
      }}>
      {/* Aleatório, repetir e temporizador acendem: o pulso confirma a troca de modo. */}
      <Beat on={on} amount={0.2}>
        {children}
      </Beat>
    </Press>
  );
}

const round = (size: number) => ({
  width: size,
  height: size,
  borderRadius: size / 2,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
});

/**
 * O botão de tocar e pausar.
 *
 * Três coisas se movem, e nenhuma delas custa layout: o anel que pulsa enquanto toca, o
 * afundar do toque (`Press`) e a troca entre os dois glifos.
 */
function PlayButton({
  playing,
  accent,
  onPress,
}: {
  playing: boolean;
  accent: string;
  onPress: () => void;
}) {
  const ring = useSharedValue(0);
  useEffect(() => {
    if (playing) {
      ring.value = withRepeat(
        withTiming(1, { duration: 2200, reduceMotion: ReduceMotion.System }),
        -1,
        false
      );
    } else {
      // Atribuir uma animação nova cancela o `withRepeat` — não é preciso `cancelAnimation`.
      ring.value = withTiming(0, { duration: 200, reduceMotion: ReduceMotion.System });
    }
  }, [playing, ring]);
  const ringStyle = useAnimatedStyle(() => ({
    opacity: (1 - ring.value) * 0.55,
    transform: [{ scale: 0.85 + ring.value * 1.05 }],
  }));

  /**
   * A troca de glifo, em vez de um `?:` que troca num quadro.
   *
   * Os dois ficam montados, um sobre o outro, e o que muda é opacidade e escala — o mesmo
   * desenho do `Stage`, e pelo mesmo motivo: montar e desmontar um SVG a cada pausa é
   * trabalho de React para uma troca que a thread de UI faz sozinha.
   *
   * `position: 'absolute'` nos dois, com o botão centralizando: empilhados no fluxo, o
   * play empurraria o pause e o par nasceria fora do centro.
   */
  const on = useSharedValue(playing ? 1 : 0);
  useEffect(() => {
    on.value = withTiming(playing ? 1 : 0, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.System,
    });
  }, [playing, on]);

  const pauseGlyph = useAnimatedStyle(() => ({
    opacity: on.value,
    transform: [{ scale: 0.7 + on.value * 0.3 }],
  }));
  const playGlyph = useAnimatedStyle(() => ({
    opacity: 1 - on.value,
    transform: [{ scale: 1 - on.value * 0.3 }],
  }));

  return (
    <Press
      onPress={onPress}
      // Afunda um pouco menos que os outros: é o maior alvo da fileira, e a mesma fração
      // num círculo de 76 dá um deslocamento que lê como salto.
      sink={0.045}
      style={{
        width: 76,
        height: 76,
        borderRadius: 38,
        backgroundColor: accent,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', inset: 0, borderRadius: 38, borderWidth: 2, borderColor: accent },
          ringStyle,
        ]}
      />
      <Animated.View style={[{ position: 'absolute' }, pauseGlyph]}>
        <Pause size={24} color={C.onAccent} />
      </Animated.View>
      <Animated.View style={[{ position: 'absolute' }, playGlyph]}>
        <Play size={22} color={C.onAccent} />
      </Animated.View>
    </Press>
  );
}

/** As abas arte/letras da barra superior. */
function ArtLyricsTabs({ on }: { on: SharedValue<number> }) {
  const fade = useZoomFade();
  /** A pílula viaja a largura de uma aba mais o vão entre as duas. */
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: on.value * 36 }] }));
  /*
    Os dois ícones são o mesmo branco em opacidades diferentes — `T.t46` é `T.full` a 46%.
    Interpolar a opacidade da View que os envolve dispensa levar a cor até dentro do SVG
    por `animatedProps`, e é o que faz o realce atravessar junto com a pílula em vez de
    trocar de valor num quadro.
  */
  const art = useAnimatedStyle(() => ({ opacity: 1 - on.value * 0.54 }));
  const text = useAnimatedStyle(() => ({ opacity: 0.46 + on.value * 0.54 }));

  const go = (to: number) => () => {
    on.value = withTiming(to, PANE);
  };

  const tab = {
    width: 34,
    height: 28,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 2,
        padding: 3,
        borderRadius: R.r17,
      }}>
      <Panel fade={fade} style={{ borderRadius: R.r17 }} fallback={{ background: T.t08 }} />
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 3,
            top: 3,
            width: 34,
            height: 28,
            borderRadius: 14,
            backgroundColor: T.t14,
          },
          pill,
        ]}
      />
      {/*
        `lyricsOn` continua em `withTiming`, e não em mola: ele é o mesmo valor que dirige
        as opacidades do `Stage` e do `Fade`, e uma mola passa do alvo — opacidade acima de
        1 e escala abaixo de 0,97 no repique. A pílula ganharia o repique junto com um
        piscar nos dois painéis. O que responde ao dedo aqui é o afundar do `Press`.
      */}
      <Press onPress={go(0)} style={tab} sink={0.1}>
        <Animated.View style={art}>
          <Disc color={T.full} />
        </Animated.View>
      </Press>
      <Press onPress={go(1)} style={tab} sink={0.1}>
        <Animated.View style={text}>
          <LyricsIcon color={T.full} />
        </Animated.View>
      </Press>
    </View>
  );
}

/**
 * A caixa onde a capa e a letra convivem.
 *
 * Os dois painéis ficam montados, um sobre o outro, e a troca é opacidade com um fio de
 * escala. Desmontar era o problema inteiro: a capa recarregava a imagem, o vinil voltava
 * a zero e a letra remontava linha por linha a cada toque na aba.
 *
 * A capa entra por `children` e a letra por prop — elementos já criados pelo
 * PlayerScreen. Assim o `useState` daqui não desce até eles: o React reencontra o mesmo
 * elemento e para ali.
 */
function Stage({
  on,
  lyrics,
  children,
}: {
  on: SharedValue<number>;
  lyrics: ReactNode;
  children: ReactNode;
}) {
  const zoom = useZoomProgress();
  /** Quem recebe o toque. É o único motivo de ainda haver estado aqui. */
  const [shown, setShown] = useState(false);
  /**
   * A letra só monta depois que o player pousa.
   *
   * Montá-la junto com a tela punha dezenas de nós no mesmo quadro do voo de abertura —
   * a letra que já está em cache chega sem esperar o disco. Depois disso ela fica: é o
   * que faz a troca de aba não custar nada.
   */
  const [ready, setReady] = useState(false);

  useAnimatedReaction(
    // `on.value > 0` também monta: tocar na aba antes de o voo terminar não pode deixar a
    // capa esmaecer para uma caixa vazia.
    () => ({ mount: (zoom?.value ?? 1) >= 1 || on.value > 0, lyrics: on.value > 0.5 }),
    (now, prev) => {
      if (now.lyrics !== prev?.lyrics) runOnJS(setShown)(now.lyrics);
      if (now.mount && !prev?.mount) runOnJS(setReady)(true);
    },
    [zoom]
  );

  const art = useAnimatedStyle(() => ({
    opacity: 1 - on.value,
    transform: [{ scale: 1 - on.value * 0.03 }],
  }));
  const text = useAnimatedStyle(() => ({
    opacity: on.value,
    transform: [{ scale: 0.97 + on.value * 0.03 }],
  }));

  return (
    <View style={{ flex: 1 }}>
      <Animated.View
        pointerEvents={shown ? 'none' : 'auto'}
        style={[{ position: 'absolute', inset: 0 }, art]}>
        {children}
      </Animated.View>
      {ready && (
        <Animated.View
          pointerEvents={shown ? 'auto' : 'none'}
          style={[{ position: 'absolute', inset: 0 }, text]}>
          {lyrics}
        </Animated.View>
      )}
    </View>
  );
}

/**
 * Esmaece o filho quando `on` sobe, **mantendo o lugar dele**.
 *
 * Antes era um `&&` de `showLyrics`: o bloco saía da árvore e o rodapé saltava de um
 * quadro para o outro. Recolher a altura de verdade seria a outra saída óbvia, e é pior:
 * cada quadro da animação re-mede a caixa da letra, o `onLayout` do ScrollView dela vira
 * estado, e a letra inteira re-renderiza dezenas de vezes no meio da transição — de novo
 * a travada que se quer tirar.
 *
 * Com o lugar mantido, nada no rodapé se move ao trocar de aba: fica a mudança pequena
 * que a troca deveria ser, e a caixa da letra tem a mesma altura nos dois estados.
 *
 * `on` ausente quer dizer "nunca esmaece".
 */
function Fade({
  on,
  style,
  children,
}: {
  on?: SharedValue<number>;
  style?: ViewStyle;
  children: ReactNode;
}) {
  const dim = useAnimatedStyle(() => ({ opacity: on ? 1 - on.value : 1 }));
  // Esmaecido não pode seguir recebendo toque: a fita do modo onda ficaria sob o dedo.
  const [gone, setGone] = useState(false);
  useAnimatedReaction(
    () => (on?.value ?? 0) > 0.5,
    (off, prev) => {
      if (off !== prev) runOnJS(setGone)(off);
    },
    [on]
  );

  return (
    <Animated.View pointerEvents={gone ? 'none' : 'auto'} style={[style, dim]}>
      {children}
    </Animated.View>
  );
}

/**
 * Esmaece o filho quando `on` sobe **e devolve a altura dele** a quem vem depois.
 *
 * O irmão do `Fade`, para o caso oposto: o `Fade` guarda o lugar (é o que a troca de aba
 * quer, para o rodapé não se mover), este devolve o lugar (é o que a fila quer, porque a
 * lista precisa do espaço).
 *
 * A altura vem do `onLayout`, e não de uma constante: o título grande tem uma ou duas
 * linhas conforme o nome da faixa, e um número cravado erraria por uma linha inteira
 * justamente nas faixas de nome longo. Ela é lida uma vez, quando o bloco mede — e segue
 * estável depois, porque quem recolhe é a margem negativa, não a altura do bloco.
 *
 * A margem é a única propriedade de layout aqui, e ela anima uma vez por abertura da fila.
 * O que se vê — opacidade e escala — está no caminho rápido.
 */
function Collapse({
  on,
  gap = 0,
  style,
  children,
}: {
  on: SharedValue<number>;
  /**
   * O vão embaixo do bloco quando ele está aberto.
   *
   * Entra por prop, e não como `marginBottom` no `style`: a margem é justamente o que
   * anima, e um valor no `style` seria sobrescrito pelo estilo animado — o bloco perderia
   * o vão dele já em repouso. Recolhido, o vão vai embora junto com o bloco.
   */
  gap?: number;
  style?: ViewStyle;
  children: ReactNode;
}) {
  const height = useSharedValue(0);

  const shut = useAnimatedStyle(() => ({
    opacity: 1 - on.value,
    transform: [{ scale: 1 - on.value * 0.04 }],
    // Vai de `gap` a `-height`: a própria altura do bloco continua sendo `height`, então
    // uma margem de `-height` faz a soma dos dois dar zero.
    marginBottom: gap - on.value * (height.value + gap),
    // Recolhido não pode seguir recebendo toque: a fita ficaria sob o dedo, debaixo da fila.
    pointerEvents: on.value > 0.5 ? 'none' : 'auto',
  }));

  return (
    <Animated.View
      onLayout={(e) => {
        height.value = e.nativeEvent.layout.height;
      }}
      style={[style, shut]}>
      {children}
    </Animated.View>
  );
}

/**
 * Busca a letra da faixa quando a aba abre. O texto não fica no índice da biblioteca
 * (ver docs/03-decisoes.md, D11), então é lido do arquivo aqui.
 */
/**
 * O painel de letras.
 *
 * A letra vem de fora, por `useLyrics` — o Now Playing a pede desde que monta, então na
 * hora de abrir o painel ela quase sempre já está pronta. Antes a leitura começava aqui,
 * e o painel ficava em branco esperando o disco.
 */
function LyricsPane({
  track,
  lyrics,
  onSeek,
}: {
  track: Track;
  lyrics: Lyrics | null;
  onSeek: (seconds: number) => void;
}) {
  const { markLyrics } = useLibrary();

  const pick = async () => {
    if (!(await importLrc(track))) return;
    // O que estava guardado é de antes do arquivo novo.
    forgetLyrics(track.id);
    markLyrics(track.id);
  };

  if (!lyrics) return <View style={{ flex: 1 }} />;
  if (!lyrics.lines.length) return <NoLyrics onPick={pick} />;
  return (
    <View style={{ flex: 1 }}>
      {/* A key remonta ao trocar de faixa: zera o scroll sem um setState em efeito. */}
      <LyricsView key={track.id} lyrics={lyrics} onSeek={onSeek} />
    </View>
  );
}

function Glow({ color, playing }: { color: string; playing: boolean }) {
  const pulse = useSharedValue(0.35);
  useEffect(() => {
    if (playing) {
      pulse.value = withRepeat(
        withTiming(0.8, { duration: 4000, reduceMotion: ReduceMotion.System }),
        -1,
        true
      );
    } else {
      pulse.value = withTiming(0.35, { duration: 400, reduceMotion: ReduceMotion.System });
    }
  }, [playing, pulse]);
  const style = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ scale: 0.92 + pulse.value * 0.2 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: -80,
          alignSelf: 'center',
          width: 400,
          height: 400,
          borderRadius: 200,
          experimental_backgroundImage: `radial-gradient(circle at 50% 50%, ${color} 0%, transparent 65%)`,
        },
        style,
      ]}
    />
  );
}
