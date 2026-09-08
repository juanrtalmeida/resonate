/** node --test src/lib/edits.test.ts */
import assert from 'node:assert/strict';
import test from 'node:test';

import { applyEdits, editTrack, hasEdits, NO_EDITS, type Edits } from './edits.ts';
import type { Library, Track } from './scan.ts';

const track = (over: Partial<Track>): Track => ({
  id: 't1',
  uri: 'file:///t1.mp3',
  file: 't1.mp3',
  folder: '/m',
  title: 'Faixa 01',
  artist: 'Artitsa Errado',
  album: 'Album',
  albumArtist: null,
  trackNumber: 1,
  genre: null,
  duration: 200,
  albumId: 'alb',
  hasLyrics: false,
  ...over,
});

const library = (tracks: Track[]): Library => ({
  tracks,
  albums: [
    { id: 'alb', title: 'Album', artist: 'Artitsa Errado', trackIds: tracks.map((t) => t.id), cover: null },
  ],
  folders: [],
  scannedAt: 0,
});

test('sem edição, a biblioteca passa intacta', () => {
  const lib = library([track({})]);
  assert.equal(applyEdits(lib, NO_EDITS), lib);
  assert.equal(hasEdits(NO_EDITS), false);
});

test('edição de faixa vence a tag', () => {
  const edits: Edits = { tracks: { t1: { title: 'O Nome Certo', genre: 'MPB' } }, artists: {} };
  const out = editTrack(track({}), edits);
  assert.equal(out.title, 'O Nome Certo');
  assert.equal(out.genre, 'MPB');
  // O que não foi editado continua vindo da tag.
  assert.equal(out.album, 'Album');
});

test('renome de artista vale para artist e albumArtist', () => {
  const edits: Edits = { tracks: {}, artists: { 'Artitsa Errado': 'Artista Certo' } };
  const out = editTrack(track({ albumArtist: 'Artitsa Errado' }), edits);
  assert.equal(out.artist, 'Artista Certo');
  assert.equal(out.albumArtist, 'Artista Certo');
});

test('renome se aplica também ao nome corrigido na faixa', () => {
  const edits: Edits = { tracks: { t1: { artist: 'X' } }, artists: { X: 'Y' } };
  assert.equal(editTrack(track({}), edits).artist, 'Y');
});

test('o álbum relê título e artista das faixas, e mantém o id', () => {
  const edits: Edits = { tracks: { t1: { album: 'Álbum Certo', artist: 'Quem É' } }, artists: {} };
  const out = applyEdits(library([track({})]), edits)!;
  assert.equal(out.albums[0].title, 'Álbum Certo');
  assert.equal(out.albums[0].artist, 'Quem É');
  assert.equal(out.albums[0].id, 'alb');
  assert.deepEqual(out.albums[0].trackIds, ['t1']);
});

test('álbum sem faixa encontrada fica como estava', () => {
  const lib = library([]);
  lib.albums[0].trackIds = ['sumiu'];
  const out = applyEdits(lib, { tracks: { outra: { title: 'x' } }, artists: {} })!;
  assert.equal(out.albums[0].title, 'Album');
});
