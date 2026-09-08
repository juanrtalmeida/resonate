/** node --test src/lib/spoken.test.ts */
import assert from 'node:assert/strict';
import test from 'node:test';

import { finished, spokenOf, LONG } from './spoken.ts';
import type { Track } from './scan.ts';

const track = (over: Partial<Track>): Track => ({
  id: 'x',
  uri: 'file:///x.mp3',
  file: 'x.mp3',
  folder: '/',
  title: 'x',
  artist: 'x',
  album: 'x',
  albumArtist: null,
  trackNumber: null,
  genre: null,
  duration: 200,
  albumId: 'alb',
  hasLyrics: false,
  ...over,
});

test('a tag de gênero classifica', () => {
  assert.equal(spokenOf(track({ genre: 'Podcast' })), 'podcast');
  assert.equal(spokenOf(track({ genre: 'podcasts & talk' })), 'podcast');
  assert.equal(spokenOf(track({ genre: 'Audiobook' })), 'audiobook');
  assert.equal(spokenOf(track({ genre: 'Audiolivro' })), 'audiobook');
  assert.equal(spokenOf(track({ genre: 'Rock' })), null);
  assert.equal(spokenOf(track({ genre: null })), null);
});

test('livro vence podcast quando as duas palavras aparecem', () => {
  assert.equal(spokenOf(track({ genre: 'Podcast de audiolivro' })), 'audiobook');
});

test('faixa longa sem tag vira podcast', () => {
  assert.equal(spokenOf(track({ duration: LONG })), 'podcast');
  assert.equal(spokenOf(track({ duration: LONG - 1 })), null);
  assert.equal(spokenOf(track({ duration: null })), null);
});

test('a marca manual vence tudo', () => {
  const long = track({ duration: LONG, genre: 'Podcast' });
  assert.equal(spokenOf(long, { alb: 'music' }), null);
  assert.equal(spokenOf(long, { alb: 'audiobook' }), 'audiobook');
  assert.equal(spokenOf(track({ genre: 'Rock' }), { alb: 'podcast' }), 'podcast');
  // Marca de outro álbum não vale para esta faixa.
  assert.equal(spokenOf(track({ genre: 'Rock' }), { outro: 'podcast' }), null);
});

test('terminar é chegar perto do fim', () => {
  assert.ok(finished(1790, 1800));
  assert.ok(!finished(900, 1800));
  assert.ok(!finished(10, null));
});
