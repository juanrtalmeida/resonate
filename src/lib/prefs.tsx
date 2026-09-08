/** Acento, tratamento do Now Playing e curtidas. Um JSON, um contexto. */

import { File, Paths } from 'expo-file-system';
import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react';

import { ACCENTS, type Accent } from '@/constants/theme';
import { isHex } from './color';
import type { Continuation } from './queue';
import type { SpokenMarks } from './spoken';

export type Treatment = 'ember' | 'vinyl' | 'wave';

/** Como a aba de álbuns se apresenta: a grade de sempre ou o carrossel de capas. */
export type AlbumView = 'grid' | 'carousel';

type Prefs = {
  accent: Accent;
  treatment: Treatment;
  /** Faixas curtidas, pelo id da faixa — que é a URI do arquivo. */
  liked: string[];
  /** Álbuns curtidos. Lista à parte: o id do álbum não é o id de faixa nenhuma. */
  likedAlbums: string[];
  /** Pastas escolhidas no onboarding; vazio = tudo o que a fonte devolver. */
  sources: string[];
  /** Pastas concedidas pelo seletor do sistema (SAF), além do que o MediaStore indexa. */
  granted: string[];
  /** Quantas vezes cada faixa foi tocada. Só guarda o que já tocou ao menos uma vez. */
  plays: Record<string, number>;
  /**
   * Onde a escuta parou, em segundos, por faixa.
   *
   * Só o que é falado entra aqui: canção se ouve do começo, e guardar posição de cada
   * faixa de música inflaria o arquivo com o que ninguém vai usar. Ver `lib/spoken.ts`.
   *
   * A entrada é apagada quando o episódio termina — retomar no fim seria pior que não
   * retomar.
   */
  progress: Record<string, number>;
  /** Marcas manuais de podcast/audiolivro, por álbum. */
  spoken: SpokenMarks;
  /** Como a aba de álbuns se apresenta. */
  albumView: AlbumView;
  /** O que fazer quando a fila acaba. */
  continuation: Continuation;
  shuffle: boolean;
  repeat: Repeat;
};

export type Repeat = 'off' | 'all' | 'one';

const DEFAULTS: Prefs = {
  accent: ACCENTS[0],
  treatment: 'ember',
  liked: [],
  likedAlbums: [],
  sources: [],
  granted: [],
  plays: {},
  progress: {},
  spoken: {},
  albumView: 'grid',
  continuation: 'album',
  shuffle: false,
  repeat: 'all',
};

const prefsFile = () => new File(Paths.document, 'prefs.json');

const toggle = (list: string[], id: string) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

function read(): Prefs {
  try {
    const file = prefsFile();
    if (!file.exists) return DEFAULTS;
    return migrate({ ...DEFAULTS, ...(JSON.parse(file.textSync()) as Partial<Prefs>) });
  } catch {
    return DEFAULTS;
  }
}

/**
 * Curtida de álbum morava na mesma lista das faixas. Separar sem perder o que já estava
 * curtido é possível porque as duas chaves têm formatos diferentes: o id de faixa é a
 * URI do arquivo, e nenhum id de álbum — um hash curto — tem `://`.
 */
function migrate(prefs: Prefs): Prefs {
  // O acento é hex livre desde o seletor: o arquivo é nosso, mas uma cor quebrada ali
  // não pinta um botão errado — ela vira `undefined` em todo estilo que a usa.
  const accent = isHex(prefs.accent) ? prefs.accent : DEFAULTS.accent;
  if (prefs.likedAlbums.length || prefs.liked.every((id) => id.includes('://'))) {
    return accent === prefs.accent ? prefs : { ...prefs, accent };
  }
  return {
    ...prefs,
    accent,
    liked: prefs.liked.filter((id) => id.includes('://')),
    likedAlbums: prefs.liked.filter((id) => !id.includes('://')),
  };
}

type PrefsApi = Prefs & {
  liked: string[];
  isLiked: (id: string) => boolean;
  toggleLike: (id: string) => void;
  isAlbumLiked: (id: string) => boolean;
  toggleAlbumLike: (id: string) => void;
  setAccent: (a: Accent) => void;
  setTreatment: (t: Treatment) => void;
  setSources: (s: string[]) => void;
  grantFolder: (uri: string) => void;
  countPlay: (trackId: string) => void;
  playsOf: (trackId: string) => number;
  /** Guarda onde a escuta parou. Zero ou fim de faixa apaga a entrada. */
  mark: (trackId: string, position: number, done?: boolean) => void;
  progressOf: (trackId: string) => number;
  /** Trata o álbum como podcast, audiolivro ou música — sobrescreve tag e duração. */
  setSpoken: (albumId: string, kind: SpokenMarks[string] | null) => void;
  setAlbumView: (v: AlbumView) => void;
  setContinuation: (c: Continuation) => void;
  setShuffle: (on: boolean) => void;
  setRepeat: (r: Repeat) => void;
};

const Ctx = createContext<PrefsApi | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(read);

  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        prefsFile().write(JSON.stringify(next));
      } catch {
        // sem espaço em disco: vale só para esta sessão
      }
      return next;
    });
  }, []);

  const api = useMemo<PrefsApi>(
    () => ({
      ...prefs,
      isLiked: (id) => prefs.liked.includes(id),
      toggleLike: (id) => update({ liked: toggle(prefs.liked, id) }),
      isAlbumLiked: (id) => prefs.likedAlbums.includes(id),
      toggleAlbumLike: (id) => update({ likedAlbums: toggle(prefs.likedAlbums, id) }),
      setAccent: (accent) => update({ accent }),
      setTreatment: (treatment) => update({ treatment }),
      setSources: (sources) => update({ sources }),
      grantFolder: (uri) =>
        update({ granted: prefs.granted.includes(uri) ? prefs.granted : [...prefs.granted, uri] }),
      countPlay: (trackId) =>
        update({ plays: { ...prefs.plays, [trackId]: (prefs.plays[trackId] ?? 0) + 1 } }),
      playsOf: (trackId) => prefs.plays[trackId] ?? 0,
      mark: (trackId, position, done) => {
        // Menos de 20 s não é "onde parei", é o começo: retomar aí só atrapalha.
        if (done || position < 20) {
          if (prefs.progress[trackId] == null) return;
          const rest = { ...prefs.progress };
          delete rest[trackId];
          update({ progress: rest });
          return;
        }
        if (Math.round(prefs.progress[trackId] ?? -1) === Math.round(position)) return;
        update({ progress: { ...prefs.progress, [trackId]: position } });
      },
      progressOf: (trackId) => prefs.progress[trackId] ?? 0,
      setSpoken: (albumId, kind) => {
        const next = { ...prefs.spoken };
        if (kind) next[albumId] = kind;
        else delete next[albumId];
        update({ spoken: next });
      },
      setAlbumView: (albumView) => update({ albumView }),
      setContinuation: (continuation) => update({ continuation }),
      setShuffle: (shuffle) => update({ shuffle }),
      setRepeat: (repeat) => update({ repeat }),
    }),
    [prefs, update]
  );

  return <Ctx value={api}>{children}</Ctx>;
}

export function usePrefs(): PrefsApi {
  const api = use(Ctx);
  if (!api) throw new Error('usePrefs fora de PrefsProvider');
  return api;
}
