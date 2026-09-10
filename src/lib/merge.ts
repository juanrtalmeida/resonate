/**
 * Fundir acervos num índice só.
 *
 * A biblioteca do app é uma `Library` — um `tracks` e um `albums` — e passou a ter duas
 * origens: os arquivos do aparelho e um servidor OpenSubsonic (`lib/subsonic.ts`). As duas
 * têm de conviver ali dentro, porque é o índice único que faz busca, Escuta, playlists,
 * menu de toque longo e a grade de álbuns valerem para os dois acervos sem uma linha de
 * código nova em nenhuma dessas telas.
 *
 * O perigo é o oposto: cada origem se atualiza sozinha, e uma atualização ingênua apagaria
 * a outra. Varrer os arquivos locais devolve uma `Library` que não sabe do servidor, e
 * sincronizar o servidor devolve uma que não sabe dos arquivos — gravar qualquer uma das
 * duas por cima da anterior perde metade do acervo, junto com as capas e os ids que as
 * curtidas e as listas apontam.
 *
 * A solução é dizer, em cada atualização, **de que fatia ela é dona**. Quem chama passa um
 * `owns`: as faixas antigas que caem dentro do domínio da atualização saem e são
 * substituídas; as de fora ficam como estavam. Uma varredura local é dona de tudo o que
 * não é remoto; uma sincronia é dona de tudo daquele servidor.
 *
 * Puro de propósito, e é a razão de ser um módulo em vez de duas linhas dentro do
 * provider: é aqui que "perder metade da biblioteca" acontece se a conta estiver errada, e
 * uma função pura roda em `node --test`, caso por caso. Mesma razão de `lib/paths.ts`.
 */

import type { Album, Library, Track } from './scan';

/**
 * O que uma atualização traz. Menos que uma `Library`: `folders` e `scannedAt` descrevem a
 * varredura local, e uma sincronia de servidor não tem o que dizer sobre eles.
 */
export type Incoming = {
  tracks: Track[];
  albums: Album[];
};

/**
 * Funde `incoming` em `current`.
 *
 * @param owns Se um id **antigo** pertence ao domínio desta atualização. O que ele aceita
 *   sai do índice, porque a atualização é a nova verdade sobre essa fatia; o que ele
 *   recusa é preservado intacto.
 * @param folders Pastas da varredura local, quando esta atualização é uma. Ausente
 *   preserva as que já estavam — uma sincronia de servidor não escolhe pastas.
 */
export function mergeLibrary(
  current: Library | null,
  incoming: Incoming,
  owns: (id: string) => boolean,
  folders?: string[]
): Library {
  const keptTracks = (current?.tracks ?? []).filter((t) => !owns(t.id));
  const keptAlbums = (current?.albums ?? []).filter((a) => !owns(a.id));

  /*
    A atualização vence em caso de id repetido.

    Não deveria acontecer — os domínios são disjuntos por construção —, mas se acontecer, o
    silencioso é pior: duas faixas com o mesmo id fazem `trackById` devolver uma e
    `tracksOf` a outra, e a tela passa a mostrar uma faixa que o player não toca. O `Map`
    com a atualização inserida por último resolve sem precisar confiar em `owns`.
  */
  const tracks = dedupe([...keptTracks, ...incoming.tracks]);
  const albums = dedupe([...keptAlbums, ...incoming.albums]);

  // Um `Set`, e não um `some` aninhado: a versão ingênua é álbuns × faixas-do-álbum ×
  // faixas, que num acervo de dez mil faixas é dezenas de milhões de comparações a cada
  // varredura.
  const present = new Set(tracks.map((t) => t.id));

  return {
    tracks,
    /*
      Álbum sem faixa nenhuma sai.

      Acontece de verdade: um álbum remoto cujo servidor deixou de listá-lo, ou um álbum
      local cujos arquivos saíram da pasta escolhida. Na grade ele é uma capa que abre numa
      tela em branco.

      As `trackIds` também são podadas, e não só o álbum inteiro descartado: um álbum que
      perdeu três faixas de dez continua válido, mas apontando para três ids que não
      existem mais — e `tracksOf` devolveria uma lista com buracos.
    */
    albums: albums
      .map((a) => {
        const kept = a.trackIds.filter((id) => present.has(id));
        return kept.length === a.trackIds.length ? a : { ...a, trackIds: kept };
      })
      .filter((a) => a.trackIds.length > 0),
    folders: folders ?? current?.folders ?? [],
    scannedAt: Date.now(),
  };
}

/** Último id repetido vence. */
function dedupe<T extends { id: string }>(items: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of items) byId.set(item.id, item);
  return [...byId.values()];
}
