/**
 * Leitor de tags sem dependência: ID3v2.3/2.4, Vorbis comment (FLAC/OGG) e MP4 ilst.
 * Lê só o cabeçalho do arquivo — um FLAC pode ter 40 MB.
 *
 * ponytail: APE, WMA e ID3v2.2 não são cobertos; caem no fallback por caminho.
 */

export type Tags = {
  title: string;
  artist: string;
  album: string;
  albumArtist: string | null;
  trackNumber: number | null;
  /** Letra embutida no arquivo, quando há uma. */
  lyrics: string | null;
  /** Gênero declarado na tag. É o que aproxima artistas sem depender de rede. */
  genre: string | null;
};

// ---------------------------------------------------------------- decoders

function latin1(b: Uint8Array, from: number, to: number): string {
  let s = '';
  for (let i = from; i < to; i++) s += String.fromCharCode(b[i]);
  return s;
}

function utf8(b: Uint8Array, from: number, to: number): string {
  let s = '';
  for (let i = from; i < to; ) {
    const c = b[i++];
    let cp: number;
    if (c < 0x80) cp = c;
    else if (c < 0xe0) cp = ((c & 0x1f) << 6) | (b[i++] & 0x3f);
    else if (c < 0xf0) cp = ((c & 0x0f) << 12) | ((b[i++] & 0x3f) << 6) | (b[i++] & 0x3f);
    else
      cp =
        ((c & 0x07) << 18) | ((b[i++] & 0x3f) << 12) | ((b[i++] & 0x3f) << 6) | (b[i++] & 0x3f);
    s += String.fromCodePoint(cp);
  }
  return s;
}

function utf16(b: Uint8Array, from: number, to: number, bigEndian: boolean): string {
  let s = '';
  for (let i = from; i + 1 < to; i += 2) {
    s += String.fromCharCode(bigEndian ? (b[i] << 8) | b[i + 1] : (b[i + 1] << 8) | b[i]);
  }
  return s;
}

/** Corta NUL de terminação e espaços. */
function clean(s: string): string {
  const z = s.indexOf('\0');
  return (z === -1 ? s : s.slice(0, z)).trim();
}

// ---------------------------------------------------------------- ID3v2

function id3Text(b: Uint8Array, from: number, to: number): string {
  if (from >= to) return '';
  const enc = b[from];
  const start = from + 1;
  if (enc === 0) return clean(latin1(b, start, to));
  if (enc === 3) return clean(utf8(b, start, to));
  if (enc === 2) return clean(utf16(b, start, to, true));
  // enc 1: UTF-16 com BOM
  if (b[start] === 0xff && b[start + 1] === 0xfe) return clean(utf16(b, start + 2, to, false));
  if (b[start] === 0xfe && b[start + 1] === 0xff) return clean(utf16(b, start + 2, to, true));
  return clean(utf16(b, start, to, false));
}

const synchsafe = (b: Uint8Array, i: number) =>
  ((b[i] & 0x7f) << 21) | ((b[i + 1] & 0x7f) << 14) | ((b[i + 2] & 0x7f) << 7) | (b[i + 3] & 0x7f);

const be32 = (b: Uint8Array, i: number) =>
  ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;

/** Quantos bytes a tag ID3v2 ocupa no início do arquivo, ou 0 se não há uma. */
export function id3Length(b: Uint8Array): number {
  if (b.length < 10 || b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return 0;
  return 10 + synchsafe(b, 6);
}

/** Quanto ler do início do arquivo quando o formato não declara o tamanho da tag. */
export const HEADER_BYTES = 256 * 1024;

/**
 * Sobra lida depois do fim da tag ID3, onde mora o primeiro frame MPEG.
 *
 * 2 KB: o header do frame são 4 bytes e o Xing/Info fica nos ~200 seguintes, mas há
 * arquivos com bytes nulos entre a tag e o primeiro sync, e o padding do ID3 nem sempre
 * entra no tamanho declarado.
 */
export const FRAME_SLACK = 2048;

/**
 * Quantos bytes ler do começo do arquivo, dados os 12 primeiros e o tamanho dele.
 *
 * Uma função à parte, e pura, porque foi aqui que um bug morou sem ser visto: a versão
 * anterior lia **exatamente** o tamanho declarado pela tag ID3, e com isso o primeiro
 * frame MPEG — que começa no byte seguinte ao fim dela — ficava fora do buffer. Todo MP3
 * tagueado ficava sem duração no iOS. `parseTags` e `parseDuration` estavam certos; quem
 * errava era a janela entregue a eles, e essa decisão não tinha teste porque vivia dentro
 * do caminho de I/O.
 */
export function headerBytes(head: Uint8Array, size: number): number {
  const id3 = id3Length(head);
  return Math.min(id3 ? id3 + FRAME_SLACK : HEADER_BYTES, size);
}

export function parseId3(b: Uint8Array): Partial<Tags> | null {
  const total = id3Length(b);
  if (!total) return null;
  const major = b[3];
  if (major !== 3 && major !== 4) return null;

  const out: Partial<Tags> = {};
  const end = Math.min(total, b.length);
  let i = 10;
  // Cabeçalho estendido: pula o bloco declarado logo depois do header.
  if (b[5] & 0x40) i += major === 4 ? synchsafe(b, i) : be32(b, i) + 4;

  while (i + 10 <= end) {
    const id = latin1(b, i, i + 4);
    if (id[0] === '\0') break; // padding
    // v2.4 usa synchsafe; v2.3 usa u32 normal.
    const size = major === 4 ? synchsafe(b, i + 4) : be32(b, i + 4);
    const from = i + 10;
    const to = Math.min(from + size, end);
    if (size <= 0 || from >= end) break;

    switch (id) {
      case 'TIT2':
        out.title = id3Text(b, from, to);
        break;
      case 'TPE1':
        out.artist = id3Text(b, from, to);
        break;
      case 'TALB':
        out.album = id3Text(b, from, to);
        break;
      case 'TPE2':
        out.albumArtist = id3Text(b, from, to);
        break;
      case 'TRCK':
        out.trackNumber = trackNo(id3Text(b, from, to));
        break;
      case 'USLT':
        out.lyrics = uslt(b, from, to);
        break;
      case 'TCON':
        out.genre = genreOf(id3Text(b, from, to));
        break;
    }
    i = from + size;
  }
  return out;
}

/**
 * USLT: encoding, 3 bytes de idioma, um descritor terminado em NUL e só então a letra.
 * O descritor precisa ser pulado, senão ele apareceria colado no começo do texto.
 */
function uslt(b: Uint8Array, from: number, to: number): string {
  const enc = b[from];
  const wide = enc === 1 || enc === 2; // UTF-16: o terminador tem dois bytes
  let i = from + 4; // encoding + idioma
  while (i < to) {
    if (b[i] === 0 && (!wide || b[i + 1] === 0)) {
      i += wide ? 2 : 1;
      break;
    }
    i += wide ? 2 : 1;
  }
  // id3Text espera o byte de encoding logo antes do texto.
  const text = new Uint8Array(to - i + 1);
  text[0] = enc;
  text.set(b.subarray(i, to), 1);
  return id3Text(text, 0, text.length);
}

/**
 * Normaliza o gênero. O ID3 permite referências numéricas à tabela do ID3v1, sozinhas
 * ou antes do nome: "(17)", "(17)Rock", "17". Só o texto interessa; um número solto vira
 * null em vez de virar uma tabela de oitenta entradas dentro do app.
 */
function genreOf(raw: string): string | null {
  const text = raw.replace(/^\((\d+)\)\s*/, '').trim();
  if (!text || /^\d+$/.test(text)) return null;
  return text;
}

/** "3/12" e "03" viram 3. */
function trackNo(s: string): number | null {
  const n = parseInt(s.split('/')[0], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ---------------------------------------------------------------- Vorbis comment

const le32 = (b: Uint8Array, i: number) =>
  (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

/** Bloco de vorbis comment cru: vendor + lista de "CHAVE=valor". */
function parseVorbisComment(b: Uint8Array, at: number, end: number): Partial<Tags> {
  const out: Partial<Tags> = {};
  let i = at;
  if (i + 4 > end) return out;
  i += 4 + le32(b, i); // pula vendor
  if (i + 4 > end) return out;
  const count = le32(b, i);
  i += 4;
  for (let n = 0; n < count && i + 4 <= end; n++) {
    const len = le32(b, i);
    i += 4;
    if (i + len > end) break;
    const eq = b.indexOf(0x3d, i);
    if (eq !== -1 && eq < i + len) {
      const key = latin1(b, i, eq).toUpperCase();
      const value = clean(utf8(b, eq + 1, i + len));
      if (key === 'TITLE') out.title = value;
      else if (key === 'ARTIST') out.artist = value;
      else if (key === 'ALBUM') out.album = value;
      else if (key === 'ALBUMARTIST' || key === 'ALBUM ARTIST') out.albumArtist = value;
      else if (key === 'TRACKNUMBER') out.trackNumber = trackNo(value);
      else if (key === 'LYRICS' || key === 'UNSYNCEDLYRICS' || key === 'SYNCEDLYRICS')
        out.lyrics = value;
      else if (key === 'GENRE') out.genre = genreOf(value);
    }
    i += len;
  }
  return out;
}

export function parseFlac(b: Uint8Array): Partial<Tags> | null {
  if (latin1(b, 0, 4) !== 'fLaC') return null;
  let i = 4;
  while (i + 4 <= b.length) {
    const last = (b[i] & 0x80) !== 0;
    const type = b[i] & 0x7f;
    const size = (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3];
    i += 4;
    if (type === 4) return parseVorbisComment(b, i, Math.min(i + size, b.length));
    if (last) break;
    i += size;
  }
  return {};
}

/**
 * OGG: em vez de reconstruir a paginação, acha a assinatura do comment header
 * dentro do que foi lido. O header de comentários cabe na primeira ou segunda página
 * em praticamente todo arquivo real.
 * ponytail: um comment header espalhado por várias páginas cai no fallback.
 */
export function parseOgg(b: Uint8Array): Partial<Tags> | null {
  if (latin1(b, 0, 4) !== 'OggS') return null;
  for (let i = 0; i + 8 < b.length; i++) {
    if (b[i] === 0x03 && latin1(b, i + 1, i + 7) === 'vorbis') return parseVorbisComment(b, i + 7, b.length);
    if (latin1(b, i, i + 8) === 'OpusTags') return parseVorbisComment(b, i + 8, b.length);
  }
  return {};
}

// ---------------------------------------------------------------- MP4 ilst

const ILST_KEYS: Record<string, keyof Tags> = {
  '©nam': 'title',
  '©ART': 'artist',
  '©alb': 'album',
  aART: 'albumArtist',
  '©lyr': 'lyrics',
  '©gen': 'genre',
};

export function parseMp4(b: Uint8Array): Partial<Tags> | null {
  if (latin1(b, 4, 8) !== 'ftyp') return null;
  const ilst = findAtom(b, 0, b.length, ['moov', 'udta', 'meta', 'ilst']);
  if (!ilst) return {};

  const out: Partial<Tags> = {};
  let i = ilst.start;
  while (i + 8 <= ilst.end) {
    const size = be32(b, i);
    if (size < 8) break;
    const name = latin1(b, i + 4, i + 8);
    const body = Math.min(i + size, ilst.end);
    // Dentro de cada item há um átomo 'data': size, 'data', version+flags, locale, payload.
    if (i + 24 <= body && latin1(b, i + 12, i + 16) === 'data') {
      const from = i + 24;
      if (name === 'trkn') {
        // 2 bytes reservados, depois o número da faixa em big-endian.
        if (from + 4 <= body) out.trackNumber = ((b[from + 2] << 8) | b[from + 3]) || null;
      } else {
        const key = ILST_KEYS[name];
        if (key) (out as Record<string, unknown>)[key] = clean(utf8(b, from, body));
      }
    }
    i += size;
  }
  return out;
}

/** Desce a árvore de átomos pelo caminho dado; devolve os limites do conteúdo do último. */
export function findAtom(
  b: Uint8Array,
  start: number,
  end: number,
  path: readonly string[]
): { start: number; end: number } | null {
  if (!path.length) return { start, end };
  let i = start;
  while (i + 8 <= end) {
    const size = be32(b, i);
    if (size < 8) return null;
    const name = latin1(b, i + 4, i + 8);
    if (name === path[0]) {
      // 'meta' é um full atom: version+flags antes dos filhos.
      const from = i + 8 + (name === 'meta' ? 4 : 0);
      return findAtom(b, from, Math.min(i + size, end), path.slice(1));
    }
    i += size;
  }
  return null;
}

/** Lê `len` bytes a partir de `at`. Abstrai o handle de arquivo para dar testabilidade. */
export type Reader = (at: number, len: number) => Uint8Array;

/**
 * Acha um átomo de topo (`ftyp`, `moov`, `mdat`) sem carregar o arquivo.
 *
 * Existe porque o `moov` — onde vivem as tags e a duração — pode estar no fim do
 * arquivo: quem grava M4A sem faststart escreve `ftyp`, todo o áudio em `mdat`, e só
 * então o `moov`. Ler um prefixo fixo não alcança isso.
 */
export function findTopAtom(
  read: Reader,
  fileSize: number,
  want: string
): { start: number; body: number; end: number } | null {
  let at = 0;
  while (at + 8 <= fileSize) {
    const header = read(at, Math.min(16, fileSize - at));
    if (header.length < 8) return null;

    let size = be32(header, 0);
    let body = at + 8;
    if (size === 1) {
      // largesize de 64 bits. Só aparece em arquivo grande, mas alguns muxers usam sempre.
      if (header.length < 16) return null;
      size = be32(header, 8) * 2 ** 32 + be32(header, 12);
      body = at + 16;
    } else if (size === 0) {
      // Último átomo do arquivo: vai até o fim.
      size = fileSize - at;
    }
    if (size < body - at) return null;

    const end = Math.min(at + size, fileSize);
    if (latin1(header, 4, 8) === want) return { start: at, body, end };
    at += size;
  }
  return null;
}

// ---------------------------------------------------------------- fallback por caminho

const GENERIC = new Set([
  'music',
  'musica',
  'músicas',
  'musicas',
  'download',
  'downloads',
  'documents',
  'documentos',
  'media',
  'audio',
  'sdcard',
  'storage',
  'emulated',
  '0',
]);

/**
 * Identidade de um arquivo para fins de deduplicação, imune ao esquema da URI.
 *
 * O mesmo arquivo chega com endereços completamente diferentes conforme a fonte:
 * o MediaStore devolve `file:///storage/emulated/0/Music/Rock/x.mp3` e o SAF devolve
 * `content://…/document/primary%3AMusic%2FRock%2Fx.mp3`. Comparar URIs faria o arquivo
 * entrar duas vezes sempre que uma pasta concedida já estivesse indexada.
 *
 * Os três últimos segmentos do caminho decodificado bastam para reconhecê-lo.
 * ponytail: dois arquivos homônimos em subpastas de mesmo nome, em raízes diferentes,
 * seriam tratados como um só.
 */
export function pathKey(uri: string): string {
  let decoded = uri;
  try {
    decoded = decodeURIComponent(uri);
  } catch {
    // URI mal formada: segue com o texto cru
  }
  return decoded
    .replace(/:/g, '/')
    .split('/')
    .filter(Boolean)
    .slice(-3)
    .join('/')
    .toLowerCase();
}

/** Deriva metadados de Artista/Álbum/01 Faixa.ext quando não há tags. */
export function fromPath(uri: string): Tags {
  const segs = decodeURIComponent(uri.replace(/^\w+:\/\//, '')).split('/').filter(Boolean);
  const file = segs[segs.length - 1] ?? 'Unknown';
  const parent = segs[segs.length - 2];
  const grand = segs[segs.length - 3];

  const base = file.replace(/\.[^.]+$/, '');
  const numbered = /^(\d{1,3})[\s._-]+(.+)$/.exec(base);
  const trackNumber = numbered ? parseInt(numbered[1], 10) : null;
  let name = numbered ? numbered[2] : base;

  let artist: string | null = null;
  const dashed = /^(.+?)\s+[-–—]\s+(.+)$/.exec(name);
  if (dashed) {
    artist = dashed[1].trim();
    name = dashed[2].trim();
  }

  const usable = (s: string | undefined) => (s && !GENERIC.has(s.toLowerCase()) ? s : null);
  const album = usable(parent);
  artist ??= album ? usable(grand) : null;

  return {
    title: name.replace(/[_]+/g, ' ').trim() || file,
    artist: artist ?? 'Artista desconhecido',
    album: album ?? 'Álbum desconhecido',
    albumArtist: null,
    trackNumber,
    lyrics: null,
    genre: null,
  };
}

// ---------------------------------------------------------------- entrada

/** Parseia o cabeçalho já lido; completa os buracos com o fallback por caminho. */
export function parseTags(bytes: Uint8Array, uri: string): Tags {
  let parsed: Partial<Tags> | null = null;
  try {
    parsed = parseId3(bytes) ?? parseFlac(bytes) ?? parseOgg(bytes) ?? parseMp4(bytes);
  } catch {
    parsed = null; // arquivo truncado ou malformado: o fallback resolve
  }
  const base = fromPath(uri);
  if (!parsed) return base;
  return {
    title: parsed.title || base.title,
    artist: parsed.artist || base.artist,
    album: parsed.album || base.album,
    albumArtist: parsed.albumArtist || null,
    trackNumber: parsed.trackNumber ?? base.trackNumber,
    lyrics: parsed.lyrics || null,
    genre: parsed.genre || null,
  };
}

// ---------------------------------------------------------------- duração

/**
 * Duração em segundos lida do cabeçalho. O Android recebe isso do MediaStore de graça;
 * o iOS não recebe nada, e uma lista de faixas sem duração é uma lista pela metade.
 * ponytail: OGG/Opus não é coberto (exige ler a última página para o granulepos final).
 */
export function parseDuration(b: Uint8Array, fileSize: number): number | null {
  try {
    if (latin1(b, 0, 4) === 'fLaC') return flacDuration(b);
    if (latin1(b, 0, 4) === 'RIFF' && latin1(b, 8, 12) === 'WAVE') return wavDuration(b);
    if (latin1(b, 4, 8) === 'ftyp') return mp4Duration(b);
    return mp3Duration(b, fileSize);
  } catch {
    return null;
  }
}

/** STREAMINFO: sample rate (20 bits) e total de samples (36 bits). */
function flacDuration(b: Uint8Array): number | null {
  let i = 4;
  while (i + 4 <= b.length) {
    const last = (b[i] & 0x80) !== 0;
    const type = b[i] & 0x7f;
    const size = (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3];
    i += 4;
    if (type === 0 && i + 18 <= b.length) {
      const rate = (b[i + 10] << 12) | (b[i + 11] << 4) | (b[i + 12] >> 4);
      // 36 bits não cabem num inteiro de 32: os 4 altos entram por multiplicação.
      const samples = (b[i + 13] & 0x0f) * 2 ** 32 + be32(b, i + 14);
      return rate > 0 ? samples / rate : null;
    }
    if (last) break;
    i += size;
  }
  return null;
}

function wavDuration(b: Uint8Array): number | null {
  let i = 12;
  let byteRate = 0;
  while (i + 8 <= b.length) {
    const id = latin1(b, i, i + 4);
    const size = le32(b, i + 4);
    if (id === 'fmt ') byteRate = le32(b, i + 16);
    if (id === 'data') return byteRate > 0 ? size / byteRate : null;
    i += 8 + size + (size & 1); // chunks têm padding para tamanho par
  }
  return null;
}

/** mvhd: timescale e duração, em versão 0 (32 bits) ou 1 (64 bits). */
function mp4Duration(b: Uint8Array): number | null {
  const mvhd = findAtom(b, 0, b.length, ['moov', 'mvhd']);
  if (!mvhd) return null;
  const i = mvhd.start;
  const version = b[i];
  if (version === 1) {
    const scale = be32(b, i + 20);
    const dur = be32(b, i + 24) * 2 ** 32 + be32(b, i + 28);
    return scale > 0 ? dur / scale : null;
  }
  const scale = be32(b, i + 12);
  const dur = be32(b, i + 16);
  return scale > 0 ? dur / scale : null;
}

// Layer III, em kbps, indexado pelo campo de 4 bits do frame header.
const MP3_BITRATE_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const MP3_BITRATE_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
const MP3_RATES = [
  [11025, 12000, 8000], // MPEG 2.5
  [0, 0, 0],
  [22050, 24000, 16000], // MPEG 2
  [44100, 48000, 32000], // MPEG 1
];

function mp3Duration(b: Uint8Array, fileSize: number): number | null {
  // Pula a tag ID3, depois procura o primeiro sync de frame.
  const start = id3Length(b);
  let i = start;
  while (i + 4 <= b.length && !(b[i] === 0xff && (b[i + 1] & 0xe0) === 0xe0)) i++;
  if (i + 4 > b.length) return null;

  const version = (b[i + 1] >> 3) & 3; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
  const layer = (b[i + 1] >> 1) & 3;
  const rate = MP3_RATES[version]?.[(b[i + 2] >> 2) & 3] ?? 0;
  const kbps = (version === 3 ? MP3_BITRATE_V1 : MP3_BITRATE_V2)[(b[i + 2] >> 4) & 15];
  if (layer !== 1 || !rate) return null; // só Layer III

  const samplesPerFrame = version === 3 ? 1152 : 576;
  const mono = ((b[i + 3] >> 6) & 3) === 3;
  const xingAt = i + 4 + (version === 3 ? (mono ? 17 : 32) : mono ? 9 : 17);

  // Xing/Info dá o número de frames: exato mesmo em VBR.
  const tag = latin1(b, xingAt, xingAt + 4);
  if ((tag === 'Xing' || tag === 'Info') && xingAt + 12 <= b.length) {
    const flags = be32(b, xingAt + 4);
    if (flags & 1) return (be32(b, xingAt + 8) * samplesPerFrame) / rate;
  }
  // Sem Xing: assume CBR.
  return kbps > 0 ? ((fileSize - start) * 8) / (kbps * 1000) : null;
}

// ---------------------------------------------------------------- capa embutida

export type Picture = { mime: string; data: Uint8Array };

const IMAGE_MIME = /^image\/(jpeg|jpg|png|webp)$/i;

/**
 * Conteúdo de um METADATA_BLOCK_PICTURE de FLAC (bloco tipo 6):
 * tipo, mime, descrição, dimensões e só então os bytes da imagem, todos em big-endian.
 */
export function pictureFromFlacBlock(b: Uint8Array): Picture | null {
  let i = 4; // tipo da imagem (capa frontal, contracapa, etc.)
  const mimeLen = be32(b, i);
  i += 4;
  const mime = latin1(b, i, i + mimeLen);
  i += mimeLen;
  i += 4 + be32(b, i); // descrição
  i += 16; // largura, altura, profundidade, número de cores
  const size = be32(b, i);
  i += 4;
  if (!IMAGE_MIME.test(mime) || !size || i + size > b.length) return null;
  return { mime: mime.toLowerCase(), data: b.subarray(i, i + size) };
}

/**
 * Conteúdo de um frame APIC de ID3: encoding, mime terminado em NUL, tipo da imagem,
 * descrição terminada em NUL e os bytes.
 */
export function pictureFromApic(b: Uint8Array): Picture | null {
  const enc = b[0];
  let i = 1;
  const mimeEnd = b.indexOf(0, i);
  if (mimeEnd === -1) return null;
  const mime = latin1(b, i, mimeEnd);
  i = mimeEnd + 1 + 1; // NUL do mime + tipo da imagem

  // A descrição usa o mesmo encoding do frame: em UTF-16 o terminador tem dois bytes.
  const wide = enc === 1 || enc === 2;
  while (i < b.length) {
    if (b[i] === 0 && (!wide || b[i + 1] === 0)) {
      i += wide ? 2 : 1;
      break;
    }
    i += wide ? 2 : 1;
  }

  // Alguns escritores gravam só "PNG" ou "JPG" no lugar do mime completo.
  const normalized = mime.includes('/') ? mime : `image/${mime}`;
  if (!IMAGE_MIME.test(normalized) || i >= b.length) return null;
  return { mime: normalized.toLowerCase(), data: b.subarray(i) };
}

/**
 * Conteúdo do átomo `data` dentro de um `covr` de MP4. O tipo do dado diz o formato:
 * 13 é JPEG, 14 é PNG.
 */
export function pictureFromCovrData(b: Uint8Array): Picture | null {
  const kind = be32(b, 0) & 0xffffff;
  const data = b.subarray(8); // versão/flags + locale
  if (!data.length) return null;
  if (kind === 13) return { mime: 'image/jpeg', data };
  if (kind === 14) return { mime: 'image/png', data };
  // Sem o tipo declarado, a assinatura resolve.
  if (data[0] === 0xff && data[1] === 0xd8) return { mime: 'image/jpeg', data };
  if (data[0] === 0x89 && data[1] === 0x50) return { mime: 'image/png', data };
  return null;
}

/** Extensão para o arquivo de cache, a partir do mime. */
export const pictureExt = (mime: string) =>
  mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';

/** Acha o `covr` dentro de um átomo `moov` já lido inteiro. */
export function pictureFromMoov(moov: Uint8Array): Picture | null {
  const ilst = findAtom(moov, 0, moov.length, ['udta', 'meta', 'ilst']);
  if (!ilst) return null;
  let i = ilst.start;
  while (i + 8 <= ilst.end) {
    const size = be32(moov, i);
    if (size < 8) break;
    if (latin1(moov, i + 4, i + 8) === 'covr' && i + 16 <= ilst.end) {
      // Dentro do item vem um átomo 'data'; o parser dele quer version/flags e locale.
      return pictureFromCovrData(moov.subarray(i + 16, Math.min(i + size, ilst.end)));
    }
    i += size;
  }
  return null;
}

/** Acha o frame APIC dentro de uma tag ID3 já lida inteira. */
export function pictureFromId3(b: Uint8Array): Picture | null {
  const total = id3Length(b);
  if (!total) return null;
  const major = b[3];
  if (major !== 3 && major !== 4) return null;
  const end = Math.min(total, b.length);
  let i = 10;
  if (b[5] & 0x40) i += major === 4 ? synchsafe(b, i) : be32(b, i) + 4;

  while (i + 10 <= end) {
    const id = latin1(b, i, i + 4);
    if (id[0] === '\0') break;
    const size = major === 4 ? synchsafe(b, i + 4) : be32(b, i + 4);
    const from = i + 10;
    if (size <= 0 || from >= end) break;
    if (id === 'APIC') return pictureFromApic(b.subarray(from, Math.min(from + size, end)));
    i = from + size;
  }
  return null;
}
