/** Linha de faixa das telas de álbum e de biblioteca. */

import { Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { T, alpha, fmt } from '@/constants/theme';
import { usePlayer } from '@/lib/player';
import type { Track } from '@/lib/scan';
import { EqBars } from './eq-bars';
import { ConfirmIcon, useConfirm } from './confirm';
import { Plus, Queue } from './icons';
import { Body, Mono } from './text';

/** Quanto a linha anda ao ser arrastada, e a partir de onde a fila recebe a faixa. */
const SWIPE_MAX = 110;
const SWIPE_FIRE = 72;

export function TrackRow({
  track,
  position,
  accent,
  onPress,
  onLongPress,
  onQueue,
  onPlaylist,
  subtitle,
}: {
  track: Track;
  /** Número exibido quando a faixa não é a que está tocando. */
  position: number;
  accent: string;
  onPress: () => void;
  /** Toque longo: joga a faixa numa lista. */
  onLongPress?: () => void;
  /** Arrastar a linha para a direita manda a faixa para o fim da fila. */
  onQueue?: () => void;
  /** Arrastar para a esquerda abre o seletor de listas. */
  onPlaylist?: () => void;
  /**
   * Segunda linha. O padrão é "artista · álbum": o nome do arquivo, que vinha do
   * protótipo, não diz nada que o usuário queira ler numa lista de música.
   * As telas que já dão um dos dois no contexto passam só o outro.
   */
  subtitle?: string;
}) {
  const { track: current, playing } = usePlayer();
  const active = current?.id === track.id;

  const { fire: enqueue, done, style: bounce } = useConfirm(() => onQueue?.());

  /**
   * Dois sentidos, duas ações: para a direita a faixa vai para a fila, para a esquerda
   * abre o seletor de listas. `failOffsetY` é o que impede o gesto de roubar a rolagem
   * vertical da lista.
   */
  const x = useSharedValue(0);
  const drag = Gesture.Pan()
    .enabled(!!onQueue || !!onPlaylist)
    .activeOffsetX([-24, 24])
    .failOffsetY([-14, 14])
    .onUpdate((e) => {
      const limit = e.translationX > 0 ? (onQueue ? SWIPE_MAX : 0) : onPlaylist ? -SWIPE_MAX : 0;
      x.value = limit >= 0 ? Math.min(e.translationX, limit) : Math.max(e.translationX, limit);
    })
    .onEnd((e) => {
      if (onQueue && e.translationX > SWIPE_FIRE) runOnJS(enqueue)();
      else if (onPlaylist && e.translationX < -SWIPE_FIRE) runOnJS(onPlaylist)();
      // Mola na volta: o pequeno repique confirma que o gesto valeu.
      x.value = withSpring(0, { damping: 14, stiffness: 220 });
    });

  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  // Cada pista aparece só no seu sentido de arraste.
  const trail = useAnimatedStyle(() => ({
    opacity: x.value > 0 ? Math.min(1, x.value / SWIPE_FIRE) : 0,
  }));
  const trailLeft = useAnimatedStyle(() => ({
    opacity: x.value < 0 ? Math.min(1, -x.value / SWIPE_FIRE) : 0,
  }));

  return (
    <View>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            justifyContent: 'center',
            paddingLeft: 18,
          },
          trail,
        ]}>
        <Animated.View style={bounce}>
          <ConfirmIcon done={done} accent={accent}>
            <Queue size={18} color={accent} />
          </ConfirmIcon>
        </Animated.View>
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            justifyContent: 'center',
            paddingRight: 18,
          },
          trailLeft,
        ]}>
        <Plus size={18} color={accent} />
      </Animated.View>

      <GestureDetector gesture={drag}>
        <Animated.View style={slide}>
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={280}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 13,
        // O container da lista já recua; aqui o destaque sangra 10 px para fora dele,
        // e o texto volta a alinhar com o resto da tela.
        marginHorizontal: -10,
        paddingHorizontal: 10,
        borderRadius: 13,
        backgroundColor: active ? alpha(accent, 0.08) : 'transparent',
      }}>
      <View style={{ width: 20, height: 16, alignItems: 'center', justifyContent: 'flex-end' }}>
        {active ? (
          <EqBars count={3} width={2.5} gap={2} height={14} color={accent} playing={playing} />
        ) : (
          <Mono size={12} color={T.t3}>
            {String(position).padStart(2, '0')}
          </Mono>
        )}
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Body
          size={14.5}
          weight={500}
          tracking={-0.01}
          color={active ? accent : T.full}
          numberOfLines={1}>
          {track.title}
        </Body>
        <Body size={11.5} color={T.t42} numberOfLines={1} style={{ marginTop: 2 }}>
          {subtitle ?? [track.artist, track.album].filter(Boolean).join(' · ')}
        </Body>
      </View>

      {track.hasLyrics && (
        <View
          style={{
            paddingHorizontal: 6,
            paddingVertical: 4,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: 'rgba(246,241,234,.16)',
          }}>
          <Mono size={8.5} weight={500} tracking={0.1} color={T.t62}>
            LRC
          </Mono>
        </View>
      )}

      <Mono size={12} color="rgba(246,241,234,.38)">
        {track.duration == null ? '--:--' : fmt(track.duration)}
      </Mono>
    </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
