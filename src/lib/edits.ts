/**
 * As correções de metadados do usuário, aplicadas sobre o que a varredura leu.
 *
 * Elas ficam **no app**, não no arquivo. Escrever tag exige um gravador por formato,
 * permissão de escrita no MediaStore ou no SAF, e um erro ali corrompe a música do
 * usuário. Guardadas aqui, a correção é reversível, vale para qualquer formato — inclusive
 * os que a gente só sabe ler — e nada no aparelho muda de lugar.
 *
 * O preço: fora do Resonate o arquivo continua com a tag errada. É o troco por não
 * arriscar o acervo de ninguém.
 *
 * `applyEdits` roda no `LibraryProvider`, então todo o resto do app — busca, listas,
 * player, controles do sistema, card de compartilhar — já recebe o texto corrigido.
 */

import type { Album, Library, Track } from './scan';

/** O que se pode corrigir numa faixa. Campo ausente quer dizer "o que a tag disser". */
export type TrackEdit = {
  title?: string;
  artist?: string;
  album?: string;
  trackNumber?: number | null;
  genre?: string | null;
};

export type Edits = {
  /** Por id de faixa. Editar um álbum em lote escreve uma entrada por faixa dele. */
  tracks: Record<string, TrackEdit>;
  /**
   * Renome de artista, do nome antigo para o novo.
   *
   * Uma entrada, e não uma por faixa: renomear alguém com 500 faixas não deve inflar o
   * prefs.json com 500 cópias do mesmo texto.
   */
  artists: Record<string, string>;
};

export const NO_EDITS: Edits = { tracks: {}, artists: {} };

export const hasEdits = (edits: Edits): boolean =>
  Object.keys(edits.tracks).length > 0 || Object.keys(edits.artists).length > 0;

/** A faixa como o usuário quer vê-la. */
export function editTrack(track: Track, edits: Edits): Track {
  const patch = edits.tracks[track.id];
  const artist = patch?.artist ?? track.artist;
  const albumArtist = track.albumArtist;
  const next: Track = {
    ...track,
    ...patch,
    // O renome de artista entra depois da edição da faixa: quem corrigiu o nome desta
    // faixa à mão já disse o que queria, e o renome é uma regra geral.
    artist: edits.artists[artist] ?? artist,
    albumArtist: albumArtist ? (edits.artists[albumArtist] ?? albumArtist) : null,
  };
  return next;
}

/**
 * O álbum relido a partir das faixas dele.
 *
 * O `id` **não** muda: ele é o hash de artista + álbum que a varredura calculou, e é a
 * chave de curtida de álbum, de marca de podcast e de sessão de leitura. Recalcular o id
 * ao corrigir o título perderia as três de uma vez.
 */
function editAlbum(album: Album, byId: Map<string, Track>): Album {
  const first = album.trackIds.map((id) => byId.get(id)).find((t) => !!t);
  if (!first) return album;
  return { ...album, title: first.album, artist: first.albumArtist ?? first.artist };
}

export function applyEdits(library: Library | null, edits: Edits): Library | null {
  if (!library || !hasEdits(edits)) return library;
  const tracks = library.tracks.map((t) => editTrack(t, edits));
  const byId = new Map(tracks.map((t) => [t.id, t]));
  return { ...library, tracks, albums: library.albums.map((a) => editAlbum(a, byId)) };
}
