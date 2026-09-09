/**
 * Playlists. Guardadas fora de `library.json` porque não são derivadas da varredura:
 * uma nova varredura reescreve a biblioteca inteira e não pode levar as listas junto.
 */

import { Directory, File, Paths } from 'expo-file-system';
import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react';

import { hash } from './artwork';
import { moveItem } from './queue';
import { absolute, portable, portableAll } from './storage';

export type Playlist = {
  id: string;
  name: string;
  /** Ids das faixas, na ordem escolhida pelo usuário. Ver `Track.id` em `lib/scan.ts`. */
  trackIds: string[];
  createdAt: number;
  /** Capa escolhida pelo usuário, já copiada para dentro do app. */
  cover?: string | null;
};

const file = () => new File(Paths.document, 'playlists.json');

/*
  Os ids de faixa e a capa passam pela conversão de caminho — ver `lib/paths.ts`. Uma
  lista montada antes dessa mudança guarda URIs absolutas amarradas ao container antigo
  do iOS, e sem isto ela abriria vazia depois de uma reinstalação: as faixas existem, mas
  com outro id. `toPortable` é idempotente, então isto vale de migração e de rotina.
*/
const up = (p: Playlist): Playlist => ({
  ...p,
  trackIds: portableAll(p.trackIds),
  cover: p.cover ? absolute(p.cover) : p.cover,
});

const down = (p: Playlist): Playlist => ({ ...p, cover: p.cover ? portable(p.cover) : p.cover });

function read(): Playlist[] {
  try {
    const f = file();
    if (!f.exists) return [];
    const parsed = JSON.parse(f.textSync()) as Playlist[];
    return Array.isArray(parsed) ? parsed.map(up) : [];
  } catch {
    return [];
  }
}

/**
 * Copia a imagem escolhida para dentro do app.
 *
 * A cópia é necessária: o que o seletor devolve é um acesso temporário, que não vale
 * depois de a tela fechar. O nome carrega um carimbo de tempo porque o React Native
 * cacheia imagens por URI — reusar o mesmo caminho mostraria a capa antiga.
 */
async function copyCover(id: string): Promise<string | null> {
  const picked = await File.pickFileAsync({ mimeTypes: ['image/*'] });
  if (picked.canceled) return null;
  try {
    const folder = new Directory(Paths.document, 'covers');
    if (!folder.exists) folder.create({ intermediates: true });
    deleteCover(id);
    const extension = picked.result.extension || '.jpg';
    const target = new File(folder, `playlist-${id}-${Date.now()}${extension}`);
    await picked.result.copy(target);
    return target.uri;
  } catch {
    return null; // arquivo ilegível ou sem espaço: segue com a arte procedural
  }
}

/** Apaga capas anteriores desta lista, para não acumular arquivos órfãos. */
function deleteCover(id: string): void {
  try {
    for (const entry of new Directory(Paths.document, 'covers').list()) {
      if (entry instanceof File && entry.name.startsWith(`playlist-${id}-`)) entry.delete();
    }
  } catch {
    // pasta ainda não existe, ou arquivo em uso
  }
}

type PlaylistsApi = {
  playlists: Playlist[];
  byId: (id: string) => Playlist | undefined;
  create: (name: string) => Playlist;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  /** Não duplica: uma faixa aparece uma vez por lista. */
  addTracks: (id: string, trackIds: string[]) => void;
  removeTrack: (id: string, trackId: string) => void;
  /**
   * Move uma faixa de posição dentro da lista.
   *
   * A ordem de uma lista é escolha de quem a montou — é o que separa uma lista de um
   * filtro. Até aqui ela era a ordem de inserção, e não havia como mudá-la.
   */
  moveTrack: (id: string, from: number, to: number) => void;
  /** Abre o seletor do sistema e guarda a imagem escolhida como capa. */
  pickCover: (id: string) => Promise<void>;
  clearCover: (id: string) => void;
};

const Ctx = createContext<PlaylistsApi | null>(null);

export function PlaylistsProvider({ children }: { children: ReactNode }) {
  const [playlists, setPlaylists] = useState<Playlist[]>(read);

  const commit = useCallback((next: Playlist[]) => {
    setPlaylists(next);
    try {
      file().write(JSON.stringify(next.map(down)));
    } catch {
      // sem espaço em disco: vale só para esta sessão
    }
  }, []);

  const api = useMemo<PlaylistsApi>(() => {
    const patch = (id: string, change: (p: Playlist) => Playlist) =>
      commit(playlists.map((p) => (p.id === id ? change(p) : p)));

    return {
      playlists,
      byId: (id) => playlists.find((p) => p.id === id),
      create: (name) => {
        const created: Playlist = {
          id: `${hash(`${name}${Date.now()}`).toString(36)}`,
          name: name.trim() || 'Nova lista',
          trackIds: [],
          createdAt: Date.now(),
        };
        commit([created, ...playlists]);
        return created;
      },
      rename: (id, name) => patch(id, (p) => ({ ...p, name: name.trim() || p.name })),
      remove: (id) => commit(playlists.filter((p) => p.id !== id)),
      addTracks: (id, trackIds) =>
        patch(id, (p) => ({
          ...p,
          trackIds: [...p.trackIds, ...trackIds.filter((t) => !p.trackIds.includes(t))],
        })),
      removeTrack: (id, trackId) =>
        patch(id, (p) => ({ ...p, trackIds: p.trackIds.filter((t) => t !== trackId) })),
      // `moveItem` é o mesmo da fila: reordenar uma lista e reordenar a fila são a mesma
      // operação, e ele já não muta e já ignora índice fora do intervalo.
      moveTrack: (id, from, to) =>
        patch(id, (p) => ({ ...p, trackIds: moveItem(p.trackIds, from, to) })),
      pickCover: async (id) => {
        const uri = await copyCover(id);
        if (uri) patch(id, (p) => ({ ...p, cover: uri }));
      },
      clearCover: (id) => {
        deleteCover(id);
        patch(id, (p) => ({ ...p, cover: null }));
      },
    };
  }, [playlists, commit]);

  return <Ctx value={api}>{children}</Ctx>;
}

export function usePlaylists(): PlaylistsApi {
  const api = use(Ctx);
  if (!api) throw new Error('usePlaylists fora de PlaylistsProvider');
  return api;
}
