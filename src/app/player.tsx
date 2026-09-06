import { Accelerometer } from 'expo-sensors';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeInDown,
  FadeOut,
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlbumArt } from '@/components/album-art';
import {
  ChevronDown,
  Disc,
  Heart,
  Lyrics as LyricsIcon,
  Next,
  Pause,
  Play,
  Previous,
  Queue,
  Repeat,
  Shuffle,
} from '@/components/icons';
import { Ribbon, Vinyl, Waveform } from '@/components/player-visuals';
import { QueueRow } from '@/components/queue-row';
import { Body, Display, Mono } from '@/components/text';
import { C, R, T, alpha, fmt } from '@/constants/theme';
import { artworkFor } from '@/lib/artwork';
import { useElapsed, usePlayer } from '@/lib/player';
import { usePrefs } from '@/lib/prefs';
import type { Track } from '@/lib/scan';
import { TILT_INTERVAL, createTilt } from '@/lib/tilt';
import { LyricsView, NoLyrics } from '@/components/lyrics';
import { parseLrc, type Lyrics } from '@/lib/lrc';
import { CONTINUATIONS, continuationFor } from '@/lib/queue';
import { importLrc, readLyrics } from '@/lib/scan';
import { useLibrary } from '@/lib/library';
import { ZoomFade, ZoomScreen, ZoomTarget, useZoomClose } from '@/lib/zoom';

export default function PlayerScreen() {
  const insets = useSafeAreaInsets();
  const { track, playing, duration, toggle, next, previous, seekTo, canNext, canPrevious } =
    usePlayer();
  const { accent, treatment, isLiked, toggleLike } = usePrefs();
  const { albumById } = useLibrary();
  const elapsed = useElapsed();
  const [showLyrics, setShowLyrics] = useState(false);
  const [showQueue, setShowQueue] = useState(false);

  // 0 = capa cheia, 1 = capa reduzida com a fila embaixo.
  const q = useSharedValue(0);
  useEffect(() => {
    q.value = withTiming(showQueue ? 1 : 0, { duration: 320 });
  }, [showQueue, q]);

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
  const artSize = showQueue
    ? ART_MINI
    : treatment === 'vinyl'
      ? 310
      : treatment === 'wave'
        ? 96
        : 286;


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
  const progress = duration > 0 ? Math.min(1, elapsed / duration) : 0;
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
  return (
    <ZoomScreen background={C.surface} dismissable={!showLyrics}>
      <ZoomFade style={{ position: 'absolute', inset: 0 }}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.5,
          experimental_backgroundImage:
            `radial-gradient(110% 60% at 50% 0%, ${art.a} 0%, transparent 62%),` +
            `radial-gradient(90% 50% at 20% 100%, ${art.b} 0%, transparent 60%)`,
        }}
      />
      <Glow color={art.a} playing={playing} />
      </ZoomFade>

      <View
        style={{
          flex: 1,
          paddingTop: insets.top + 16,
          paddingBottom: Math.max(insets.bottom, 18) + 16,
          paddingHorizontal: 24,
        }}>
        {/* barra superior */}
        <ZoomFade style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <CloseButton />
          <View style={{ alignItems: 'center', flex: 1 }}>
            <Mono size={9.5} weight={500} tracking={0.16} caps color={T.t4}>
              Tocando de
            </Mono>
            <Body size={12.5} weight={600} numberOfLines={1} style={{ marginTop: 4 }}>
              {track.album}
            </Body>
          </View>
          <ArtLyricsTabs showLyrics={showLyrics} onChange={setShowLyrics} />
        </ZoomFade>

        {/* área da arte, ou a letra no lugar dela */}
        {showLyrics ? (
          <ZoomFade style={{ flex: 1 }}>
            <LyricsPane track={track} elapsed={elapsed} onSeek={seekTo} />
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
                <ZoomTarget>
                  <AlbumArt art={art} size={artSize} radius={30} cover={cover} />
                </ZoomTarget>
              </Animated.View>
            )}

            {treatment === 'vinyl' && (
              <Animated.View style={[{ alignSelf: 'center', alignItems: 'center' }, slideOnly]}>
                <ZoomTarget>
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
              <View>
                <Animated.View
                  style={[{ flexDirection: 'row', alignItems: 'center', gap: 16 }, slideOnly]}>
                  <ZoomTarget>
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
                </Animated.View>
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
              </View>
            )}
            </Animated.View>

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
              onSeek={(delta) => seekTo(elapsed + delta * duration)}
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
            <Mono size={13} weight={500} color={T.full} style={{ minWidth: 56 }}>
              {fmt(Math.floor(elapsed))}.{Math.floor((elapsed % 1) * 10)}
            </Mono>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: accent }} />
              <Mono size={10} weight={500} tracking={0.14} caps color={T.t62}>
                {playing ? track.file.split('.').pop() : 'pausado'}
              </Mono>
            </View>
            <Mono size={13} weight={500} color={T.t5} align="right" style={{ minWidth: 56 }}>
              {duration > 0 ? `-${fmt(duration - elapsed)}` : '--:--'}
            </Mono>
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

          <Body size={11} color={T.t24} align="center" style={{ marginTop: 14 }}>
            Arraste a capa · {treatment === 'wave' ? 'toque na onda para buscar' : 'toque na fita para buscar'}
          </Body>
        </ZoomFade>
      </View>
    </ZoomScreen>
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
 * Assina o acelerômetro e devolve os ângulos do tilt em shared values. Sem sensor — web,
 * emulador sem acelerômetro — fica em zero e nada se move.
 *
 * O `withTiming` entre leituras é o que separa o efeito do serrilhado: a 80 ms o sinal
 * chega em degraus, e a animação preenche o intervalo.
 */
function useTilt() {
  const rx = useSharedValue(0);
  const ry = useSharedValue(0);

  useEffect(() => {
    let sub: { remove: () => void } | undefined;
    let cancelled = false;
    const step = createTilt();
    Accelerometer.isAvailableAsync()
      .then((ok) => {
        if (!ok || cancelled) return;
        Accelerometer.setUpdateInterval(TILT_INTERVAL);
        sub = Accelerometer.addListener(({ x, y }) => {
          const angle = step(x, y);
          const ease = { duration: TILT_INTERVAL * 1.6 };
          rx.value = withTiming(angle.rx, ease);
          ry.value = withTiming(angle.ry, ease);
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [rx, ry]);

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

        {preview.length > 0 && (
          <>
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
          </>
        )}

        {upcoming.length === 0 && preview.length === 0 && (
          <Body size={12.5} color={T.t42} align="center" style={{ marginTop: 26, paddingHorizontal: 20 }}>
            {continuation === 'off'
              ? 'Nada depois desta faixa.'
              : 'Nada encontrado para continuar com esta escolha.'}
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
function LyricsPane(props: { track: Track; elapsed: number; onSeek: (seconds: number) => void }) {
  // A key remonta ao trocar de faixa, o que zera o estado sem um setState no efeito.
  return <LoadedLyrics key={props.track.id} {...props} />;
}

function LoadedLyrics({
  track,
  elapsed,
  onSeek,
}: {
  track: Track;
  elapsed: number;
  onSeek: (seconds: number) => void;
}) {
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
