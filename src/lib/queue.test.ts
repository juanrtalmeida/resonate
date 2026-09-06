/** node --test src/lib/queue.test.ts */
import assert from 'node:assert/strict';
import test from 'node:test';

import { continuationFor, moveItem, shuffle } from './queue.ts';
import type { Track } from './scan.ts';

let seq = 0;
const track = (over: Partial<Track> = {}): Track => {
  const id = `file:///m/${++seq}.flac`;
  return {
    id,
    uri: id,
    file: `${seq}.flac`,
    folder: 'file:///m',
    title: `Faixa ${seq}`,
    artist: 'Artista A',
    album: 'Disco A',
    albumArtist: null,
    trackNumber: seq,
    genre: 'Shoegaze',
    duration: 180,
    albumId: 'a1',
    hasLyrics: false,
    ...over,
  };
};

/** Aleatório determinístico, para o embaralhamento ser verificável. */
const fixedRandom = () => {
  let n = 0;
  return () => ((n = (n * 9301 + 49297) % 233280), n / 233280);
};

test('modo off não devolve nada', () => {
  const a = track();
  assert.deepEqual(continuationFor('off', a, [a, track()], new Set([a.id])), []);
});

test('álbum: só o mesmo albumId, em ordem de faixa', () => {
  const current = track({ albumId: 'a1', trackNumber: 1 });
  const same = track({ albumId: 'a1', trackNumber: 3 });
  const before = track({ albumId: 'a1', trackNumber: 2 });
  const other = track({ albumId: 'a2', trackNumber: 1 });

  const out = continuationFor(
    'album',
    current,
    [current, same, before, other],
    new Set([current.id])
  );
  assert.deepEqual(
    out.map((t) => t.trackNumber),
    [2, 3]
  );
});

test('artista: pega o mesmo artista mesmo em outro álbum', () => {
  const current = track({ artist: 'Kō', albumId: 'a1' });
  const same = track({ artist: 'Kō', albumId: 'a9' });
  const other = track({ artist: 'Outro', albumId: 'a9' });

  const out = continuationFor('artist', current, [current, same, other], new Set([current.id]));
  assert.deepEqual(
    out.map((t) => t.id),
    [same.id]
  );
});

test('artista: casa também pelo artista do álbum', () => {
  const current = track({ artist: 'Convidado', albumArtist: 'Kō' });
  const same = track({ artist: 'Kō' });
  const out = continuationFor('artist', current, [current, same], new Set([current.id]));
  assert.equal(out.length, 1);
});

test('gênero: mesmo gênero, de outros artistas', () => {
  const current = track({ artist: 'Kō', genre: 'Shoegaze' });
  const sameArtist = track({ artist: 'Kō', genre: 'Shoegaze' });
  const otherArtist = track({ artist: 'Slowdive-ish', genre: 'Shoegaze' });
  const otherGenre = track({ artist: 'Terceiro', genre: 'Bossa' });

  const out = continuationFor(
    'genre',
    current,
    [current, sameArtist, otherArtist, otherGenre],
    new Set([current.id]),
    fixedRandom()
  );
  assert.deepEqual(
    out.map((t) => t.id),
    [otherArtist.id]
  );
});

test('gênero: compara sem caixa nem espaços', () => {
  const current = track({ artist: 'A', genre: ' Shoegaze ' });
  const other = track({ artist: 'B', genre: 'shoegaze' });
  const out = continuationFor('genre', current, [current, other], new Set([current.id]));
  assert.equal(out.length, 1);
});

test('gênero: sem gênero na faixa atual, não há continuação', () => {
  const current = track({ genre: null });
  const other = track({ artist: 'B', genre: 'Shoegaze' });
  assert.deepEqual(continuationFor('genre', current, [current, other], new Set([current.id])), []);
});

test('nunca repete o que já está na fila', () => {
  const current = track({ albumId: 'a1' });
  const queued = track({ albumId: 'a1' });
  const free = track({ albumId: 'a1' });
  const out = continuationFor(
    'album',
    current,
    [current, queued, free],
    new Set([current.id, queued.id])
  );
  assert.deepEqual(
    out.map((t) => t.id),
    [free.id]
  );
});

test('anexa no máximo 30 de uma vez', () => {
  const current = track({ albumId: 'a1' });
  const many = Array.from({ length: 80 }, () => track({ albumId: 'a1' }));
  const out = continuationFor('album', current, [current, ...many], new Set([current.id]));
  assert.equal(out.length, 30);
});

test('shuffle não muta a entrada', () => {
  const items = [1, 2, 3, 4, 5];
  const out = shuffle(items, fixedRandom());
  assert.deepEqual(items, [1, 2, 3, 4, 5]);
  assert.equal(out.length, 5);
  assert.deepEqual([...out].sort(), [1, 2, 3, 4, 5]);
});

test('moveItem reordena sem mutar', () => {
  const items = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveItem(items, 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveItem(items, 3, 0), ['d', 'a', 'b', 'c']);
  assert.deepEqual(items, ['a', 'b', 'c', 'd']);
});

test('moveItem ignora índices inválidos', () => {
  const items = ['a', 'b'];
  assert.equal(moveItem(items, 0, 0), items);
  assert.equal(moveItem(items, -1, 1), items);
  assert.equal(moveItem(items, 0, 9), items);
});
