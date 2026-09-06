/** Acento, tratamento do Now Playing e curtidas. Um JSON, um contexto. */

import { File, Paths } from 'expo-file-system';
import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react';

import { ACCENTS, type Accent } from '@/constants/theme';
import type { Continuation } from './queue';

export type Treatment = 'ember' | 'vinyl' | 'wave';

type Prefs = {
  accent: Accent;
  treatment: Treatment;
  liked: string[];
  /** Pastas escolhidas no onboarding; vazio = tudo o que a fonte devolver. */
  sources: string[];
  /** Pastas concedidas pelo seletor do sistema (SAF), além do que o MediaStore indexa. */
  granted: string[];
  /** Quantas vezes cada faixa foi tocada. Só guarda o que já tocou ao menos uma vez. */
  plays: Record<string, number>;
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
  sources: [],
  granted: [],
  plays: {},
  continuation: 'album',
  shuffle: false,
  repeat: 'all',
};

const prefsFile = () => new File(Paths.document, 'prefs.json');

function read(): Prefs {
  try {
    const file = prefsFile();
    if (!file.exists) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(file.textSync()) as Partial<Prefs>) };
  } catch {
    return DEFAULTS;
  }
}

type PrefsApi = Prefs & {
  liked: string[];
  isLiked: (id: string) => boolean;
  toggleLike: (id: string) => void;
  setAccent: (a: Accent) => void;
  setTreatment: (t: Treatment) => void;
  setSources: (s: string[]) => void;
  grantFolder: (uri: string) => void;
  countPlay: (trackId: string) => void;
  playsOf: (trackId: string) => number;
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
      toggleLike: (id) =>
        update({
          liked: prefs.liked.includes(id)
            ? prefs.liked.filter((x) => x !== id)
            : [...prefs.liked, id],
        }),
      setAccent: (accent) => update({ accent }),
      setTreatment: (treatment) => update({ treatment }),
      setSources: (sources) => update({ sources }),
      grantFolder: (uri) =>
        update({ granted: prefs.granted.includes(uri) ? prefs.granted : [...prefs.granted, uri] }),
      countPlay: (trackId) =>
        update({ plays: { ...prefs.plays, [trackId]: (prefs.plays[trackId] ?? 0) + 1 } }),
      playsOf: (trackId) => prefs.plays[trackId] ?? 0,
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
