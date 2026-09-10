/** node --test src/lib/merge.test.ts */
import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeLibrary } from './merge.ts';
import type { Album, Library, Track } from './scan.ts';

const track = (id: string, albumId: string): Track => ({
  id,
  uri: '',
  file: `${id}.flac`,
  folder: '/x',
  title: id,
  artist: 'A',
  album: albumId,
  albumArtist: null,
  trackNumber: null,
  genre: null,
  duration: 100,
  albumId,
  hasLyrics: false,
});

const album = (id: string, trackIds: string[]): Album => ({
  id,
  title: id,
  artist: 'A',
  trackIds,
  cover: null,
});

/** O local é `doc://…`; o remoto é `sub://…`. É o que `owns` separa. */
const isRemote = (id: string) => id.startsWith('sub://');
const ownsLocal = (id: string) => !isRemote(id);
const ownsServer = (server: string) => (id: string) => id.startsWith(`sub://${server}/`);

const local: Library = {
  tracks: [track('doc://a.flac', 'al-local')],
  albums: [album('al-local', ['doc://a.flac'])],
  folders: ['/Music'],
  scannedAt: 1,
};

const remote: Library = {
  tracks: [track('sub://s1/song/1', 'sub://s1/album/1')],
  albums: [album('sub://s1/album/1', ['sub://s1/song/1'])],
  folders: [],
  scannedAt: 2,
};

test('sincronizar o servidor não apaga o acervo local', () => {
  const merged = mergeLibrary(local, remote, ownsServer('s1'));
  assert.equal(merged.tracks.length, 2);
  assert.ok(merged.tracks.some((t) => t.id === 'doc://a.flac'));
  assert.ok(merged.tracks.some((t) => t.id === 'sub://s1/song/1'));
  assert.equal(merged.albums.length, 2);
  // As pastas da varredura local sobrevivem: uma sincronia não opina sobre elas.
  assert.deepEqual(merged.folders, ['/Music']);
});

test('varrer os arquivos locais não apaga o acervo remoto', () => {
  const both = mergeLibrary(local, remote, ownsServer('s1'));
  // Uma varredura nova que achou outro arquivo, e nada do servidor.
  const rescan = {
    tracks: [track('doc://b.flac', 'al-novo')],
    albums: [album('al-novo', ['doc://b.flac'])],
  };
  const merged = mergeLibrary(both, rescan, ownsLocal, ['/Outra']);

  // O arquivo antigo saiu (a varredura é dona do domínio local e não o listou)…
  assert.ok(!merged.tracks.some((t) => t.id === 'doc://a.flac'));
  // …o novo entrou, e o remoto ficou intacto.
  assert.ok(merged.tracks.some((t) => t.id === 'doc://b.flac'));
  assert.ok(merged.tracks.some((t) => t.id === 'sub://s1/song/1'));
  assert.deepEqual(merged.folders, ['/Outra']);
});

test('dois servidores convivem, e sincronizar um não toca no outro', () => {
  const s2: Library = {
    tracks: [track('sub://s2/song/9', 'sub://s2/album/9')],
    albums: [album('sub://s2/album/9', ['sub://s2/song/9'])],
    folders: [],
    scannedAt: 3,
  };
  let merged = mergeLibrary(local, remote, ownsServer('s1'));
  merged = mergeLibrary(merged, s2, ownsServer('s2'));
  assert.equal(merged.tracks.length, 3);

  // Re-sincronizar s1 com o acervo dele vazio tira só o que era de s1.
  const emptied = mergeLibrary(merged, { tracks: [], albums: [] }, ownsServer('s1'));
  assert.ok(!emptied.tracks.some((t) => t.id.startsWith('sub://s1/')));
  assert.ok(emptied.tracks.some((t) => t.id === 'sub://s2/song/9'));
  assert.ok(emptied.tracks.some((t) => t.id === 'doc://a.flac'));
});

test('desconectar o servidor deixa a biblioteca local inteira', () => {
  const both = mergeLibrary(local, remote, ownsServer('s1'));
  const only = mergeLibrary(both, { tracks: [], albums: [] }, isRemote);
  assert.deepEqual(
    only.tracks.map((t) => t.id),
    ['doc://a.flac']
  );
  assert.deepEqual(
    only.albums.map((a) => a.id),
    ['al-local']
  );
});

test('álbum que ficou sem faixa nenhuma sai do índice', () => {
  const orphan: Library = {
    tracks: [],
    albums: [album('al-orfao', ['doc://sumiu.flac'])],
    folders: [],
    scannedAt: 0,
  };
  const merged = mergeLibrary(orphan, { tracks: [], albums: [] }, ownsLocal);
  assert.equal(merged.albums.length, 0);
});

test('álbum que perdeu parte das faixas tem as ids podadas, e fica', () => {
  const partial: Library = {
    tracks: [track('doc://1.flac', 'al')],
    albums: [album('al', ['doc://1.flac', 'doc://2.flac', 'doc://3.flac'])],
    folders: [],
    scannedAt: 0,
  };
  // Uma sincronia de servidor não mexe no domínio local, então o álbum é apenas podado.
  const merged = mergeLibrary(partial, { tracks: [], albums: [] }, ownsServer('s1'));
  assert.equal(merged.albums.length, 1);
  assert.deepEqual(merged.albums[0].trackIds, ['doc://1.flac']);
});

test('id repetido: a atualização vence, sem duplicar a faixa', () => {
  const changed = {
    tracks: [{ ...track('doc://a.flac', 'al-local'), title: 'Título corrigido' }],
    albums: [album('al-local', ['doc://a.flac'])],
  };
  const merged = mergeLibrary(local, changed, ownsLocal);
  assert.equal(merged.tracks.length, 1);
  assert.equal(merged.tracks[0].title, 'Título corrigido');
});

test('biblioteca ausente: a primeira atualização é a biblioteca', () => {
  const merged = mergeLibrary(null, remote, ownsServer('s1'));
  assert.equal(merged.tracks.length, 1);
  assert.deepEqual(merged.folders, []);
});
