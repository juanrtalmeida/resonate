/**
 * Busca sobre a biblioteca já carregada em memória. Sem índice invertido: são milhares
 * de itens, não milhões, e uma varredura linear por consulta é imperceptível.
 */

import type { Album, Track } from './scan';

/**
 * Minúsculas e sem acento, para "Kō" casar com "ko" e "Órion" com "orion".
 * `normalize` depende do ICU, que nem toda build do Hermes traz — daí o fallback.
 */
export function fold(text: string): string {
  const lower = text.toLowerCase();
  try {
    return lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch {
    return lower;
  }
}

export type Results = {
  albums: Album[];
  artists: string[];
  tracks: Track[];
};

/** Teto por seção: o suficiente para achar, pouco o bastante para não travar a lista. */
const LIMIT = 20;

export function search(query: string, tracks: Track[], albums: Album[]): Results {
  const needle = fold(query.trim());
  if (!needle) return { albums: [], artists: [], tracks: [] };

  const matchedAlbums: Album[] = [];
  for (const album of albums) {
    if (fold(`${album.title} ${album.artist}`).includes(needle)) matchedAlbums.push(album);
    if (matchedAlbums.length === LIMIT) break;
  }

  const artists = new Set<string>();
  const matchedTracks: Track[] = [];
  for (const track of tracks) {
    if (artists.size < LIMIT && fold(track.artist).includes(needle)) artists.add(track.artist);
    if (matchedTracks.length < LIMIT && fold(`${track.title} ${track.artist}`).includes(needle)) {
      matchedTracks.push(track);
    }
    if (artists.size >= LIMIT && matchedTracks.length >= LIMIT) break;
  }

  return { albums: matchedAlbums, artists: [...artists], tracks: matchedTracks };
}

export const isEmpty = (r: Results) =>
  !r.albums.length && !r.artists.length && !r.tracks.length;
