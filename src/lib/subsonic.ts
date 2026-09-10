/**
 * Cliente OpenSubsonic: o acervo de um servidor do próprio usuário, no mesmo índice da
 * biblioteca local.
 *
 * O app nasceu só com arquivos locais. Isto abre o segundo caminho sem abrir um segundo
 * app: o que vem do servidor entra em `Library` como qualquer faixa, então grade de
 * álbuns, Artistas, Faixas, Busca, Escuta, playlists e o menu do toque longo funcionam
 * sobre os dois acervos sem uma linha de código nova em nenhuma dessas telas.
 *
 * ## O que faz isso ser barato: `id` e `uri` já são coisas diferentes
 *
 * `Track.id` é identidade (e chave de curtidas, progresso, listas, fila); `Track.uri` é
 * onde o áudio está *agora*, derivado na leitura e nunca gravado — ver `lib/paths.ts`. A
 * separação existe por causa do UUID de container do iOS, e serve aqui inteira: a faixa
 * remota guarda `sub://<servidor>/<id>` como identidade e resolve para uma URL de stream
 * na hora de tocar.
 *
 * `toPortable`/`toAbsolute` deixam passar intacto o que não é `doc://`, então nenhuma das
 * duas precisou saber que `sub://` existe.
 *
 * ## Autenticação
 *
 * Token e salt, não senha em claro: `token = md5(senha + salt)`, que é o esquema que todo
 * servidor Subsonic aceita — o `p=` em claro é legado e vaza a senha em qualquer log de
 * proxy pelo caminho.
 *
 * O par é calculado **uma vez, na conexão**, e não por requisição: o salt não precisa
 * girar — o servidor só recalcula o mesmo hash — e é assim que os clientes de referência
 * fazem. Com o par pronto em memória, montar a URL de stream é aritmética de string, o que
 * deixa `absolute()` síncrona (ela é chamada de dentro do render e do caminho de play).
 *
 * O MD5 é o nosso, de `lib/md5.ts`, e não o do `expo-crypto`: são trinta linhas de
 * aritmética inteira contra um módulo nativo que obrigaria rebuild — e o de lá é
 * assíncrono, o que contaminaria `absolute()`. Ver o cabeçalho de `md5.ts`.
 *
 * A senha fica nas preferências, porque reconectar depois de reiniciar o app não pode
 * exigir digitá-la de novo. Não há como evitar guardá-la: o esquema do Subsonic exige a
 * senha em claro para derivar o token a cada sessão.
 */

import { hash } from './artwork';
import { md5 } from './md5';
import type { Album, Track } from './scan';

/** O que o app se identifica como para o servidor. Aparece nos logs dele. */
const CLIENT = 'resonate';

/**
 * Versão da API pedida.
 *
 * 1.16.1 é a última do Subsonic original, e o piso que todo servidor OpenSubsonic
 * implementa. Pedir mais alto faz servidor antigo recusar a requisição inteira; o que é
 * exclusivo do OpenSubsonic é lido por presença de campo, não por versão.
 */
const API = '1.16.1';

/** Esquema das referências remotas. Ver o cabeçalho. */
export const SUB = 'sub://';

/** O servidor, como o usuário o configurou. */
export type Server = {
  /** Base sem `/rest`, com esquema. Ex.: `https://musica.example.com`. */
  url: string;
  user: string;
  password: string;
};

/** O servidor com o par de autenticação já derivado. Vive em memória. */
export type Session = {
  url: string;
  user: string;
  token: string;
  salt: string;
  /**
   * Identidade curta e estável do servidor, para compor os ids das faixas.
   *
   * Do hash de `url + user`, e não da URL crua: o id vai para o disco em curtidas,
   * progresso e listas, e uma URL dentro dele quebraria tudo isso no dia em que o usuário
   * trocasse `http` por `https` ou o host mudasse de nome. Com o hash, trocar de endereço
   * ainda invalida — mas invalida de forma previsível, e o usuário reconecta.
   */
  id: string;
};

/**
 * A sessão corrente, num módulo.
 *
 * Aqui, e não em contexto do React, pelo mesmo motivo de `chrome-scroll.ts`: quem precisa
 * dela é `absolute()`, uma função pura chamada de fora da árvore de componentes.
 */
let session: Session | null = null;

export const connected = (): Session | null => session;

/** Esquece a sessão. A senha guardada é assunto das preferências, não daqui. */
export function disconnect(): void {
  session = null;
}

/**
 * Deriva o par de autenticação e guarda a sessão.
 *
 * Não valida nada — quem confirma que o servidor responde é `ping`, que a tela de Ajustes
 * chama em seguida. Separado de propósito: reconectar no boot não deveria depender de a
 * rede estar de pé naquele segundo, e síncrono porque é o que permite reconectar no
 * primeiro render em vez de num efeito.
 */
export function connect(server: Server): Session {
  const salt = randomSalt();
  const token = md5(server.password + salt);
  session = {
    url: server.url.replace(/\/+$/, ''),
    user: server.user,
    token,
    salt,
    id: hash(`${server.url} ${server.user}`).toString(36).slice(0, 8),
  };
  return session;
}

/**
 * Salt aleatório, em hex.
 *
 * `Math.random` basta: o salt do Subsonic não é segredo — ele viaja em claro na própria
 * requisição, ao lado do token. O papel dele é só impedir que um token capturado sirva
 * para outro servidor ou outra sessão. Usar um gerador criptográfico aqui sugeriria uma
 * garantia que o protocolo não dá.
 */
function randomSalt(): string {
  let out = '';
  while (out.length < 16) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}

/** Os parâmetros que toda requisição carrega. */
function auth(s: Session): string {
  return `u=${encodeURIComponent(s.user)}&t=${s.token}&s=${s.salt}&v=${API}&c=${CLIENT}&f=json`;
}

/** URL de um endpoint da API, já autenticada. */
function endpoint(s: Session, method: string, params: string = ''): string {
  return `${s.url}/rest/${method}?${auth(s)}${params ? `&${params}` : ''}`;
}

/**
 * Resposta do Subsonic, na parte que importa.
 *
 * O envelope é sempre `{"subsonic-response": {status, version, …}}`, e o erro vem com
 * status 200 e `status: "failed"` — checar só o código HTTP deixaria passar senha errada
 * como sucesso.
 */
type Envelope = {
  'subsonic-response'?: {
    status?: string;
    error?: { code?: number; message?: string };
    [key: string]: unknown;
  };
};

export class SubsonicError extends Error {
  constructor(
    message: string,
    /** Código do Subsonic quando houver: 40 é credencial inválida, 30 versão antiga. */
    readonly code?: number
  ) {
    super(message);
    this.name = 'SubsonicError';
  }
}

/**
 * Uma chamada à API.
 *
 * O timeout é nosso: `fetch` sem sinal espera indefinidamente, e um servidor doméstico
 * fora do ar deixaria a tela de Ajustes girando para sempre em vez de dizer o que houve.
 */
async function call(
  s: Session,
  method: string,
  params = '',
  timeout = 15000
): Promise<Record<string, unknown>> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeout);
  let response: Response;
  try {
    response = await fetch(endpoint(s, method, params), { signal: abort.signal });
  } catch {
    // Distinguir os dois importa na tela: "demorou demais" e "não achei o servidor"
    // levam o usuário a conferir coisas diferentes.
    throw new SubsonicError(abort.signal.aborted ? 'timeout' : 'unreachable');
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) throw new SubsonicError(`http ${response.status}`);

  let body: Envelope;
  try {
    body = (await response.json()) as Envelope;
  } catch {
    // Servidor que devolve XML apesar do `f=json`, ou uma página de login de proxy.
    throw new SubsonicError('badResponse');
  }

  const envelope = body['subsonic-response'];
  if (!envelope) throw new SubsonicError('badResponse');
  if (envelope.status === 'failed') {
    throw new SubsonicError(envelope.error?.message ?? 'failed', envelope.error?.code);
  }
  return envelope;
}

/** Confirma que o servidor responde e que a credencial serve. */
export async function ping(s: Session): Promise<void> {
  await call(s, 'ping', '', 8000);
}

// ------------------------------------------------------------------ o acervo

/** Um álbum como o servidor o descreve, na parte que usamos. */
type RemoteAlbum = {
  id?: string;
  name?: string;
  album?: string;
  artist?: string;
  songCount?: number;
  coverArt?: string;
};

/** Uma faixa como o servidor a descreve. */
type RemoteSong = {
  id?: string;
  title?: string;
  artist?: string;
  album?: string;
  albumId?: string;
  track?: number;
  genre?: string;
  duration?: number;
  suffix?: string;
  path?: string;
  coverArt?: string;
  /**
   * Extensão do OpenSubsonic sobre o Subsonic original: os mesmos decibéis que a tag do
   * arquivo carregaria. Servidor antigo não manda, e aí a faixa remota fica sem
   * nivelamento — que é o mesmo que um arquivo local sem a tag. Ver `lib/gain.ts`.
   */
  replayGain?: { trackGain?: number; albumGain?: number };
};

const list = <T,>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : value == null ? [] : [value as T];

/**
 * Todos os álbuns do servidor, paginados até o fim.
 *
 * `getAlbumList2` com `type=alphabeticalByName` porque é a única ordem que todo servidor
 * implementa e que não muda entre páginas — ordenar por "mais recente" faz um álbum
 * adicionado durante a sincronia aparecer duas vezes e outro nenhuma.
 *
 * O teto de 500 por página é do protocolo. O laço para quando a página volta curta, e
 * não numa contagem total, porque o Subsonic não devolve uma.
 */
export async function fetchAlbums(
  s: Session,
  onProgress?: (found: number) => void
): Promise<RemoteAlbum[]> {
  const out: RemoteAlbum[] = [];
  const size = 500;
  for (let offset = 0; ; offset += size) {
    const page = await call(
      s,
      'getAlbumList2',
      `type=alphabeticalByName&size=${size}&offset=${offset}`
    );
    const found = list<RemoteAlbum>(
      (page.albumList2 as { album?: unknown } | undefined)?.album
    );
    out.push(...found);
    onProgress?.(out.length);
    if (found.length < size) return out;
  }
}

/** As faixas de um álbum. */
export async function fetchAlbum(s: Session, albumId: string): Promise<RemoteSong[]> {
  const body = await call(s, 'getAlbum', `id=${encodeURIComponent(albumId)}`);
  return list<RemoteSong>((body.album as { song?: unknown } | undefined)?.song);
}

// ------------------------------------------------- do servidor para a Library

/** `sub://<servidor>/song/<id>` — a identidade de uma faixa remota. */
export const songRef = (serverId: string, songId: string): string =>
  `${SUB}${serverId}/song/${songId}`;

/** `sub://<servidor>/album/<id>` — a identidade de um álbum remoto. */
export const albumRef = (serverId: string, albumId: string): string =>
  `${SUB}${serverId}/album/${albumId}`;

/** Se a referência é remota. Serve a todo lugar que só sabe lidar com arquivo local. */
export const isRemote = (ref: string): boolean => ref.startsWith(SUB);

/** O id do que está dentro de uma referência remota, ou null se ela não for uma. */
export function refId(ref: string): string | null {
  if (!isRemote(ref)) return null;
  const at = ref.indexOf('/', SUB.length);
  if (at < 0) return null;
  const rest = ref.slice(at + 1);
  const slash = rest.indexOf('/');
  return slash < 0 ? null : rest.slice(slash + 1);
}

/**
 * URL de stream de uma faixa remota — o que `Track.uri` vale para ela.
 *
 * Síncrona, e é o ponto do arquivo inteiro: quem chama é `absolute()`, de dentro do
 * render e do caminho de play. Sem sessão devolve string vazia, que o player trata como
 * faixa indisponível em vez de tentar tocar `undefined`.
 *
 * `format=raw` pede o arquivo como ele está no servidor: transcodificar seria o servidor
 * decidindo a qualidade por nós, e o app é offline-first justamente para não terceirizar
 * essa escolha. Servidor que não reconhece o parâmetro ignora e manda o padrão dele.
 */
export function streamUrl(ref: string): string {
  const s = session;
  if (!s) return '';
  const id = refId(ref);
  if (!id || !ref.startsWith(`${SUB}${s.id}/`)) return '';
  return endpoint(s, 'stream', `id=${encodeURIComponent(id)}&format=raw`);
}

/** URL da capa de um álbum remoto, ou null quando o servidor não tem uma. */
export function coverUrl(coverArt: string | undefined): string | null {
  const s = session;
  if (!s || !coverArt) return null;
  // 512 é o lado que a grade e o Now Playing pedem; sem `size` alguns servidores mandam
  // o original, que pode ser um JPEG de vários megabytes por álbum.
  return endpoint(s, 'getCoverArt', `id=${encodeURIComponent(coverArt)}&size=512`);
}

/**
 * Uma faixa do servidor no formato do índice local.
 *
 * `uri` sai vazia de propósito: ela é derivada na leitura por `absolute()`, e gravá-la
 * aqui poria o token de autenticação dentro do `library.json`.
 *
 * `folder` recebe o nome do servidor em vez do caminho real do arquivo lá dentro. O campo
 * alimenta o agrupamento por pasta, que é uma ideia de disco local; para o acervo remoto
 * a "pasta" que faz sentido ao usuário é de qual servidor aquilo veio.
 */
export function toTrack(serverId: string, serverLabel: string, song: RemoteSong): Track | null {
  if (!song.id) return null;
  return {
    id: songRef(serverId, song.id),
    uri: '',
    // O sufixo é o que o rodapé do player mostra no lugar da extensão do arquivo.
    file: song.suffix ? `${song.title ?? song.id}.${song.suffix}` : (song.title ?? song.id),
    folder: serverLabel,
    title: song.title ?? 'Sem título',
    artist: song.artist ?? 'Artista desconhecido',
    album: song.album ?? 'Sem álbum',
    albumArtist: null,
    trackNumber: song.track ?? null,
    genre: song.genre ?? null,
    duration: song.duration ?? null,
    albumId: song.albumId
      ? albumRef(serverId, song.albumId)
      : albumRef(serverId, `loose/${song.album ?? 'unknown'}`),
    // A letra do servidor viria de `getLyrics`, que é outra chamada por faixa. Fora da
    // primeira versão: o painel de letras trata `false` como "não há", que é honesto.
    hasLyrics: false,
    // `?? null` e não `||`: zero dB é medida válida.
    trackGain: song.replayGain?.trackGain ?? null,
    albumGain: song.replayGain?.albumGain ?? null,
  };
}

/** Um álbum do servidor no formato do índice local. */
export function toAlbum(
  serverId: string,
  remote: RemoteAlbum,
  trackIds: string[]
): Album | null {
  if (!remote.id) return null;
  return {
    id: albumRef(serverId, remote.id),
    title: remote.name ?? remote.album ?? 'Sem álbum',
    artist: remote.artist ?? 'Artista desconhecido',
    trackIds,
    cover: coverUrl(remote.coverArt),
  };
}

/** Andamento da sincronia, para a tela de Ajustes mostrar algo além de um spinner. */
export type SyncProgress = {
  /** Álbuns já trazidos. */
  albums: number;
  /** Total conhecido; sobe enquanto a listagem pagina. */
  total: number;
  tracks: number;
};

/**
 * Traz o acervo inteiro do servidor no formato do índice local.
 *
 * São `1 + N` requisições: uma listagem paginada de álbuns e uma por álbum para pegar as
 * faixas. O Subsonic não tem "me dê tudo" — `getAlbumList2` não traz faixas, e `search3`
 * com página grande não é confiável entre implementações. Num acervo de mil álbuns isso é
 * mil requisições, e é por isso que a sincronia é **um botão**, e não algo que aconteça
 * sozinho na abertura do app.
 *
 * Serial de propósito, sem paralelismo: o servidor do outro lado é doméstico, muitas vezes
 * um Raspberry Pi, e vinte requisições simultâneas o fazem responder pior que uma por vez.
 *
 * `onProgress` é chamado por álbum. A tela precisa disso porque a operação leva minutos —
 * um spinner sem número parece travado.
 */
export async function fetchLibrary(
  s: Session,
  label: string,
  onProgress?: (p: SyncProgress) => void
): Promise<{ tracks: Track[]; albums: Album[] }> {
  const remoteAlbums = await fetchAlbums(s, (total) =>
    onProgress?.({ albums: 0, total, tracks: 0 })
  );

  const tracks: Track[] = [];
  const albums: Album[] = [];

  for (const [at, remote] of remoteAlbums.entries()) {
    if (!remote.id) continue;
    /*
      Um álbum que falha não derruba a sincronia inteira.

      Acontece: faixa apagada do disco do servidor mas ainda no banco dele, um id com
      caractere que o proxy recusa. Perder um álbum de mil é muito melhor que perder a
      sincronia no álbum 900 e não guardar nada.
    */
    let songs: RemoteSong[];
    try {
      songs = await fetchAlbum(s, remote.id);
    } catch {
      continue;
    }

    const mapped = songs.map((song) => toTrack(s.id, label, song)).filter((t) => !!t);
    tracks.push(...mapped);
    const album = toAlbum(
      s.id,
      remote,
      mapped.map((t) => t.id)
    );
    // Álbum sem faixa nenhuma não entra: seria uma capa que abre numa tela em branco.
    if (album && album.trackIds.length) albums.push(album);

    onProgress?.({ albums: at + 1, total: remoteAlbums.length, tracks: tracks.length });
  }

  return { tracks, albums };
}

/** Se a referência pertence a **este** servidor. É o `owns` da fusão — ver `lib/merge.ts`. */
export const ownsRef = (serverId: string) => (ref: string) =>
  ref.startsWith(`${SUB}${serverId}/`);
