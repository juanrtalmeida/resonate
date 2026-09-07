/**
 * A capa procedural do design: dois radial-gradients, um anel branco rotacionado,
 * uma linha horizontal e as iniciais.
 *
 * ponytail: a textura de riscas diagonais do protótipo era repeating-linear-gradient,
 * que o React Native 0.86 não parseia — 5% de branco, some sem prejuízo.
 */

import { Image, View, type ViewStyle } from 'react-native';

import { artGradient, type Artwork } from '@/lib/artwork';
import { C } from '@/constants/theme';
import { Display } from './text';

type Detail = 'full' | 'ring' | 'plain';

export function AlbumArt({
  art,
  size,
  radius,
  detail = 'full',
  scrim = false,
  cover,
  onCoverSettled,
  style,
}: {
  art: Artwork;
  size: number;
  radius: number;
  detail?: Detail;
  /** Escurecimento no rodapé, usado no grid da biblioteca. */
  scrim?: boolean;
  /** Capa extraída do arquivo. Quando existe, cobre a arte procedural. */
  cover?: string | null;
  /**
   * Chamado quando a capa terminou de carregar — ou falhou.
   *
   * Existe para a captura do card de compartilhamento: ela roda com o card fora da tela,
   * e capturar antes de a imagem chegar sai com a arte procedural no lugar da capa. Erro
   * também avisa, senão uma capa ilegível travaria o compartilhamento para sempre.
   */
  onCoverSettled?: () => void;
  style?: ViewStyle;
}) {
  const ring = size * 0.68;
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius,
          overflow: 'hidden',
          backgroundColor: art.c,
          experimental_backgroundImage: artGradient(art),
        },
        style,
      ]}>
      {/* A arte procedural fica embaixo: é o que aparece enquanto a imagem carrega e
          quando o arquivo não tem capa embutida. */}
      {cover ? (
        <Image
          source={{ uri: cover }}
          style={{ position: 'absolute', width: size, height: size }}
          resizeMode="cover"
          onLoad={onCoverSettled}
          onError={onCoverSettled}
        />
      ) : null}
      {!cover && detail !== 'plain' && (
        <View
          style={{
            position: 'absolute',
            left: (size - ring) / 2,
            top: (size - ring) / 2,
            width: ring,
            height: ring,
            borderRadius: ring / 2,
            borderWidth: Math.max(1, size / 145),
            borderColor: 'rgba(255,255,255,.3)',
            transform: [{ rotate: `${art.rot}deg` }],
          }}
        />
      )}
      {!cover && detail === 'full' && (
        <>
          <View
            style={{
              position: 'absolute',
              left: size * 0.11,
              right: size * 0.11,
              top: size / 2,
              height: Math.max(1, size / 145),
              backgroundColor: 'rgba(255,255,255,.2)',
            }}
          />
          <Display
            weight={800}
            size={size * 0.07}
            tracking={0.02}
            color="rgba(255,255,255,.88)"
            style={{ position: 'absolute', left: size * 0.09, bottom: size * 0.08 }}>
            {art.initials}
          </Display>
        </>
      )}
      {scrim && (
        <View
          style={{
            position: 'absolute',
            inset: 0,
            experimental_backgroundImage: `linear-gradient(180deg, transparent 55%, rgba(8,7,6,.5) 100%)`,
          }}
        />
      )}
    </View>
  );
}

/** Fundo neutro para quando ainda não há capa. */
export const ART_PLACEHOLDER = C.art;
