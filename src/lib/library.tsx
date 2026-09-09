/** A biblioteca em memória, carregada do banco no boot. Ver `lib/db.ts`. */

import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react';

import { deleteTracks, setHasLyrics } from './db';
import { applyEdits } from './edits';
import { usePrefs } from './prefs';
import { clear, load, save, type Album, type Library, type Track } from './scan';

type LibraryApi = {
  library: Library | null;
  tracksOf: (album: Album) => Track[];
  trackById: (id: string) => Track | undefined;
  albumById: (id: string) => Album | undefined;
  artists: { name: string; albums: Album[] }[];
  replace: (library: Library) => void;
  /** Depois de importar um .lrc, para o selo aparecer sem esperar uma nova varredura. */
  markLyrics: (trackId: string) => void;
  /** Depois de apagar arquivos do aparelho, para o índice não citar o que não existe. */
  removeTracks: (trackIds: string[]) => void;
  reset: () => void;
};

const Ctx = createContext<LibraryApi | null>(null);

export function LibraryProvider({ children }: { children: ReactNode }) {
  // load() é síncrono: a biblioteca já está disponível no primeiro render.
  const [scanned, setLibrary] = useState<Library | null>(load);
  const { edits } = usePrefs();

  /*
    As correções do usuário entram aqui, num lugar só.

    O que a varredura leu fica intacto no estado — o `library.json` continua sendo o que os
    arquivos dizem, e uma varredura nova não precisa saber que existem correções. O que o
    app inteiro consome é este `library` corrigido: busca, listas, player, controles do
    sistema e card de compartilhar recebem o texto certo sem nenhum deles saber de
    `edits`. Ver `lib/edits.ts`.

    Sem correção nenhuma, `applyEdits` devolve o mesmo objeto — o `useMemo` abaixo não
    invalida nada e a biblioteca não é remapeada por nada.
  */
  const library = useMemo(() => applyEdits(scanned, edits), [scanned, edits]);

  const byId = useMemo(
    () => new Map((library?.tracks ?? []).map((t) => [t.id, t])),
    [library]
  );
  const albumsById = useMemo(
    () => new Map((library?.albums ?? []).map((a) => [a.id, a])),
    [library]
  );

  const tracksOf = useCallback(
    (album: Album) => album.trackIds.map((id) => byId.get(id)).filter((t) => !!t),
    [byId]
  );

  const artists = useMemo(() => {
    const map = new Map<string, Album[]>();
    for (const album of library?.albums ?? []) {
      const list = map.get(album.artist);
      if (list) list.push(album);
      else map.set(album.artist, [album]);
    }
    return [...map]
      .map(([name, albums]) => ({ name, albums }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [library]);

  const api = useMemo<LibraryApi>(
    () => ({
      library,
      tracksOf,
      trackById: (id) => byId.get(id),
      albumById: (id) => albumsById.get(id),
      artists,
      replace: (next) => {
        save(next);
        setLibrary(next);
      },
      /*
        Um UPDATE de uma linha, e não a biblioteca inteira de volta ao disco.

        Enquanto isto era um `library.json`, importar um `.lrc` reescrevia o índice
        completo — todas as faixas, todos os álbuns — para acender um selo numa. O mesmo
        vale para `removeTracks` abaixo.
      */
      markLyrics: (trackId) => {
        setHasLyrics(trackId);
        setLibrary((prev) =>
          prev
            ? {
                ...prev,
                tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, hasLyrics: true } : t)),
              }
            : prev
        );
      },
      /*
        Álbum que ficou sem faixa nenhuma sai junto: um álbum vazio na grade é uma capa
        que abre numa tela em branco. A varredura seguinte reconstrói tudo de qualquer
        forma — isto é só para a tela não mentir enquanto ela não acontece.
      */
      removeTracks: (trackIds) => {
        deleteTracks(trackIds);
        setLibrary((prev) => {
          if (!prev) return prev;
          const gone = new Set(trackIds);
          const kept = prev.tracks.filter((t) => !gone.has(t.id));
          if (kept.length === prev.tracks.length) return prev;
          const albums = prev.albums
            .map((a) => ({ ...a, trackIds: a.trackIds.filter((id) => !gone.has(id)) }))
            .filter((a) => a.trackIds.length > 0);
          return { ...prev, tracks: kept, albums };
        });
      },
      reset: () => {
        clear();
        setLibrary(null);
      },
    }),
    [library, tracksOf, byId, albumsById, artists]
  );

  return <Ctx value={api}>{children}</Ctx>;
}

export function useLibrary(): LibraryApi {
  const api = use(Ctx);
  if (!api) throw new Error('useLibrary fora de LibraryProvider');
  return api;
}
