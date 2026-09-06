/** node --test src/lib/search.test.ts */
import assert from 'node:assert/strict';
import test from 'node:test';

import { fold, isEmpty, search } from './search.ts';
import { pathKey } from './tags.ts';
import type { Album, Track } from './scan.ts';

const track = (title: string, artist: string, album = 'Álbum'): Track => ({
  id: `file:///m/${title}.flac`,
  uri: `file:///m/${title}.flac`,
  file: `${title}.flac`,
  folder: 'file:///m',
  title,
  artist,
  album,
  albumArtist: null,
  trackNumber: null,
  duration: 180,
  albumId: 'a1',
  hasLyrics: false,
});

const album = (title: string, artist: string): Album => ({
  id: `id-${title}`,
  title,
  artist,
  trackIds: [],
});

const TRACKS = [
  track('Maré Alta', 'Kō'),
  track('Segundo Andar', 'Marisol Vane'),
  track('Órion', 'Marisol Vane'),
];
const ALBUMS = [album('Fitas da Hora Azul', 'Kō'), album('Jardim Estático', 'Marisol Vane')];

test('fold tira acento e caixa', () => {
  assert.equal(fold('Órion'), 'orion');
  assert.equal(fold('Kō'), 'ko');
  assert.equal(fold('MARÉ'), 'mare');
});

test('acha faixa por título, ignorando acento', () => {
  const r = search('orion', TRACKS, ALBUMS);
  assert.deepEqual(
    r.tracks.map((t) => t.title),
    ['Órion']
  );
});

test('acha por artista em todas as seções', () => {
  const r = search('marisol', TRACKS, ALBUMS);
  assert.equal(r.artists.length, 1);
  assert.equal(r.artists[0], 'Marisol Vane');
  assert.equal(r.tracks.length, 2);
  assert.equal(r.albums.length, 1);
});

test('acha álbum por título', () => {
  const r = search('hora azul', TRACKS, ALBUMS);
  assert.deepEqual(
    r.albums.map((a) => a.title),
    ['Fitas da Hora Azul']
  );
});

test('busca vazia não devolve nada', () => {
  assert.equal(isEmpty(search('   ', TRACKS, ALBUMS)), true);
  assert.equal(isEmpty(search('', TRACKS, ALBUMS)), true);
});

test('sem correspondência', () => {
  assert.equal(isEmpty(search('zzzz', TRACKS, ALBUMS)), true);
});

test('cada seção para no teto de 20', () => {
  const many = Array.from({ length: 60 }, (_, i) => track(`Faixa ${i}`, `Artista ${i}`));
  const manyAlbums = Array.from({ length: 60 }, (_, i) => album(`Disco ${i}`, `Artista ${i}`));
  const r = search('a', many, manyAlbums);
  assert.equal(r.tracks.length, 20);
  assert.equal(r.albums.length, 20);
  assert.equal(r.artists.length, 20);
});

// ------------------------------------------------------- deduplicação por caminho

test('pathKey reconhece o mesmo arquivo vindo do MediaStore e do SAF', () => {
  const mediaStore = 'file:///storage/emulated/0/Music/Rock/faixa.mp3';
  const saf =
    'content://com.android.externalstorage.documents/document/primary%3AMusic%2FRock%2Ffaixa.mp3';
  assert.equal(pathKey(mediaStore), pathKey(saf));
  assert.equal(pathKey(mediaStore), 'music/rock/faixa.mp3');
});

test('pathKey separa arquivos diferentes na mesma pasta', () => {
  assert.notEqual(
    pathKey('file:///storage/emulated/0/Music/Rock/a.mp3'),
    pathKey('file:///storage/emulated/0/Music/Rock/b.mp3')
  );
});

test('pathKey separa o mesmo nome em pastas diferentes', () => {
  assert.notEqual(
    pathKey('file:///Music/Rock/x.mp3'),
    pathKey('file:///Music/Jazz/x.mp3')
  );
});

test('pathKey aguenta URI mal formada', () => {
  assert.equal(pathKey('file:///Music/Rock/100%.mp3'), 'music/rock/100%.mp3');
});
