import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeInDown,
  FadeOut,
  LinearTransition,
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
import { Ribbon, Vinyl, Waveform } from '@/components/player-visuals';
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
import { CONTINUATIONS, continuationFor } from '@/lib/queue';
import { importLrc } from '@/lib/scan';
import { useLibrary } from '@/lib/library';
import { ZoomFade, ZoomScreen, ZoomTarget, useZoomClose, useZoomProgress } from '@/lib/zoom';

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

  /**
   * O tamanho da capa muda de verdade; nada de `scale`.
   *
   * Escalar exigia acertar o `transformOrigin`, e qualquer valor não reconhecido cai em
   * silêncio no centro — foi o que manteve a capa fora de lugar nas tentativas
   * anteriores. Com o tamanho real, a capa é o que o layout diz que ela é, e
   * `LinearTransition` anima a caixa entre os dois estados.
   */
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
  const artSize = showQueue
    ? ART_MINI
    : treatment === 'vinyl'
      ? Math.max(180, Math.min(310, artRoom))
      : treatment === 'wave'
        ? 96
        : Math.max(170, Math.min(286, artRoom));


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

    A fila desmonta os dois — ela reorganiza a tela de verdade. A letra só os esmaece, por
    `Fade`, e o lugar deles fica: era um `&&` de `showLyrics`, o bloco sumia de um quadro
    para o outro e o rodapé saltava para cima.
  */
  const bigTitle = treatment !== 'wave' && !showQueue;
  const ribbon = !showQueue;
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
      /* Arrastar para baixo fecha, menos com a letra aberta: lá o vertical pertence à
         rolagem do texto. Por shared value para a troca não reconstruir o gesto. */
      dragBlocked={lyricsOn}
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
          <View style={{ flex: 1, justifyContent: showQueue ? 'flex-start' : 'center' }}>
            <Animated.View
              layout={LinearTransition.duration(300)}
              style={{ alignItems: 'center', marginTop: showQueue ? 0 : ART_TOP }}>
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
            */}
            {!showQueue && (
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
                  marginTop: 26,
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
                {canShowRoutePicker && (
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: T.t12,
                      backgroundColor: T.t06,
                    }}>
                    <RoutePicker size={26} tint={T.full} />
                  </View>
                )}
                {canShareToStories && (
                  <Pill onPress={() => share(nowPlaying(), 'stories')}>
                    <Instagram size={16} color={T.t72} />
                  </Pill>
                )}
                <Pill onPress={() => share(nowPlaying(), 'sheet')}>
                  <ShareIcon size={15} color={T.t72} />
                </Pill>
              </ZoomFade>
            )}

            {showQueue && (
              <Animated.View
                entering={FadeInDown.duration(280)}
                exiting={FadeOut.duration(140)}
                style={{ flex: 1, marginTop: 12 }}>
                <QueuePanel />
              </Animated.View>
            )}
          </View>
        </GestureDetector>
        </Stage>

        {/* rodapé */}
        <ZoomFade style={{ marginTop: 14 }}>
          {bigTitle && (
            <Fade on={lyricsOn} style={{ alignItems: 'center', marginBottom: 20 }}>
              <Display size={26} tracking={-0.035} align="center" numberOfLines={2}>
                {track.title}
              </Display>
              <Body size={14} color={T.t62} style={{ marginTop: 5 }}>
                {track.artist}
              </Body>
            </Fade>
          )}

          {ribbon && (
            /*
              A fita vale nos três tratamentos, inclusive no da onda.

              Antes ela era escondida ali — quem buscava era a própria forma de onda — e
              voltava quando a letra abria, que é quando a onda sai de cena. Manter o
              lugar dela custava 40 px vazios embaixo do transporte, e recolher a altura
              de verdade re-mede a caixa da letra a cada quadro da transição, que é a
              travada que o `Fade` existe para não ter. Com a fita sempre lá, nada no
              rodapé se move: no modo onda ela e a onda dizem a mesma coisa em dois
              tamanhos, o que é barato demais para valer um vão morto.
            */
            <Ribbon
              seed={track.id}
              progress={progress}
              accent={accent}
              onSeek={(delta) => seekTo(elapsed.value + delta * duration)}
            />
          )}

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              marginTop: 16,
            }}>
            <Elapsed />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: accent }} />
              <Mono size={10} weight={500} tracking={0.14} caps color={T.t62}>
                {playing ? track.file.split('.').pop() : t('player.paused')}
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
            <Pressable onPress={() => toggleLike(track.id)} hitSlop={8} style={round(44)}>
              <Heart size={20} color={accent} filled={liked} />
            </Pressable>
            <Pressable
              onPress={previous}
              disabled={!canPrevious}
              hitSlop={8}
              style={[round(52), { opacity: canPrevious ? 1 : 0.3 }]}>
              <Previous />
            </Pressable>
            <PlayButton playing={playing} accent={accent} onPress={toggle} />
            <Pressable
              onPress={next}
              disabled={!canNext}
              hitSlop={8}
              style={[round(52), { opacity: canNext ? 1 : 0.3 }]}>
              <Next />
            </Pressable>
            {/* No protótipo este slot abria a tela de bloqueio, que é do sistema; aqui
                ele abre a fila. */}
            <Pressable onPress={() => setShowQueue((on) => !on)} hitSlop={8} style={round(44)}>
              <Queue size={20} color={showQueue ? accent : T.t72} />
            </Pressable>
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
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: label ? 8 : 0,
        paddingHorizontal: label ? 14 : 0,
        width: label ? undefined : 34,
        height: 34,
        borderRadius: 17,
        borderWidth: 1,
        borderColor: T.t12,
        backgroundColor: T.t06,
      }}>
      {children}
      {label ? (
        <Body size={12} weight={600} color={T.t72}>
          {label}
        </Body>
      ) : null}
    </Pressable>
  );
}

/** Encolhe o Now Playing de volta para o mini player. */
function CloseButton() {
  const close = useZoomClose();
  return (
    <Pressable
      onPress={close}
      hitSlop={8}
      style={{
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: T.t08,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <ChevronDown />
    </Pressable>
  );
}


/** Altura da capa quando a fila está aberta. */
const ART_MINI = 92;

/**
 * Os dois relógios são folhas de propósito: `useElapsed` re-renderiza quem o chama a
 * cada 200 ms, e aqui isso custa um texto — não a tela inteira do Now Playing.
 */
/**
 * O segundo decorrido, e só ele.
 *
 * Vem do shared value, não de `useElapsed()`: aquele é o status do expo-audio, que chega
 * várias vezes por segundo e re-renderizava os dois contadores a cada leitura — trabalho
 * na thread de JS para redesenhar um texto que muda uma vez por segundo. A reação corre
 * na thread de UI e só acorda o React quando o segundo inteiro vira.
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
  const { track, queue, index, play, removeAt, reorder, toggleShuffle } = usePlayer();
  const { library } = useLibrary();
  const { accent, shuffle, repeat, setRepeat, continuation, setContinuation } = usePrefs();
  const t = useT();

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

        <View style={{ flex: 1 }} />
      </View>

      {/* Abas do modo de continuação: as quatro opções à vista, sem ciclar às cegas. */}
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: C.card,
          borderRadius: R.r13,
          padding: 3,
          marginTop: 10,
        }}>
        {CONTINUATIONS.map((option) => {
          const on = option.key === continuation;
          return (
            <Pressable
              key={option.key}
              onPress={() => setContinuation(option.key)}
              style={{
                flex: 1,
                height: 30,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: on ? alpha(accent, 0.18) : 'transparent',
              }}>
              <Body size={11.5} weight={600} color={on ? T.full : T.t42}>
                {t(option.short)}
              </Body>
            </Pressable>
          );
        })}
      </View>

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
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={{
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: on ? alpha(accent, 0.16) : 'transparent',
      }}>
      {children}
    </Pressable>
  );
}

const round = (size: number) => ({
  width: size,
  height: size,
  borderRadius: size / 2,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
});

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
    if (playing) ring.value = withRepeat(withTiming(1, { duration: 2200 }), -1, false);
    else ring.value = withTiming(0, { duration: 200 });
  }, [playing, ring]);
  const ringStyle = useAnimatedStyle(() => ({
    opacity: (1 - ring.value) * 0.55,
    transform: [{ scale: 0.85 + ring.value * 1.05 }],
  }));

  return (
    <Pressable
      onPress={onPress}
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
      {playing ? <Pause size={24} color={C.onAccent} /> : <Play size={22} color={C.onAccent} />}
    </Pressable>
  );
}

/** As abas arte/letras da barra superior. */
function ArtLyricsTabs({ on }: { on: SharedValue<number> }) {
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
        backgroundColor: T.t08,
      }}>
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
      <Pressable onPress={go(0)} style={tab}>
        <Animated.View style={art}>
          <Disc color={T.full} />
        </Animated.View>
      </Pressable>
      <Pressable onPress={go(1)} style={tab}>
        <Animated.View style={text}>
          <LyricsIcon color={T.full} />
        </Animated.View>
      </Pressable>
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
    if (playing) pulse.value = withRepeat(withTiming(0.8, { duration: 4000 }), -1, true);
    else pulse.value = withTiming(0.35, { duration: 400 });
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
