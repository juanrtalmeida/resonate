import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeInDown,
  FadeOut,
  LinearTransition,
  SensorType,
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
import { canShareToStories } from '@/lib/share';
import { useElapsed, usePlayer } from '@/lib/player';
import { usePrefs } from '@/lib/prefs';
import type { Track } from '@/lib/scan';
import { TILT_INTERVAL, TILT_REST, tiltAngles, tiltStep } from '@/lib/tilt';
import { LyricsView, NoLyrics } from '@/components/lyrics';
import { parseLrc, type Lyrics } from '@/lib/lrc';
import { CONTINUATIONS, continuationFor } from '@/lib/queue';
import { importLrc, readLyrics } from '@/lib/scan';
import { useLibrary } from '@/lib/library';
import { ZoomFade, ZoomScreen, ZoomTarget, useZoomClose } from '@/lib/zoom';

/**
 * Altura reservada ao que não é a capa, em dp: fechar (38), título grande (70), fita (44),
 * tempo (32), transporte (92), fileira secundária (60), recuos da tela (20), respiro no
 * topo (24), e as margens entre eles.
 */
const ROOM = 394;

export default function PlayerScreen() {
  const insets = useSafeAreaInsets();
  const { height: screen } = useWindowDimensions();
  const { track, playing, duration, toggle, next, previous, seekTo, canNext, canPrevious, elapsed } =
    usePlayer();
  const { accent, treatment, isLiked, toggleLike } = usePrefs();
  const { albumById } = useLibrary();
  const [showLyrics, setShowLyrics] = useState(false);
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


  if (!track) {
    return (
      <ZoomScreen background={C.surface}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Body size={14} color={T.t5}>
            Nada tocando.
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

  // Com a letra aberta, o título grande sai de cena: o espaço é dela, como no Music.
  // Com a fila aberta, título grande e fita saem: o espaço é da lista.
  const bigTitle = treatment !== 'wave' && !showLyrics && !showQueue;
  const ribbon = (treatment !== 'wave' || showLyrics) && !showQueue;

  // dismissable só fora das letras: lá o arraste vertical pertence à rolagem do texto.
  /** O que o card leva quando se compartilha do Now Playing. */
  const nowPlaying = () => ({
    title: track.title,
    subtitle: track.artist,
    detail: track.album,
    cover,
    art,
  });

  return (
    <ZoomScreen background={C.surface} dismissable={!showLyrics}>
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
          <ArtLyricsTabs showLyrics={showLyrics} onChange={setShowLyrics} />
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
              Tocando de
            </Mono>
            <Body size={12.5} weight={600} numberOfLines={1} style={{ marginTop: 4 }}>
              {track.album}
            </Body>
          </View>
        </ZoomFade>

        {/* área da arte, ou a letra no lugar dela */}
        {showLyrics ? (
          <ZoomFade style={{ flex: 1 }}>
            <LyricsPane track={track} onSeek={seekTo} />
          </ZoomFade>
        ) : (
        <GestureDetector gesture={swipe}>
          <View style={{ flex: 1, justifyContent: showQueue ? 'flex-start' : 'center' }}>
            <Animated.View
              layout={LinearTransition.duration(300)}
              style={{ alignItems: 'center' }}>
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
                    {playing ? 'lado a · 33⅓ rpm' : 'agulha erguida'}
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
                    Faixa inteira
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
                  justifyContent: 'space-between',
                  alignSelf: 'center',
                  // Presa à largura do card. No modo onda não existe card grande, e o
                  // bloco inteiro já é de largura cheia.
                  width: treatment === 'wave' ? '100%' : artSize,
                  marginTop: 26,
                }}>
                {/* Trocar de saída é do sistema: o botão abre o painel dele, já apontado
                    para a nossa reprodução. */}
                {canPickOutput && (
                  <Pill
                    onPress={() => {
                      void pickAudioOutput();
                    }}>
                    <Output size={16} color={T.t72} />
                  </Pill>
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
        )}

        {/* rodapé */}
        <ZoomFade style={{ marginTop: 14 }}>
          {bigTitle && (
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <Display size={26} tracking={-0.035} align="center" numberOfLines={2}>
                {track.title}
              </Display>
              <Body size={14} color={T.t62} style={{ marginTop: 5 }}>
                {track.artist}
              </Body>
            </View>
          )}

          {ribbon && (
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
                {playing ? track.file.split('.').pop() : 'pausado'}
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

const EMPTY_LYRICS: Lyrics = { synced: false, lines: [] };

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
                {option.short}
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
            Nada na fila depois desta faixa.
          </Body>
        )}

        {/*
          A seção da continuação aparece sempre, com ou sem candidato: era ela que
          respondia às abas, e escondê-la quando o modo não achava nada fazia o toque
          parecer não ter efeito nenhum sobre a lista.
        */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 }}>
          <Mono size={9.5} weight={500} tracking={0.16} caps color={T.t4}>
            Depois · {current?.blurb}
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
            {continuation === 'off'
              ? 'A fila termina aqui e o áudio para.'
              : 'Nada na biblioteca se encaixa nesta escolha.'}
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
function ArtLyricsTabs({
  showLyrics,
  onChange,
}: {
  showLyrics: boolean;
  onChange: (on: boolean) => void;
}) {
  const tab = (on: boolean) => ({
    width: 34,
    height: 28,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: on ? T.t14 : 'transparent',
  });

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 2,
        padding: 3,
        borderRadius: R.r17,
        backgroundColor: T.t08,
      }}>
      <Pressable onPress={() => onChange(false)} style={tab(!showLyrics)}>
        <Disc color={showLyrics ? T.t46 : T.full} />
      </Pressable>
      <Pressable onPress={() => onChange(true)} style={tab(showLyrics)}>
        <LyricsIcon color={showLyrics ? T.full : T.t46} />
      </Pressable>
    </View>
  );
}

/**
 * Busca a letra da faixa quando a aba abre. O texto não fica no índice da biblioteca
 * (ver docs/03-decisoes.md, D11), então é lido do arquivo aqui.
 */
function LyricsPane(props: { track: Track; onSeek: (seconds: number) => void }) {
  // A key remonta ao trocar de faixa, o que zera o estado sem um setState no efeito.
  return <LoadedLyrics key={props.track.id} {...props} />;
}

function LoadedLyrics({
  track,
  onSeek,
}: {
  track: Track;
  onSeek: (seconds: number) => void;
}) {
  // A letra sincronizada é o único lugar que realmente precisa do tempo em JavaScript, e
  // só enquanto o painel está aberto. Re-renderiza daqui para baixo, não a tela inteira.
  const elapsed = useElapsed();
  const { markLyrics } = useLibrary();
  const [lyrics, setLyrics] = useState<Lyrics | null>(track.hasLyrics ? null : EMPTY_LYRICS);

  useEffect(() => {
    if (!track.hasLyrics) return;
    let alive = true;
    readLyrics(track).then((raw) => {
      if (alive) setLyrics(parseLrc(raw ?? ''));
    });
    return () => {
      alive = false;
    };
  }, [track]);

  const pick = async () => {
    if (!(await importLrc(track))) return;
    markLyrics(track.id);
    setLyrics(parseLrc((await readLyrics(track)) ?? ''));
  };

  if (!lyrics) return <View style={{ flex: 1 }} />;
  if (!lyrics.lines.length) return <NoLyrics onPick={pick} />;
  return (
    <View style={{ flex: 1 }}>
      <LyricsView lyrics={lyrics} elapsed={elapsed} onSeek={onSeek} />
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
