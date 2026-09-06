/**
 * Reprodução. Um único AudioPlayer com fila própria em vez de useAudioPlaylist:
 * setActiveForLockScreen() só existe em AudioPlayer, e sem os controles de tela de
 * bloqueio o Android mata o áudio depois de ~3 min em segundo plano.
 *
 * ponytail: troca de faixa via replace() não é gapless. Trocar por AudioPlaylist no dia
 * em que ela ganhar controles de tela de bloqueio.
 */

import { File, Paths } from 'expo-file-system';
import {
  requestNotificationPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';

import { useLibrary } from './library';
import * as liveActivity from '../../modules/live-activity';
import { continuationFor, moveItem, shuffle as shuffleTracks } from './queue';
import { usePrefs } from './prefs';
import type { Track } from './scan';

type Saved = { trackIds: string[]; index: number; position: number };

const queueFile = () => new File(Paths.document, 'queue.json');

/** Lê a fila persistida e a remapeia para as faixas da biblioteca atual. */
function restore(trackById: (id: string) => Track | undefined): {
  queue: Track[];
  index: number;
  position: number;
} {
  try {
    const file = queueFile();
    if (file.exists) {
      const saved = JSON.parse(file.textSync()) as Saved;
      const queue = saved.trackIds.map(trackById).filter((t) => !!t);
      if (queue.length) {
        return {
          queue,
          index: Math.min(Math.max(0, saved.index), queue.length - 1),
          position: saved.position,
        };
      }
    }
  } catch {
    // fila de uma biblioteca antiga ou JSON corrompido: começa vazia
  }
  return { queue: [], index: 0, position: 0 };
}

type PlayerApi = {
  track: Track | null;
  queue: Track[];
  index: number;
  playing: boolean;
  /** Duração da faixa atual: a do arquivo, ou a que o player descobriu ao carregar. */
  duration: number;
  play: (queue: Track[], index?: number) => void;
  /** Entra logo depois da faixa atual. */
  enqueueNext: (tracks: Track[]) => void;
  /** Entra no fim da fila. */
  enqueueLast: (tracks: Track[]) => void;
  removeAt: (index: number) => void;
  reorder: (from: number, to: number) => void;
  /** Embaralha o que ainda vai tocar; a faixa atual fica onde está. */
  toggleShuffle: () => void;
  /** Há para onde ir? Os botões de transporte precisam disso para se desabilitar. */
  canNext: boolean;
  canPrevious: boolean;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seekTo: (seconds: number) => void;
  /** Só para useAudioPlayerStatus em quem precisa do tempo decorrido. */
  player: ReturnType<typeof useAudioPlayer>;
};

const Ctx = createContext<PlayerApi | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { library, trackById, albumById } = useLibrary();
  const { accent, continuation, repeat, shuffle, setShuffle, countPlay } = usePrefs();

  /**
   * `countPlay` altera as preferências, e o objeto do contexto é recriado a cada
   * alteração. Usá-lo direto nas dependências de `cue` fazia cada reprodução gerar um
   * `cue` novo — e isso re-disparava o efeito de restauração, devolvendo o player à
   * faixa e à posição salvas da sessão anterior.
   */
  const countPlayRef = useRef(countPlay);
  useEffect(() => {
    countPlayRef.current = countPlay;
  }, [countPlay]);

  /**
   * Capa da faixa para os controles do sistema. Por ref pelo mesmo motivo de `countPlay`:
   * `albumById` muda de identidade junto com a biblioteca, e arrastar isso para dentro de
   * `cue` faria a restauração da fila voltar a disparar fora de hora.
   */
  const artworkRef = useRef((albumId: string) => albumById(albumId)?.cover ?? undefined);
  useEffect(() => {
    artworkRef.current = (albumId: string) => albumById(albumId)?.cover ?? undefined;
  }, [albumById]);
  const player = useAudioPlayer(null, { updateInterval: 200 });

  // A fila da sessão anterior é lida de forma síncrona no primeiro render — assim o
  // mini player já aparece montado, sem um quadro vazio antes.
  const saved = useState(() => restore(trackById))[0];
  const [queue, setQueue] = useState<Track[]>(saved.queue);
  const [index, setIndex] = useState(saved.index);
  const [playing, setPlaying] = useState(false);
  // Duração que o próprio player mediu ao abrir o arquivo. Zero até ele carregar.
  const [loadedDuration, setLoadedDuration] = useState(0);

  const track = queue[index] ?? null;

  // A sessão de áudio precisa estar configurada antes do primeiro play.
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    }).catch(() => {});
    // Sem POST_NOTIFICATIONS o Android não mostra os controles — e sem eles, mata o áudio.
    if (Platform.OS === 'android') requestNotificationPermissionsAsync().catch(() => {});
  }, []);

  // Os controles do sistema só aparecem quando há reprodução de fato: ativá-los na
  // restauração mostraria uma notificação de mídia com o app recém-aberto e parado.
  const lockActive = useRef(false);
  const publish = useCallback(
    (item: Track) => {
      const metadata = {
        title: item.title,
        artist: item.artist,
        albumTitle: item.album,
        // A capa extraída fica em file://, que é o que o lado nativo consegue abrir.
        // Faixa sem capa embutida vai sem artwork, e o sistema mostra o ícone do app.
        artworkUrl: artworkRef.current(item.albumId),
      };
      if (lockActive.current) {
        player.updateLockScreenMetadata(metadata);
        return;
      }
      // ponytail: a API só expõe seek. Próxima/anterior na notificação exigiriam
      // controles que expo-audio 57 ainda não oferece.
      player.setActiveForLockScreen(true, metadata, {
        showSeekForward: true,
        showSeekBackward: true,
      });
      lockActive.current = true;
    },
    [player]
  );

  /** Aponta o player para a faixa e, se for tocar, publica os metadados. */
  const cue = useCallback(
    (item: Track, autoplay: boolean, position = 0) => {
      player.replace(item.uri);
      if (position > 0) player.seekTo(position).catch(() => {});
      if (autoplay || lockActive.current) publish(item);
      if (autoplay) {
        countPlayRef.current(item.id);
        player.play();
      }
    },
    [player, publish]
  );

  const load = useCallback(
    (next: Track[], at: number, autoplay: boolean) => {
      const item = next[at];
      if (!item) return;
      setQueue(next);
      setIndex(at);
      // Zera: o valor da faixa anterior não vale para esta, e o índice entra só como
      // estimativa até o player reportar a duração real.
      setLoadedDuration(0);
      cue(item, autoplay);
    },
    [cue]
  );

  const step = useCallback(
    (delta: number) => {
      if (!queue.length) return;
      const next = index + delta;

      // Passou do fim: tenta continuar antes de voltar ao começo. Sem candidato, a fila
      // volta a ser circular, que é o comportamento de sempre.
      if (next >= queue.length) {
        const extra = continuationFor(
          continuation,
          queue[index],
          library?.tracks ?? [],
          new Set(queue.map((t) => t.id))
        );
        if (extra.length) {
          load([...queue, ...extra], queue.length, true);
          return;
        }
      }

      // Sem continuação: 'all' circula, os outros modos param no fim.
      if (next >= queue.length && repeat !== 'all') {
        player.pause();
        return;
      }
      load(queue, (next + queue.length) % queue.length, true);
    },
    [queue, index, load, continuation, library, repeat, player]
  );

  /**
   * Fim natural da faixa. Só aqui a repetição de uma faixa vale — apertar "próxima" com
   * repeat 'one' ainda deve avançar, senão o botão pareceria quebrado.
   */
  const advance = useCallback(() => {
    if (repeat === 'one') {
      player.seekTo(0).catch(() => {});
      player.play();
      return;
    }
    step(1);
  }, [repeat, player, step]);

  const advanceRef = useRef(advance);
  useEffect(() => {
    advanceRef.current = advance;
  }, [advance]);

  // O listener precisa da versão atual de step sem reassinar a cada troca de faixa.
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  useEffect(() => {
    const sub = player.addListener('playbackStatusUpdate', (status) => {
      setPlaying(status.playing);
      if (status.isLoaded && status.duration > 0) setLoadedDuration(status.duration);
      if (status.didJustFinish) advanceRef.current();
    });
    return () => sub.remove();
  }, [player]);

  // Carrega no player o que a sessão anterior estava tocando, pausado e na posição certa.
  // Uma vez só: repetir isto no meio da sessão jogaria o usuário de volta ao ponto salvo.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const item = saved.queue[saved.index];
    if (item) cue(item, false, saved.position);
  }, [saved, cue]);

  // Grava a posição de vez em quando, não a cada tick.
  const lastSaved = useRef(-1);
  useEffect(() => {
    if (!queue.length) return;
    const timer = setInterval(() => {
      const position = Math.floor(player.currentTime);
      if (position === lastSaved.current) return;
      lastSaved.current = position;
      try {
        const snapshot: Saved = { trackIds: queue.map((t) => t.id), index, position };
        queueFile().write(JSON.stringify(snapshot));
      } catch {
        // sem espaço em disco
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [queue, index, player]);

  /**
   * Live Activity: cartão na tela de bloqueio e Dynamic Island no iOS.
   *
   * Publica em eventos — começar, pausar, retomar, trocar de faixa — e não a cada tick:
   * Live Activities têm orçamento de atualizações, e 5 Hz o esgotaria em minutos. Fora do
   * iOS 16.2+ tudo isto é no-op.
   */
  const liveStarted = useRef(false);
  useEffect(() => {
    if (!track) {
      if (liveStarted.current) {
        liveActivity.end();
        liveStarted.current = false;
      }
      return;
    }

    const state = {
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      isPlaying: playing,
      elapsed: player.currentTime,
      duration: loadedDuration || track.duration || 0,
      accentHex: accent,
      artworkPath: artworkRef.current(track.albumId),
    };

    if (liveStarted.current) liveActivity.update(state);
    else if (playing) {
      liveActivity.start(state);
      liveStarted.current = true;
    }
  }, [track, playing, loadedDuration, accent, player]);

  const api = useMemo<PlayerApi>(
    () => ({
      track,
      queue,
      index,
      playing,
      /**
       * A duração do player vence a do índice sempre que existe.
       *
       * O índice guarda uma estimativa: no iOS ela vem do cabeçalho do arquivo, e para
       * MP3 sem Xing é um cálculo por bitrate constante que erra em VBR. Buscar sobre
       * uma duração errada faz o toque cair num tempo diferente do que a barra mostra.
       * O índice serve para preencher a lista antes de tocar; para buscar, vale o player.
       */
      duration: loadedDuration || track?.duration || 0,
      player,
      play: (next, at = 0) => load(next, at, true),
      enqueueNext: (extra) => {
        const fresh = extra.filter((t) => !queue.some((q) => q.id === t.id));
        if (!fresh.length) return;
        setQueue([...queue.slice(0, index + 1), ...fresh, ...queue.slice(index + 1)]);
      },
      enqueueLast: (extra) => {
        const fresh = extra.filter((t) => !queue.some((q) => q.id === t.id));
        if (fresh.length) setQueue([...queue, ...fresh]);
      },
      removeAt: (at) => {
        if (at === index || at < 0 || at >= queue.length) return;
        setQueue(queue.filter((_, i) => i !== at));
        // Tirar algo antes da atual desloca o índice dela.
        if (at < index) setIndex(index - 1);
      },
      reorder: (from, to) => {
        if (from === index || to === index) return;
        setQueue(moveItem(queue, from, to));
      },
      /**
       * ponytail: desligar não restaura a ordem original — guardar a fila anterior só
       * para isso não pagou o estado extra.
       */
      toggleShuffle: () => {
        const on = !shuffle;
        setShuffle(on);
        if (on && index + 1 < queue.length) {
          setQueue([...queue.slice(0, index + 1), ...shuffleTracks(queue.slice(index + 1))]);
        }
      },
      toggle: () => {
        if (player.playing) return player.pause();
        if (track) publish(track);
        player.play();
      },
      next: () => stepRef.current(1),
      previous: () => stepRef.current(-1),
      // Circular só conta como "tem próxima" quando a fila tem mais de uma faixa.
      canNext:
        index + 1 < queue.length ||
        continuation !== 'off' ||
        (repeat === 'all' && queue.length > 1),
      canPrevious: index > 0 || (repeat === 'all' && queue.length > 1),
      seekTo: (seconds) => {
        const limit = loadedDuration || track?.duration || 0;
        const target = limit > 0 ? Math.min(seconds, limit - 0.05) : seconds;
        player.seekTo(Math.max(0, target)).catch(() => {});
      },
    }),
    [
      track,
      queue,
      index,
      playing,
      loadedDuration,
      player,
      load,
      publish,
      shuffle,
      setShuffle,
      continuation,
      repeat,
    ]
  );

  return <Ctx value={api}>{children}</Ctx>;
}

export function usePlayer(): PlayerApi {
  const api = use(Ctx);
  if (!api) throw new Error('usePlayer fora de PlayerProvider');
  return api;
}

/** Tempo decorrido. Só chame em quem realmente precisa: re-renderiza a cada 200 ms. */
export function useElapsed(): number {
  const { player } = usePlayer();
  return useAudioPlayerStatus(player).currentTime;
}
