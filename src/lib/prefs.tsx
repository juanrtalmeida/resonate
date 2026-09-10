/** Acento, tratamento do Now Playing e curtidas. Um JSON, um contexto. */

import { File, Paths } from 'expo-file-system';
import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react';

import { ACCENTS, type Accent } from '@/constants/theme';
import { isHex } from './color';
import { NO_EDITS, type Edits, type TrackEdit } from './edits';
import { resolveLang, translate, type Key, type Lang } from './i18n';
import type { Continuation } from './queue';
import type { SpokenMarks } from './spoken';
import type { Leveling } from './gain';
import { addCounts, furthest, union, type BackupPrefs } from './backup';
import { absolute, portable, portableAll, portableKeys } from './storage';
import { connect, disconnect, type Server } from './subsonic';

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
  /**
   * O que foi ouvido até o fim, por id de faixa.
   *
   * Não dá para deduzir de `progress`: a entrada de lá é apagada quando o episódio
   * termina, e um capítulo terminado fica com o mesmo zero de um que nunca começou. É
   * esta lista que sabe a diferença — e é dela que sai a conta das sessões de leitura.
   */
  heard: string[];
  /** Tamanho da sessão de leitura, em minutos, por álbum. Zero ou ausente = desligado. */
  sessions: Record<string, number>;
  /** Correções de metadados feitas pelo usuário. Ver `lib/edits.ts`. */
  edits: Edits;
  /**
   * Idioma da interface. `auto` segue o aparelho.
   *
   * `auto` é o padrão de propósito: quem já usava o app em português continua em português
   * sem ter de escolher nada, e um aparelho em japonês abre em japonês na primeira vez.
   */
  language: Lang | 'auto';
  /** Como a aba de álbuns se apresenta. */
  albumView: AlbumView;
  /**
   * Desenhar a interface com os componentes do sistema em vez dos nossos.
   *
   * Ligado, a barra inferior e a tela de Ajustes passam a ser SwiftUI no iOS — com o
   * Liquid Glass de verdade, não uma imitação em gradiente — e Jetpack Compose no
   * Android, com o Material 3 do aparelho. Ver `lib/native-ui.ts`.
   *
   * Desligado de padrão, e é a escolha certa: o desenho do Resonate é o app, e quem
   * prefere o do sistema pede. A preferência é guardada mesmo em aparelho que não sabe
   * desenhar o vidro — o flag é do usuário, e a capacidade é do aparelho.
   */
  nativeUI: boolean;
  /** O que fazer quando a fila acaba. */
  continuation: Continuation;
  shuffle: boolean;
  repeat: Repeat;
  /**
   * Nivelamento de volume por ReplayGain. Ver `lib/gain.ts`.
   *
   * Padrão `album`, e não `off`: quem tem a tag no arquivo quer o volume parelho, e quem
   * não tem não sente diferença nenhuma — sem tag o fator é 1. `album` em vez de `track`
   * porque preserva a dinâmica dentro do disco.
   */
  leveling: Leveling;
  /**
   * Servidor OpenSubsonic do usuário, ou null quando só há arquivos locais.
   *
   * A senha fica aqui em claro, e não há como não ficar: o esquema de autenticação do
   * Subsonic exige a senha para derivar `md5(senha + salt)` a cada sessão, então guardar
   * só o token não permitiria reconectar depois de reiniciar o app. É o mesmo que todo
   * cliente Subsonic faz, e `prefs.json` já vive na pasta privada do app — mas vale saber
   * que é o dado mais sensível que este arquivo carrega.
   */
  server: Server | null;
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
  heard: [],
  sessions: {},
  edits: NO_EDITS,
  language: 'auto',
  albumView: 'grid',
  nativeUI: false,
  continuation: 'album',
  shuffle: false,
  repeat: 'all',
  leveling: 'album',
  server: null,
};

const prefsFile = () => new File(Paths.document, 'prefs.json');

const toggle = (list: string[], id: string) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

function read(): Prefs {
  try {
    const file = prefsFile();
    if (!file.exists) return DEFAULTS;
    return up(migrate({ ...DEFAULTS, ...(JSON.parse(file.textSync()) as Partial<Prefs>) }));
  } catch {
    return DEFAULTS;
  }
}

/*
  Caminhos, na entrada e na saída.

  Quase tudo aqui é chaveado pelo id da faixa, que é o caminho dela em forma portátil —
  ver `lib/paths.ts`. Este arquivo é anterior a essa decisão, então as chaves de uma
  instalação existente são URIs absolutas amarradas ao container antigo do iOS. Converter
  na leitura é o que faz curtidas, contagens e progresso continuarem a encontrar a faixa
  depois de o container mudar; como `toPortable` é idempotente, converter de novo não
  custa nada e não corrói.

  `sources` é o caso oposto: a interface e a varredura falam em caminho absoluto, porque é
  com ele que se compara pasta. Então ele desce portátil e sobe absoluto — e é o único.

  `granted`, `likedAlbums`, `spoken` e `sessions` passam intactos: SAF e ids de álbum já
  são estáveis, e as conversões os deixam como estão.
*/
const up = (prefs: Prefs): Prefs => ({
  ...prefs,
  liked: portableAll(prefs.liked),
  heard: portableAll(prefs.heard),
  plays: portableKeys(prefs.plays),
  progress: portableKeys(prefs.progress),
  edits: { ...prefs.edits, tracks: portableKeys(prefs.edits.tracks) },
  sources: prefs.sources.map(absolute),
});

const down = (prefs: Prefs): Prefs => ({ ...prefs, sources: prefs.sources.map(portable) });

/**
 * Curtida de álbum morava na mesma lista das faixas. Separar sem perder o que já estava
 * curtido é possível porque as duas chaves têm formatos diferentes: o id de faixa é a
 * URI do arquivo, e nenhum id de álbum — um hash curto — tem `://`.
 */
function migrate(prefs: Prefs): Prefs {
  // O acento é hex livre desde o seletor: o arquivo é nosso, mas uma cor quebrada ali
  // não pinta um botão errado — ela vira `undefined` em todo estilo que a usa.
  const accent = isHex(prefs.accent) ? prefs.accent : DEFAULTS.accent;
  // Arquivo de uma versão anterior não tem estes campos, e `{...DEFAULTS}` só cobre o que
  // falta — não o que veio como `null` de um JSON meio escrito.
  const edits: Edits = {
    tracks: prefs.edits?.tracks ?? {},
    artists: prefs.edits?.artists ?? {},
  };
  const heard = prefs.heard ?? [];
  const language = prefs.language ?? DEFAULTS.language;
  const sessions = prefs.sessions ?? {};
  prefs = { ...prefs, edits, heard, sessions, language };
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
  isHeard: (trackId: string) => boolean;
  /** Tamanho da sessão de leitura do álbum, em minutos. Zero = desligado. */
  sessionOf: (albumId: string) => number;
  setSession: (albumId: string, minutes: number) => void;
  /** Corrige os metadados de uma ou mais faixas de uma vez. */
  editTracks: (trackIds: string[], patch: TrackEdit) => void;
  /** Renomeia um artista em toda a biblioteca. */
  renameArtist: (from: string, to: string) => void;
  /** Devolve as faixas ao que a tag diz. */
  clearEdits: (trackIds: string[]) => void;
  setLanguage: (language: Lang | 'auto') => void;
  setAlbumView: (v: AlbumView) => void;
  setNativeUI: (on: boolean) => void;
  setContinuation: (c: Continuation) => void;
  setShuffle: (on: boolean) => void;
  setRepeat: (r: Repeat) => void;
  setLeveling: (l: Leveling) => void;
  /**
   * Guarda o servidor e abre a sessão. `null` desconecta e esquece a senha.
   *
   * Não valida — quem confirma que o servidor responde é a tela de Ajustes, com `ping`.
   * Ver `lib/subsonic.ts`.
   */
  setServer: (server: Server | null) => void;
  /**
   * Devolve o que um backup trouxe, **unido** ao que já está aqui. Ver `lib/backup.ts`.
   *
   * Une em vez de substituir porque quem restaura pode já ter usado o app antes de lembrar
   * do backup, e apagar o que ele fez nesse meio-tempo seria uma surpresa ruim.
   */
  restore: (prefs: BackupPrefs) => void;
};

/**
 * As correções do backup por cima das de agora.
 *
 * `edits` vem do arquivo como `unknown` — `lib/backup.ts` é puro e não conhece a forma
 * dele. O saneamento é aqui, onde a forma vive, e no mesmo formato defensivo de `migrate`:
 * campo que não é objeto simplesmente não entra.
 */
function mergeEdits(current: Edits, incoming: unknown): Edits {
  if (typeof incoming !== 'object' || incoming === null) return current;
  const raw = incoming as { tracks?: unknown; artists?: unknown };
  const tracks = typeof raw.tracks === 'object' && raw.tracks ? raw.tracks : {};
  const artists = typeof raw.artists === 'object' && raw.artists ? raw.artists : {};
  return {
    tracks: { ...current.tracks, ...portableKeys(tracks as Record<string, TrackEdit>) },
    artists: { ...current.artists, ...(artists as Record<string, string>) },
  };
}

const Ctx = createContext<PrefsApi | null>(null);

/**
 * Abre a sessão do servidor guardado, uma vez, antes do primeiro render.
 *
 * No módulo e não num efeito: `absolute()` resolve `sub://` pela sessão em memória (ver
 * `lib/storage.ts`), e ela é chamada já no primeiro render — pela biblioteca carregada do
 * disco, que pode ter faixas remotas. Num efeito, esse primeiro render veria as faixas
 * remotas como indisponíveis e só se corrigiria no seguinte.
 *
 * `connect` é síncrona justamente para isto: o MD5 é o nosso, não o assíncrono do
 * `expo-crypto`.
 */
function reconnect(server: Server | null): void {
  if (server) connect(server);
  else disconnect();
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(() => {
    const stored = read();
    reconnect(stored.server);
    return stored;
  });

  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        prefsFile().write(JSON.stringify(down(next)));
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
          const rest = { ...prefs.progress };
          const had = rest[trackId] != null;
          delete rest[trackId];
          // Terminar entra na lista de ouvidos; parar no primeiro minuto, não.
          const heard =
            done && !prefs.heard.includes(trackId) ? [...prefs.heard, trackId] : prefs.heard;
          if (!had && heard === prefs.heard) return;
          update({ progress: rest, heard });
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
      isHeard: (trackId) => prefs.heard.includes(trackId),
      sessionOf: (albumId) => prefs.sessions[albumId] ?? 0,
      setSession: (albumId, minutes) => {
        const next = { ...prefs.sessions };
        if (minutes > 0) next[albumId] = minutes;
        else delete next[albumId];
        update({ sessions: next });
      },
      /*
        Uma entrada por faixa, mesmo editando um álbum inteiro: o álbum é um registro
        derivado das faixas (ver `lib/edits.ts`), e a correção tem de morar em quem a
        varredura vai reler. Álbum tem dezenas de faixas, não centenas — o renome de
        artista, que pega centenas, é o que ganhou entrada própria.
      */
      editTracks: (trackIds, patch) => {
        const tracks = { ...prefs.edits.tracks };
        for (const id of trackIds) tracks[id] = { ...tracks[id], ...patch };
        update({ edits: { ...prefs.edits, tracks } });
      },
      renameArtist: (from, to) => {
        const artists = { ...prefs.edits.artists };
        // Renomear de volta ao nome original tira a regra em vez de gravar a identidade.
        if (to === from) delete artists[from];
        else artists[from] = to;
        update({ edits: { ...prefs.edits, artists } });
      },
      setLanguage: (language) => update({ language }),
      clearEdits: (trackIds) => {
        const tracks = { ...prefs.edits.tracks };
        for (const id of trackIds) delete tracks[id];
        update({ edits: { ...prefs.edits, tracks } });
      },
      setAlbumView: (albumView) => update({ albumView }),
      setNativeUI: (nativeUI) => update({ nativeUI }),
      setContinuation: (continuation) => update({ continuation }),
      setShuffle: (shuffle) => update({ shuffle }),
      setRepeat: (repeat) => update({ repeat }),
      setLeveling: (leveling) => update({ leveling }),
      restore: (incoming) => {
        update({
          liked: union(prefs.liked, portableAll(incoming.liked)),
          likedAlbums: union(prefs.likedAlbums, incoming.likedAlbums),
          heard: union(prefs.heard, portableAll(incoming.heard)),
          plays: addCounts(prefs.plays, portableKeys(incoming.plays)),
          // Progresso não soma: a posição mais adiantada vence.
          progress: furthest(prefs.progress, portableKeys(incoming.progress)),
          // As marcas do backup vencem: são escolha explícita de quem marcou o álbum.
          spoken: { ...prefs.spoken, ...(incoming.spoken as SpokenMarks) },
          sessions: { ...prefs.sessions, ...incoming.sessions },
          edits: mergeEdits(prefs.edits, incoming.edits),
        });
      },
      setServer: (server) => {
        // A sessão abre **antes** de gravar: o re-render que vem do `update` já vai
        // encontrar `absolute()` resolvendo as faixas remotas.
        reconnect(server);
        update({ server });
      },
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

/**
 * O idioma em vigor. Serve para `toLocaleDateString` e afins.
 *
 * Aqui, e não em `i18n.ts`: o dicionário é puro para poder ser testado fora do React, e é
 * a escolha do idioma que é preferência. Quem lê a preferência mora onde ela mora.
 */
export function useLang(): Lang {
  return resolveLang(usePrefs().language);
}

/**
 * `const t = useT()` e depois `t('nav.library')`.
 *
 * As chaves são tipadas: escrever uma que não existe não compila. É isso que substitui o
 * "arquivo de tradução que ninguém sabe se está completo".
 */
export function useT() {
  const lang = useLang();
  return useCallback(
    (key: Key, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang]
  );
}
