/**
 * Varredura: lista os arquivos, lê as tags de cada um e agrupa em álbuns.
 * Roda em lotes com uma cedência entre eles — a UI da tela de scan continua animando.
 */

import { Directory, File, FileMode, Paths } from 'expo-file-system';

import { hash } from './artwork';
import { clearLibrary, importJson, loadLibrary, saveLibrary } from './db';
import { absolute, portable } from './storage';
import {
  findTopAtom,
  fromPath,
  headerBytes,
  id3Length,
  parseDuration,
  parseTags,
  pictureFromFlacBlock,
  pictureFromId3,
  pictureFromMoov,
  pictureExt,
  type Picture,
  type Reader,
  type Tags,
} from './tags';
import { listAudioFiles, type AudioFile } from './sources';

export type Track = {
  /**
   * Identidade estável da faixa, e chave de tudo o que se guarda sobre ela: curtidas,
   * contagem de reprodução, progresso, listas, fila.
   *
   * É o caminho do arquivo em **forma portátil** (ver `lib/paths.ts`) — dentro da pasta
   * do app no iOS vira `doc://…`, e fora dela é o caminho estável de sempre. Era a URI
   * absoluta, o que amarrava todo esse histórico ao UUID do container do iOS: quando ele
   * trocava, favoritos, progresso e listas ficavam órfãos.
   */
  id: string;
  /** O caminho absoluto de agora, para abrir o arquivo. Nunca vai para o disco assim. */
  uri: string;
  /** Nome do arquivo, mostrado em mono na lista de faixas. */
  file: string;
  folder: string;
  title: string;
  artist: string;
  album: string;
  albumArtist: string | null;
  trackNumber: number | null;
  /** Gênero da tag. É o que aproxima artistas sem depender de rede. */
  genre: string | null;
  /** Segundos, ou null quando nenhuma fonte soube dizer. */
  duration: number | null;
  albumId: string;
  /**
   * Se há letra para esta faixa — embutida na tag ou num .lrc ao lado. O texto em si
   * fica fora do índice: milhares de letras inflariam o library.json e o boot com ele.
   * Use readLyrics() para buscá-lo na hora de mostrar.
   */
  hasLyrics: boolean;
};

export type Album = {
  id: string;
  title: string;
  artist: string;
  trackIds: string[];
  /** Caminho da capa embutida já extraída, ou null quando o arquivo não tem uma. */
  cover: string | null;
};

export type Library = {
  tracks: Track[];
  albums: Album[];
  /** Pastas escolhidas no onboarding; vazio = todas. */
  folders: string[];
  scannedAt: number;
};

export type ScanProgress = {
  done: number;
  total: number;
  file: string;
  albums: number;
  artists: number;
  /** Horas de música, como o contador do design. */
  hours: number;
};

export const EMPTY: Library = { tracks: [], albums: [], folders: [], scannedAt: 0 };

const libraryFile = () => new File(Paths.document, 'library.json');

const concat = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
};

/**
 * Cabeçalho sintético de um M4A: `ftyp` seguido do `moov`, coladas as duas pontas.
 *
 * Um M4A gravado sem faststart guarda o `moov` — onde vivem as tags e a duração — depois
 * de todo o áudio, no fim do arquivo. Ler um prefixo fixo do começo não alcançava nada
 * disso: as tags caíam no fallback por nome de arquivo (título e artista trocados, álbum
 * vazio) e a duração ficava nula. Era o caso de todo arquivo baixado.
 *
 * Ler o arquivo inteiro resolveria e custaria dezenas de megabytes por faixa. Os dois
 * átomos que importam bastam, e os parsers percorrem átomos em sequência — um buffer
 * assim é indistinguível do arquivo real para eles.
 */
function mp4Header(read: Reader, size: number): Uint8Array | null {
  const moov = findTopAtom(read, size, 'moov');
  if (!moov) return null;
  const ftyp = findTopAtom(read, size, 'ftyp');
  const before = ftyp ? read(ftyp.start, ftyp.end - ftyp.start) : new Uint8Array(0);
  return concat(before, read(moov.start, Math.min(moov.end - moov.start, MAX_TAG)));
}

/**
 * Lê só o cabeçalho: um FLAC pode ter 40 MB e nada disso é tag.
 *
 * ponytail: um FLAC com capa embutida muito grande pode empurrar o VORBIS_COMMENT para
 * além de HEADER_BYTES. Não visto na prática — o bloco vem antes da capa nos gravadores
 * usuais; se aparecer, o caminho é o mesmo do `moov`: caçar o bloco com o handle.
 */
export async function readTags(uri: string): Promise<{ tags: Tags; duration: number | null }> {
  let handle;
  try {
    const file = new File(uri);
    const size = file.size;
    handle = file.open(FileMode.ReadOnly);
    const read: Reader = (at, len) => {
      handle!.offset = at;
      return handle!.readBytes(len);
    };

    const head = handle.readBytes(Math.min(12, size));

    if (latin1(head, 4, 8) === 'ftyp') {
      const bytes = mp4Header(read, size);
      if (bytes) return { tags: parseTags(bytes, uri), duration: parseDuration(bytes, size) };
    }

    // Quanto ler é decisão de `headerBytes`, em tags.ts, onde tem teste.
    const bytes = read(0, headerBytes(head, size));
    return { tags: parseTags(bytes, uri), duration: parseDuration(bytes, size) };
  } catch {
    // content:// sem acesso direto, arquivo removido, permissão negada
    return { tags: fromPath(uri), duration: null };
  } finally {
    handle?.close();
  }
}

/**
 * O id do álbum entra na URL da rota, então é um hash curto e não a chave crua.
 * Um hash de 32 bits colide: com alguns milhares de álbuns a chance não é desprezível,
 * e uma colisão abriria o álbum errado. O sufixo desempata.
 */
function albumIdFor(key: string, taken: Set<string>): string {
  const base = hash(key).toString(36);
  let candidate = base;
  for (let n = 2; taken.has(candidate); n++) candidate = `${base}-${n}`;
  taken.add(candidate);
  return candidate;
}

const albumKey = (t: Tags) => `${t.albumArtist ?? t.artist} ${t.album}`;

const BATCH = 40;

/**
 * ponytail: biblioteca inteira em memória e em um JSON só. Acima de ~20k faixas isso
 * passa a doer no boot — migrar para expo-sqlite quando chegar lá.
 */
export async function scan(
  folders: string[],
  granted: string[],
  onProgress: (p: ScanProgress) => void
): Promise<Library> {
  const all = await listAudioFiles(false, granted);
  const files = folders.length ? all.filter((f) => folders.includes(f.folder)) : all;

  const tracks: Track[] = [];
  const albums = new Map<string, Album>();
  const albumIds = new Set<string>();
  const artists = new Set<string>();
  let seconds = 0;

  const taken = new Set<string>();

  for (let i = 0; i < files.length; i++) {
    // Última linha de defesa contra duplicata: a fonte pode devolver o mesmo arquivo
    // por dois caminhos, e duas faixas com o mesmo id quebrariam a lista.
    if (taken.has(files[i].uri)) continue;
    taken.add(files[i].uri);

    const track = await toTrack(files[i], albums, albumIds, artists);
    tracks.push(track);
    seconds += track.duration ?? 0;

    if (i % BATCH === BATCH - 1 || i === files.length - 1) {
      onProgress({
        done: i + 1,
        total: files.length,
        file: files[i].name,
        albums: albums.size,
        artists: artists.size,
        hours: Math.round(seconds / 3600),
      });
      // Cede o thread: sem isso a tela de scan congela até o fim.
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  const byId = new Map(tracks.map((t) => [t.id, t]));
  for (const album of albums.values()) {
    album.trackIds.sort((a, b) => {
      const ta = byId.get(a)!;
      const tb = byId.get(b)!;
      return (ta.trackNumber ?? 1e9) - (tb.trackNumber ?? 1e9) || ta.title.localeCompare(tb.title);
    });
  }

  const library: Library = {
    tracks,
    albums: [...albums.values()].sort((a, b) => a.title.localeCompare(b.title)),
    folders,
    scannedAt: Date.now(),
  };
  return library;
}

async function toTrack(
  f: AudioFile,
  albums: Map<string, Album>,
  albumIds: Set<string>,
  artists: Set<string>
): Promise<Track> {
  const { tags, duration } = await readTags(f.uri);
  const { lyrics, ...meta } = tags;
  const key = albumKey(tags);

  let album = albums.get(key);
  if (!album) {
    // albumIdFor reserva o id no Set: chamar duas vezes devolveria "id" e "id-2".
    const albumId = albumIdFor(key, albumIds);
    album = {
      id: albumId,
      title: tags.album,
      artist: tags.albumArtist ?? tags.artist,
      trackIds: [],
      // A capa sai da primeira faixa que criou o álbum; as outras repetiriam a mesma.
      cover: saveCover(albumId, f.uri),
    };
    albums.set(key, album);
  }
  artists.add(tags.artist);

  const track: Track = {
    // O caminho já é único por construção — um hash de 32 bits não é. Portátil, porque
    // é ele que vai sobreviver a uma troca de container no iOS.
    id: portable(f.uri),
    uri: f.uri,
    file: f.name,
    folder: f.folder,
    ...meta,
    // O MediaStore do Android já sabe a duração; no iOS ela vem do cabeçalho.
    duration: f.duration ?? duration,
    albumId: album.id,
    hasLyrics: lyrics !== null || lrcFile(f.uri) !== null,
  };
  album.trackIds.push(track.id);
  return track;
}

/**
 * Letras escolhidas à mão ficam em `lyrics/`, nomeadas pelo hash do id da faixa.
 * É o único jeito de associar um .lrc a uma faixa sem escrever no arquivo do usuário.
 *
 * Pelo id, e não pela URI: a URI carrega o caminho do container do iOS, e um hash dela
 * mudaria de nome a cada reinstalação — a letra importada sumiria sem deixar rastro.
 */
const lrcName = (track: Track) => `${hash(track.id).toString(36)}.lrc`;

function importedLrc(track: Track): File | null {
  try {
    const file = new File(Paths.document, 'lyrics', lrcName(track));
    return file.exists ? file : null;
  } catch {
    return null;
  }
}

/** Copia um .lrc escolhido pelo usuário para dentro do app. Devolve se deu certo. */
export async function importLrc(track: Track): Promise<boolean> {
  const picked = await File.pickFileAsync({ mimeTypes: ['*/*'] });
  if (picked.canceled) return false;
  try {
    const folder = new Directory(Paths.document, 'lyrics');
    if (!folder.exists) folder.create({ intermediates: true });
    const target = new File(folder, lrcName(track));
    if (target.exists) target.delete();
    await picked.result.copy(target);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- capa

/** Teto para a tag ID3: com capa embutida ela passa de um megabyte, mas não de oito. */
const MAX_TAG = 8 * 1024 * 1024;

/**
 * Lê a capa embutida sem carregar o arquivo inteiro. O handle permite mover o cursor,
 * então dá para pular de bloco em bloco até achar a imagem — o que também resolve o MP4
 * com `moov` no fim do arquivo, que o leitor de tags não alcança.
 *
 * ponytail: OGG e Opus guardam a capa em base64 dentro do vorbis comment; não coberto.
 */
function readPicture(uri: string): Picture | null {
  let handle;
  try {
    const file = new File(uri);
    const size = file.size;
    handle = file.open(FileMode.ReadOnly);
    const head = handle.readBytes(Math.min(12, size));

    if (latin1(head, 0, 4) === 'fLaC') {
      handle.offset = 4;
      while ((handle.offset ?? size) + 4 <= size) {
        const header = handle.readBytes(4);
        const last = (header[0] & 0x80) !== 0;
        const type = header[0] & 0x7f;
        const blockSize = (header[1] << 16) | (header[2] << 8) | header[3];
        if (type === 6) return pictureFromFlacBlock(handle.readBytes(blockSize));
        if (last) break;
        handle.offset = (handle.offset ?? 0) + blockSize;
      }
      return null;
    }

    const tag = id3Length(head);
    if (tag) {
      if (tag > MAX_TAG) return null;
      handle.offset = 0;
      return pictureFromId3(handle.readBytes(Math.min(tag, size)));
    }

    if (latin1(head, 4, 8) === 'ftyp') {
      const moov = findTopAtom(
        (at, len) => {
          handle!.offset = at;
          return handle!.readBytes(len);
        },
        size,
        'moov'
      );
      if (!moov) return null;
      handle.offset = moov.body;
      return pictureFromMoov(handle.readBytes(Math.min(moov.end - moov.body, MAX_TAG)));
    }
    return null;
  } catch {
    return null;
  } finally {
    handle?.close();
  }
}

const latin1 = (b: Uint8Array, from: number, to: number) => {
  let s = '';
  for (let i = from; i < to; i++) s += String.fromCharCode(b[i]);
  return s;
};

/** Guarda a capa do álbum em disco e devolve o caminho, ou null se não houver capa. */
function saveCover(albumId: string, uri: string): string | null {
  const picture = readPicture(uri);
  if (!picture) return null;
  try {
    const folder = new Directory(Paths.document, 'covers');
    if (!folder.exists) folder.create({ intermediates: true });
    const file = new File(folder, `${albumId}.${pictureExt(picture.mime)}`);
    if (file.exists) file.delete();
    file.create();
    file.write(picture.data);
    return file.uri;
  } catch {
    return null; // sem espaço em disco: segue com a capa procedural
  }
}

/** O .lrc que acompanha o arquivo, quando existe e é legível. */
function lrcFile(uri: string): File | null {
  try {
    const file = new File(uri.replace(/\.[^./]+$/, '.lrc'));
    return file.exists ? file : null;
  } catch {
    // No Android, READ_MEDIA_AUDIO não dá acesso a arquivos que não são mídia.
    return null;
  }
}

/**
 * Busca a letra sob demanda: o .lrc ao lado tem prioridade sobre a tag embutida,
 * porque só ele carrega os tempos de sincronia.
 */
export async function readLyrics(track: Track): Promise<string | null> {
  const lrc = importedLrc(track) ?? lrcFile(track.uri);
  if (lrc) {
    try {
      return await lrc.text();
    } catch {
      // arquivo sumiu entre a varredura e agora
    }
  }
  return (await readTags(track.uri)).tags.lyrics;
}

/*
  A fronteira entre o que estava no disco e o que fica na memória.

  Na memória tudo é caminho absoluto, porque é isso que abre arquivo e desenha imagem. No
  `library.json` das versões anteriores havia uma mistura: caminhos absolutos amarrados ao
  container do iOS daquela instalação. `up` normaliza tudo na entrada — e como
  `toPortable` é idempotente, ela serve de conversão e de migração ao mesmo tempo.

  A ida não mora mais aqui: quem grava agora é `lib/db.ts`, que converte na hora de
  escrever cada coluna.
*/
const up = (library: Library): Library => ({
  ...library,
  tracks: library.tracks.map((t) => ({
    // Uma biblioteca gravada antes desta mudança tem o id absoluto: normalizar aqui é o
    // que faz curtidas e listas antigas continuarem a encontrar a faixa.
    ...t,
    id: portable(t.id),
    uri: absolute(t.uri),
    folder: absolute(t.folder),
  })),
  albums: library.albums.map((a) => ({
    ...a,
    cover: a.cover && absolute(a.cover),
    trackIds: a.trackIds.map(portable),
  })),
  folders: library.folders.map(absolute),
});

/**
 * A `library.json` das versões anteriores.
 *
 * Existe só para a migração — ver `importJson` em `lib/db.ts`. Depois que ela roda uma
 * vez o arquivo não está mais lá, e esta função nunca mais devolve nada.
 */
function readJson(): Library | null {
  try {
    const file = libraryFile();
    if (!file.exists) return null;
    const parsed = JSON.parse(file.textSync()) as Library;
    return parsed.tracks?.length ? up(parsed) : null;
  } catch {
    return null; // JSON corrompido: melhor varrer de novo do que travar o boot
  }
}

export function load(): Library | null {
  try {
    // Uma passada: se houver um JSON de antes, ele entra no banco e some.
    importJson(readJson);
    return loadLibrary();
  } catch {
    return null; // banco ilegível: melhor varrer de novo do que travar o boot
  }
}

export function save(library: Library): void {
  try {
    saveLibrary(library);
  } catch {
    // sem espaço em disco: a biblioteca em memória continua válida nesta sessão
  }
}

export function clear(): void {
  try {
    clearLibrary();
  } catch {
    // nada a fazer
  }
}
