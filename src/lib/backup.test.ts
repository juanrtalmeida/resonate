/** node --test src/lib/backup.test.ts */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addCounts,
  BACKUP_VERSION,
  furthest,
  newPlays,
  parseBackup,
  union,
} from './backup.ts';
import type { Play } from './history.ts';

const play = (at: number, trackId: string, seconds = 200): Play => ({
  at,
  trackId,
  albumId: 'al',
  artist: 'A',
  album: 'Al',
  title: 'T',
  seconds,
});

const full = {
  version: BACKUP_VERSION,
  exportedAt: 1_700_000_000_000,
  prefs: {
    liked: ['doc://a.flac', 'doc://b.flac'],
    likedAlbums: ['abc'],
    plays: { 'doc://a.flac': 3 },
    progress: { 'doc://c.m4b': 620 },
    spoken: { abc: 'audiobook' },
    heard: ['doc://d.flac'],
    sessions: { abc: 30 },
    edits: { tracks: {}, artists: {} },
  },
  playlists: [{ id: 'p1', name: 'Noite', trackIds: ['doc://a.flac'], createdAt: 5 }],
  plays: [play(1000, 'doc://a.flac')],
};

test('um backup completo volta inteiro', () => {
  const parsed = parseBackup(full);
  assert.ok(parsed);
  assert.equal(parsed.version, BACKUP_VERSION);
  assert.deepEqual(parsed.prefs.liked, ['doc://a.flac', 'doc://b.flac']);
  assert.deepEqual(parsed.prefs.plays, { 'doc://a.flac': 3 });
  assert.equal(parsed.playlists.length, 1);
  assert.equal(parsed.playlists[0].name, 'Noite');
  assert.equal(parsed.plays.length, 1);
});

test('o envelope recusa o arquivo inteiro', () => {
  assert.equal(parseBackup(null), null);
  assert.equal(parseBackup('texto'), null);
  assert.equal(parseBackup([]), null);
  // Sem versão, ou de uma versão que este app não conhece.
  assert.equal(parseBackup({ prefs: {} }), null);
  assert.equal(parseBackup({ ...full, version: BACKUP_VERSION + 1 }), null);
  assert.equal(parseBackup({ ...full, version: 0 }), null);
});

test('campo estranho é descartado, e o resto do backup sobrevive', () => {
  const parsed = parseBackup({
    version: 1,
    prefs: {
      liked: ['doc://a.flac', 42, null, 'doc://b.flac'],
      plays: { 'doc://a.flac': 'muitas', 'doc://b.flac': 2 },
      sessions: 'quebrado',
    },
    playlists: [{ id: 'p1', name: 'Boa' }, { name: 'sem id' }, 7],
    plays: [play(1, 'x'), { at: 'ontem', trackId: 'y' }, { at: 2 }],
  });
  assert.ok(parsed);
  // As curtidas válidas ficam; o lixo sai.
  assert.deepEqual(parsed.prefs.liked, ['doc://a.flac', 'doc://b.flac']);
  assert.deepEqual(parsed.prefs.plays, { 'doc://b.flac': 2 });
  assert.deepEqual(parsed.prefs.sessions, {});
  // Só a lista com id e nome.
  assert.equal(parsed.playlists.length, 1);
  assert.deepEqual(parsed.playlists[0].trackIds, []);
  // Só a escuta com `at` numérico, `trackId` e `seconds`.
  assert.equal(parsed.plays.length, 1);
});

/** O teste que justifica `newPlays`: importar duas vezes não pode dobrar o histórico. */
test('importar o mesmo arquivo duas vezes não duplica escuta', () => {
  const existing = [play(1000, 'a'), play(2000, 'b')];
  const incoming = [play(1000, 'a'), play(2000, 'b'), play(3000, 'c')];
  assert.deepEqual(newPlays(existing, incoming), [play(3000, 'c')]);
  // E na segunda passada não sobra nada.
  assert.deepEqual(newPlays([...existing, play(3000, 'c')], incoming), []);
});

test('escuta repetida dentro do próprio arquivo entra uma vez só', () => {
  assert.deepEqual(newPlays([], [play(1, 'a'), play(1, 'a')]), [play(1, 'a')]);
});

test('a mesma faixa em instantes diferentes são duas escutas', () => {
  assert.equal(newPlays([play(1, 'a')], [play(2, 'a')]).length, 1);
});

test('curtidas se unem, preservando a ordem e sem repetir', () => {
  assert.deepEqual(union(['a', 'b'], ['b', 'c']), ['a', 'b', 'c']);
  assert.deepEqual(union([], ['a']), ['a']);
  assert.deepEqual(union(['a'], []), ['a']);
});

test('contagens somam, porque as duas são escutas que aconteceram', () => {
  assert.deepEqual(addCounts({ a: 2, b: 1 }, { a: 3, c: 5 }), { a: 5, b: 1, c: 5 });
});

test('progresso não soma: a posição mais adiantada vence', () => {
  assert.deepEqual(furthest({ a: 600 }, { a: 120 }), { a: 600 });
  assert.deepEqual(furthest({ a: 120 }, { a: 600 }), { a: 600 });
  assert.deepEqual(furthest({}, { a: 30 }), { a: 30 });
});

test('a senha do servidor nunca aparece num backup lido', () => {
  // Mesmo que alguém a ponha no arquivo à mão, ela não tem campo para onde ir.
  const parsed = parseBackup({ ...full, prefs: { ...full.prefs, server: { password: 'x' } } });
  assert.ok(parsed);
  assert.ok(!('server' in parsed.prefs));
});
