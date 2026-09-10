/**
 * node --test src/lib/tags.test.ts
 * Buffers montados à mão para os quatro formatos — sem fixtures binários no repo.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findTopAtom,
  fromPath,
  HEADER_BYTES,
  headerBytes,
  parseDuration,
  parseTags,
  pictureFromApic,
  pictureFromCovrData,
  pictureFromFlacBlock,
} from './tags.ts';

const cat = (...parts: (Uint8Array | number[] | string)[]): Uint8Array => {
  const arrays = parts.map((p) =>
    typeof p === 'string'
      ? new Uint8Array([...p].flatMap((c) => [...Buffer.from(c, 'utf8')]))
      : Uint8Array.from(p)
  );
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let at = 0;
  for (const a of arrays) {
    out.set(a, at);
    at += a.length;
  }
  return out;
};

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
const synchsafe = (n: number) => [(n >>> 21) & 127, (n >>> 14) & 127, (n >>> 7) & 127, n & 127];

// --------------------------------------------------------------------- ID3v2

/** Frame de texto com encoding UTF-8 (byte 0x03). */
const id3Frame = (id: string, value: string, v4: boolean) => {
  const payload = cat([3], value);
  const size = v4 ? synchsafe(payload.length) : be32(payload.length);
  return cat(id, size, [0, 0], payload);
};

const id3File = (v4: boolean) => {
  const frames = cat(
    id3Frame('TIT2', 'Blue Hour', v4),
    id3Frame('TPE1', 'Kō', v4),
    id3Frame('TALB', 'Blue Hour Tapes', v4),
    id3Frame('TPE2', 'Various Artists', v4),
    id3Frame('TRCK', '3/11', v4)
  );
  // 40 bytes de padding depois dos frames, como escritores reais fazem.
  return cat('ID3', [v4 ? 4 : 3, 0, 0], synchsafe(frames.length + 40), frames, new Uint8Array(40));
};

for (const v4 of [false, true]) {
  test(`ID3v2.${v4 ? 4 : 3}`, () => {
    const t = parseTags(id3File(v4), 'file:///Music/x.mp3');
    assert.equal(t.title, 'Blue Hour');
    assert.equal(t.artist, 'Kō');
    assert.equal(t.album, 'Blue Hour Tapes');
    assert.equal(t.albumArtist, 'Various Artists');
    assert.equal(t.trackNumber, 3);
  });
}

// --------------------------------------------------------------- Vorbis / FLAC

const vorbisBlock = (fields: string[]) => {
  const vendor = cat('resonate-test');
  const entries = fields.map((f) => {
    const bytes = cat(f);
    return cat(le32(bytes.length), bytes);
  });
  return cat(le32(vendor.length), vendor, le32(entries.length), ...entries);
};

const VORBIS_FIELDS = [
  'TITLE=Static Garden',
  'ARTIST=Marisol Vane',
  'ALBUM=Static Garden',
  'ALBUMARTIST=Marisol Vane',
  'TRACKNUMBER=2',
];

test('FLAC vorbis comment', () => {
  const streaminfo = new Uint8Array(34);
  const comment = vorbisBlock(VORBIS_FIELDS);
  const bytes = cat(
    'fLaC',
    [0, 0, 0, 34], // bloco 0 (STREAMINFO), não é o último
    streaminfo,
    [0x84, (comment.length >> 16) & 255, (comment.length >> 8) & 255, comment.length & 255],
    comment
  );
  const t = parseTags(bytes, 'file:///Music/y.flac');
  assert.equal(t.title, 'Static Garden');
  assert.equal(t.artist, 'Marisol Vane');
  assert.equal(t.album, 'Static Garden');
  assert.equal(t.trackNumber, 2);
});

test('OGG vorbis comment', () => {
  const page = cat('OggS', new Uint8Array(23), [3], 'vorbis', vorbisBlock(VORBIS_FIELDS));
  const t = parseTags(page, 'file:///Music/y.ogg');
  assert.equal(t.title, 'Static Garden');
  assert.equal(t.artist, 'Marisol Vane');
  assert.equal(t.trackNumber, 2);
});

// ----------------------------------------------------------------- MP4 / M4A

/** Nomes de átomo são bytes crus, não UTF-8: '©nam' é 0xA9 'n' 'a' 'm'. */
const latin1 = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
const atom = (name: string, body: Uint8Array) => cat(be32(body.length + 8), latin1(name), body);
/** Item de ilst: contém um átomo 'data' com version+flags e locale antes do payload. */
const ilstItem = (name: string, payload: Uint8Array) =>
  atom(name, atom('data', cat([0, 0, 0, 1], [0, 0, 0, 0], payload)));

test('MP4 ilst', () => {
  const ilst = atom(
    'ilst',
    cat(
      ilstItem('©nam', cat('Deep Field')),
      ilstItem('©ART', cat('Anhelo')),
      ilstItem('©alb', cat('Deep Field')),
      ilstItem('aART', cat('Anhelo')),
      ilstItem('trkn', Uint8Array.from([0, 0, 0, 2, 0, 4]))
    )
  );
  // 'meta' é full atom: 4 bytes de version+flags antes dos filhos.
  const moov = atom('moov', atom('udta', atom('meta', cat([0, 0, 0, 0], ilst))));
  const bytes = cat(atom('ftyp', cat('M4A ')), moov);

  const t = parseTags(bytes, 'file:///Music/z.m4a');
  assert.equal(t.title, 'Deep Field');
  assert.equal(t.artist, 'Anhelo');
  assert.equal(t.album, 'Deep Field');
  assert.equal(t.albumArtist, 'Anhelo');
  assert.equal(t.trackNumber, 2);
});

// ------------------------------------------------------------------ fallback

test('fallback por caminho: Artista/Álbum/01 Faixa.ext', () => {
  const t = fromPath('file:///storage/emulated/0/Music/Ottoline/Kitchen%20Radio/02%20Tin%20Foil.wav');
  assert.equal(t.artist, 'Ottoline');
  assert.equal(t.album, 'Kitchen Radio');
  assert.equal(t.title, 'Tin Foil');
  assert.equal(t.trackNumber, 2);
});

test('fallback: pasta genérica não vira artista', () => {
  const t = fromPath('file:///storage/emulated/0/Music/nightbus_terminus.wav');
  assert.equal(t.artist, 'Artista desconhecido');
  assert.equal(t.album, 'Álbum desconhecido');
});

test('fallback: "artista - título" no nome do arquivo', () => {
  const t = fromPath('file:///Download/fennwick - foghorn.ogg');
  assert.equal(t.artist, 'fennwick');
  assert.equal(t.title, 'foghorn');
});

test('bytes sem tag caem no fallback', () => {
  const t = parseTags(new Uint8Array(64), 'file:///Music/The%20Long%20Sundays/Room/04%20Kettle.mp3');
  assert.equal(t.artist, 'The Long Sundays');
  assert.equal(t.album, 'Room');
  assert.equal(t.title, 'Kettle');
});

// ------------------------------------------------------------------ duração

test('duração FLAC (STREAMINFO)', () => {
  const si = new Uint8Array(34);
  // sample rate 44100 nos 20 bits a partir do byte 10, canais/bps zerados,
  // total de samples = 441000 (10 s) nos 36 bits seguintes.
  si[10] = (44100 >> 12) & 0xff;
  si[11] = (44100 >> 4) & 0xff;
  si[12] = (44100 & 0x0f) << 4;
  si.set(be32(441000), 14);
  const bytes = cat('fLaC', [0x00, 0, 0, 34], si, [0x84, 0, 0, 4], vorbisBlock([]));
  assert.equal(parseDuration(bytes, bytes.length), 10);
});

test('duração WAV', () => {
  // byteRate 176400 (44.1 kHz, 16 bits, estéreo), 352800 bytes de dados = 2 s.
  const fmt = cat(le32(16), new Uint8Array(4), le32(44100), le32(176400), new Uint8Array(4));
  const bytes = cat('RIFF', le32(0), 'WAVE', 'fmt ', fmt, 'data', le32(352800));
  assert.equal(parseDuration(bytes, bytes.length), 2);
});

test('duração MP4 (mvhd v0)', () => {
  const mvhd = cat([0, 0, 0, 0], new Uint8Array(8), be32(1000), be32(180000));
  const bytes = cat(atom('ftyp', cat('M4A ')), atom('moov', atom('mvhd', mvhd)));
  assert.equal(parseDuration(bytes, bytes.length), 180);
});

test('duração MP3 via Xing', () => {
  // MPEG1 Layer III, 44.1 kHz, estéreo: Xing a 36 bytes do início do frame.
  const header = [0xff, 0xfb, 0x90, 0x00];
  const gap = new Uint8Array(32);
  const xing = cat('Xing', be32(1), be32(383)); // 383 frames * 1152 / 44100 = 10.0 s
  const bytes = cat(header, gap, xing);
  assert.equal(Math.round(parseDuration(bytes, bytes.length)! * 10) / 10, 10);
});

test('duração MP3 CBR sem Xing', () => {
  // 128 kbps: 160000 bytes = 10 s.
  const bytes = cat([0xff, 0xfb, 0x90, 0x00], new Uint8Array(64));
  assert.equal(parseDuration(bytes, 160000), 10);
});

// -------------------------------------------------- janela lida do cabeçalho

/**
 * Um MP3 com tag ID3 grande — o formato de todo arquivo com capa embutida — seguido do
 * primeiro frame MPEG com Xing.
 *
 * É a forma exata do bug que `headerBytes` existe para não deixar voltar: lendo só o que
 * a tag declara, o frame fica fora do buffer e a faixa aparece sem duração.
 */
const mp3WithBigTag = () => {
  const art = new Uint8Array(60_000); // finge uma capa
  const frames = cat(id3Frame('TIT2', 'Nightglass', true), 'APIC', synchsafe(art.length), [0, 0], art);
  const tag = cat('ID3', [4, 0, 0], synchsafe(frames.length), frames);
  // 383 frames * 1152 / 44100 = 10,0 s
  const frame = cat([0xff, 0xfb, 0x90, 0x00], new Uint8Array(32), 'Xing', be32(1), be32(383));
  return { file: cat(tag, frame), tagLength: tag.length };
};

test('a janela do cabeçalho alcança o primeiro frame MPEG', () => {
  const { file, tagLength } = mp3WithBigTag();
  const head = file.slice(0, 12);
  const window = headerBytes(head, file.length);

  assert.ok(window > tagLength, 'a janela precisa passar do fim da tag');
  assert.equal(Math.round(parseDuration(file.slice(0, window), file.length)! * 10) / 10, 10);
});

test('regressão: ler só a tag ID3 perdia a duração', () => {
  const { file, tagLength } = mp3WithBigTag();
  // Era isto que `readTags` fazia. Fica no teste para nomear o que não pode voltar.
  assert.equal(parseDuration(file.slice(0, tagLength), file.length), null);
});

test('sem tag ID3 a janela é o teto, limitada pelo arquivo', () => {
  const small = cat([0xff, 0xfb, 0x90, 0x00], new Uint8Array(64));
  assert.equal(headerBytes(small.slice(0, 12), small.length), small.length);
  assert.equal(headerBytes(small.slice(0, 12), 9_000_000), HEADER_BYTES);
});

test('a janela nunca passa do tamanho do arquivo', () => {
  const { file } = mp3WithBigTag();
  assert.equal(headerBytes(file.slice(0, 12), 100), 100);
});

// -------------------------------------------------------------------- letras

/** USLT: encoding, idioma, descritor terminado em NUL e só então o texto. */
const usltFrame = (descriptor: string, text: string, v4: boolean) => {
  const payload = cat([3], 'eng', descriptor, [0], text);
  return cat('USLT', v4 ? synchsafe(payload.length) : be32(payload.length), [0, 0], payload);
};

/**
 * TXXX: encoding, descrição terminada em NUL, valor. É onde o ReplayGain mora num MP3.
 */
const txxxFrame = (key: string, value: string, v4: boolean) => {
  const payload = cat([3], key, [0], value);
  return cat('TXXX', v4 ? synchsafe(payload.length) : be32(payload.length), [0, 0], payload);
};

test('ID3 TXXX separa a descrição do valor, e acha o ReplayGain', () => {
  const frames = cat(
    id3Frame('TIT2', 'Faixa', true),
    txxxFrame('replaygain_track_gain', '-7.53 dB', true),
    txxxFrame('replaygain_album_gain', '-9.20 dB', true),
    // Um TXXX que não é ReplayGain não pode virar ganho nenhum.
    txxxFrame('MusicBrainz Album Id', 'abc-123', true)
  );
  const bytes = cat('ID3', [4, 0, 0], synchsafe(frames.length), frames);
  const t = parseTags(bytes, 'file:///Music/a.mp3');
  assert.equal(t.title, 'Faixa');
  // Cru: o leitor devolve o texto da tag, e quem converte é `lib/gain.ts`.
  assert.equal(t.trackGain, '-7.53 dB');
  assert.equal(t.albumGain, '-9.20 dB');
});

/** Um FLAC mínimo: STREAMINFO vazio e o bloco de comentários como último. */
const flacWith = (fields: string[]) => {
  const comment = vorbisBlock(fields);
  return cat(
    'fLaC',
    [0, 0, 0, 34],
    new Uint8Array(34),
    [0x84, (comment.length >> 16) & 255, (comment.length >> 8) & 255, comment.length & 255],
    comment
  );
};

test('Vorbis REPLAYGAIN, e sem a tag os dois ficam null', () => {
  const t = parseTags(
    flacWith([
      'TITLE=Faixa',
      'REPLAYGAIN_TRACK_GAIN=-4.10 dB',
      'REPLAYGAIN_ALBUM_GAIN=-6.00 dB',
    ]),
    'file:///Music/a.flac'
  );
  assert.equal(t.trackGain, '-4.10 dB');
  assert.equal(t.albumGain, '-6.00 dB');

  const without = parseTags(flacWith(['TITLE=Faixa']), 'file:///Music/b.flac');
  assert.equal(without.trackGain, null);
  assert.equal(without.albumGain, null);
});

test('ID3 USLT pula o descritor', () => {
  const frames = cat(
    id3Frame('TIT2', 'Faixa', true),
    usltFrame('desc', 'primeira linha\nsegunda linha', true)
  );
  const bytes = cat('ID3', [4, 0, 0], synchsafe(frames.length), frames);
  const t = parseTags(bytes, 'file:///Music/a.mp3');
  assert.equal(t.lyrics, 'primeira linha\nsegunda linha');
});

test('Vorbis LYRICS', () => {
  const comment = vorbisBlock(['TITLE=Faixa', 'LYRICS=linha um\nlinha dois']);
  const bytes = cat(
    'fLaC',
    [0x84, (comment.length >> 16) & 255, (comment.length >> 8) & 255, comment.length & 255],
    comment
  );
  assert.equal(parseTags(bytes, 'file:///Music/b.flac').lyrics, 'linha um\nlinha dois');
});

test('MP4 ©lyr', () => {
  const ilst = atom('ilst', ilstItem('©lyr', cat('linha um\nlinha dois')));
  const bytes = cat(
    atom('ftyp', cat('M4A ')),
    atom('moov', atom('udta', atom('meta', cat([0, 0, 0, 0], ilst))))
  );
  assert.equal(parseTags(bytes, 'file:///Music/c.m4a').lyrics, 'linha um\nlinha dois');
});

test('sem letra, lyrics é null', () => {
  assert.equal(parseTags(id3File(true), 'file:///Music/d.mp3').lyrics, null);
});

// -------------------------------------------------------------- capa embutida

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

test('capa em bloco PICTURE de FLAC', () => {
  const mime = cat('image/jpeg');
  const block = cat(
    be32(3), // tipo: capa frontal
    be32(mime.length),
    mime,
    be32(0), // descrição vazia
    be32(600), be32(600), be32(24), be32(0),
    be32(JPEG.length),
    JPEG
  );
  const pic = pictureFromFlacBlock(block);
  assert.equal(pic?.mime, 'image/jpeg');
  assert.deepEqual(pic?.data, JPEG);
});

test('capa em APIC de ID3, com descrição', () => {
  const frame = cat([0], 'image/jpeg', [0], [3], 'capa', [0], JPEG);
  const pic = pictureFromApic(frame);
  assert.equal(pic?.mime, 'image/jpeg');
  assert.deepEqual(pic?.data, JPEG);
});

test('capa em APIC com descrição UTF-16', () => {
  // encoding 1: o terminador da descrição tem dois bytes.
  const frame = cat([1], 'image/png', [0], [3], [0x63, 0x00, 0x00, 0x00], JPEG);
  assert.deepEqual(pictureFromApic(frame)?.data, JPEG);
});

test('APIC com mime abreviado ainda vale', () => {
  const frame = cat([0], 'PNG', [0], [3], [0], JPEG);
  assert.equal(pictureFromApic(frame)?.mime, 'image/png');
});

test('capa em covr de MP4', () => {
  const data = cat(be32(13), be32(0), JPEG); // tipo 13 = JPEG
  const pic = pictureFromCovrData(data);
  assert.equal(pic?.mime, 'image/jpeg');
  assert.deepEqual(pic?.data, JPEG);
});

test('covr sem tipo declarado cai na assinatura', () => {
  const data = cat(be32(0), be32(0), JPEG);
  assert.equal(pictureFromCovrData(data)?.mime, 'image/jpeg');
});

test('bloco sem imagem devolve null', () => {
  assert.equal(pictureFromApic(cat([0], 'text/plain', [0], [3], [0], JPEG)), null);
  assert.equal(pictureFromCovrData(cat(be32(1), be32(0), 'texto')), null);
});

// ------------------------------------------------------------------- gênero

test('gênero em Vorbis', () => {
  const comment = vorbisBlock(['TITLE=Faixa', 'GENRE=Shoegaze']);
  const bytes = cat(
    'fLaC',
    [0x84, (comment.length >> 16) & 255, (comment.length >> 8) & 255, comment.length & 255],
    comment
  );
  assert.equal(parseTags(bytes, 'file:///m/a.flac').genre, 'Shoegaze');
});

test('gênero em ID3 TCON, com referência numérica antes do nome', () => {
  const frames = cat(id3Frame('TCON', '(17)Rock', true));
  const bytes = cat('ID3', [4, 0, 0], synchsafe(frames.length), frames);
  assert.equal(parseTags(bytes, 'file:///m/a.mp3').genre, 'Rock');
});

test('gênero puramente numérico é descartado', () => {
  const frames = cat(id3Frame('TCON', '(17)', true));
  const bytes = cat('ID3', [4, 0, 0], synchsafe(frames.length), frames);
  assert.equal(parseTags(bytes, 'file:///m/a.mp3').genre, null);
});

test('gênero em MP4', () => {
  const ilst = atom('ilst', ilstItem('©gen', cat('Ambient')));
  const bytes = cat(
    atom('ftyp', cat('M4A ')),
    atom('moov', atom('udta', atom('meta', cat([0, 0, 0, 0], ilst))))
  );
  assert.equal(parseTags(bytes, 'file:///m/a.m4a').genre, 'Ambient');
});

// ------------------------------------------------------- átomos de topo do MP4

/** Como `atom`, mas com o largesize de 64 bits que alguns muxers sempre escrevem. */
function bigAtom(name: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(16 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 1);
  view.setUint32(12, out.length);
  for (let i = 0; i < 4; i++) out[4 + i] = name.charCodeAt(i);
  out.set(body, 16);
  return out;
}

const readerOver = (bytes: Uint8Array) => (at: number, len: number) =>
  bytes.subarray(at, at + len);

test('acha o moov mesmo depois de um mdat gigante', () => {
  const file = cat(
    atom('ftyp', new Uint8Array(16)),
    atom('mdat', new Uint8Array(4096)),
    atom('moov', Uint8Array.from([1, 2, 3, 4]))
  );
  const found = findTopAtom(readerOver(file), file.length, 'moov');
  assert.ok(found);
  assert.deepEqual([...file.subarray(found.body, found.end)], [1, 2, 3, 4]);
});

test('atravessa um mdat com largesize de 64 bits', () => {
  const file = cat(
    atom('ftyp', new Uint8Array(16)),
    bigAtom('mdat', new Uint8Array(2048)),
    atom('moov', Uint8Array.from([9]))
  );
  const found = findTopAtom(readerOver(file), file.length, 'moov');
  assert.ok(found);
  assert.deepEqual([...file.subarray(found.body, found.end)], [9]);
});

test('átomo de tamanho 0 vai até o fim do arquivo', () => {
  const open = new Uint8Array(8 + 32);
  for (let i = 0; i < 4; i++) open[4 + i] = 'mdat'.charCodeAt(i);
  const file = cat(atom('ftyp', new Uint8Array(16)), open);
  assert.equal(findTopAtom(readerOver(file), file.length, 'moov'), null);
  const mdat = findTopAtom(readerOver(file), file.length, 'mdat');
  assert.ok(mdat);
  assert.equal(mdat.end, file.length);
});
