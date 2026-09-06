/**
 * Fundo das telas de álbum e de lista: a própria capa, borrada, atrás do conteúdo.
 *
 * Antes era um radial-gradient tingido com `art.a` — uma cor sorteada pelo hash de
 * "artista + álbum", sem relação nenhuma com a capa que está na tela logo acima. Quando
 * o arquivo tem capa embutida, o fundo combinava com ela só por acaso.
 *
 * Usar a imagem resolve o casamento de cor por construção, e de quebra tira a tela da
 * dependência de radial-gradient, que no iPhone não estava pintando. O gradiente linear
 * que dissolve a imagem no fundo da tela continua — esse pinta nos dois.
 *
 * `blurRadius` é nativo dos dois lados, e a capa embutida é pequena: borrar sai barato.
 */

import { Image, View } from 'react-native';

import { C, alpha } from '@/constants/theme';
import { ZoomFade } from '@/lib/zoom';

export function Backdrop({
  cover,
  /** Reserva para quando não há capa embutida: a cor da arte procedural. */
  color,
  height = 420,
}: {
  cover: string | null;
  color: string;
  height?: number;
}) {
  // ZoomFade, e não View: fora de uma tela com zoom ele devolve opacidade 1 e nada muda
  // (é o caso da lista); dentro de uma, o fundo sai de cena junto com o resto em vez de
  // ficar opaco até a tela desmontar.
  return (
    <ZoomFade
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, height }}>
      {cover ? (
        <Image
          source={{ uri: cover }}
          blurRadius={40}
          resizeMode="cover"
          style={{ flex: 1, opacity: 0.6 }}
        />
      ) : (
        <View style={{ flex: 1, backgroundColor: color, opacity: 0.35 }} />
      )}
      {/* Sem isto a imagem termina num corte reto no meio da tela. */}
      <View
        style={{
          position: 'absolute',
          inset: 0,
          experimental_backgroundImage:
            `linear-gradient(180deg, ${alpha(C.bg, 0.35)} 0%, ` +
            `${alpha(C.bg, 0.82)} 58%, ${C.bg} 100%)`,
        }}
      />
    </ZoomFade>
  );
}
