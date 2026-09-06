/** A biblioteca em memória, carregada do JSON no boot. */

import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react';

import { clear, load, save, type Album, type Library, type Track } from './scan';

type LibraryApi = {
  library: Library | null;
  tracksOf: (album: Album) => Track[];
  trackById: (id: string) => Track | undefined;
  albumById: (id: string) => Album | undefined;
  artists: { name: string; albums: Album[] }[];
  folders: { path: string; name: string; tracks: Track[] }[];
  replace: (library: Library) => void;
  /** Depois de importar um .lrc, para o selo aparecer sem esperar uma nova varredura. */
  markLyrics: (trackId: string) => void;
  reset: () => void;
};

const Ctx = createContext<LibraryApi | null>(null);

export function LibraryProvider({ children }: { children: ReactNode }) {
  // load() é síncrono: a biblioteca já está disponível no primeiro render.
  const [library, setLibrary] = useState<Library | null>(load);

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

  const folders = useMemo(() => {
    const map = new Map<string, Track[]>();
    for (const track of library?.tracks ?? []) {
      const list = map.get(track.folder);
      if (list) list.push(track);
      else map.set(track.folder, [track]);
    }
    return [...map]
      .map(([path, tracks]) => ({ path, name: path.split('/').filter(Boolean).pop() ?? path, tracks }))
      .sort((a, b) => b.tracks.length - a.tracks.length);
  }, [library]);

  const api = useMemo<LibraryApi>(
    () => ({
      library,
      tracksOf,
      trackById: (id) => byId.get(id),
      albumById: (id) => albumsById.get(id),
      artists,
      folders,
      replace: (next) => {
        save(next);
        setLibrary(next);
      },
      markLyrics: (trackId) =>
        setLibrary((prev) => {
          if (!prev) return prev;
          const next = {
            ...prev,
            tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, hasLyrics: true } : t)),
          };
          save(next);
          return next;
        }),
      reset: () => {
        clear();
        setLibrary(null);
      },
    }),
    [library, tracksOf, byId, albumsById, artists, folders]
  );

  return <Ctx value={api}>{children}</Ctx>;
}

export function useLibrary(): LibraryApi {
  const api = use(Ctx);
  if (!api) throw new Error('useLibrary fora de LibraryProvider');
  return api;
}
