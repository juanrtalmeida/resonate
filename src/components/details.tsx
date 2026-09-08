/**
 * As camadas de álbum e artista, empilhadas sobre o `<Stack>` do router.
 *
 * Uma `View` absoluta por camada, na ordem da pilha — a última fica em cima. Nenhuma
 * janela nativa envolvida: é isso que mantém a tela de baixo visível atrás e a barra
 * inferior numa instância só. Ver `lib/detail.tsx` para o porquê.
 */

import { View } from 'react-native';

import { useDetail } from '@/lib/detail';
import { AlbumScreen } from '@/screens/album';
import { ArtistScreen } from '@/screens/artist';
import { PlayerScreen } from '@/screens/player';

export function Details() {
  const { stack } = useDetail();

  return stack.map((detail, depth) => (
    /*
      A `key` leva a profundidade junto do conteúdo: abrir o mesmo álbum de dentro dele
      mesmo — pelo artista, e de volta — teria a mesma chave em dois níveis, e o React
      reusaria a camada de baixo em vez de montar a de cima.
    */
    <View
      key={`${depth}:${detail.kind}:${detail.kind === 'album' ? detail.id : detail.name}`}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      {detail.kind === 'album' ? (
        <AlbumScreen id={detail.id} />
      ) : (
        <ArtistScreen name={detail.name} />
      )}
    </View>
  ));
}

/**
 * O Now Playing, acima da barra.
 *
 * Renderizado depois da `<Chrome/>` no layout raiz de propósito: a barra tem de ficar
 * **embaixo** dele, porque é ela o destino do voo da capa quando o player minimiza.
 */
export function PlayerLayer() {
  const { playerOpen } = useDetail();
  if (!playerOpen) return null;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <PlayerScreen />
    </View>
  );
}
