/** node --test src/lib/smart.test.ts */
import assert from 'node:assert/strict';
import test from 'node:test';

import { FORGOTTEN_DAYS, smartList, type SmartInput } from './smart.ts';
import type { Track } from './scan.ts';

const DAY = 86_400_000;
const NOW = new Date(2026, 8, 9, 12).getTime();

const track = (id: string, title = id): Track => ({
  id,
  uri: `file:///${id}.flac`,
  file: `${id}.flac`,
  folder: '/Music',
  title,
  artist: 'A',
  album: 'Al',
  albumArtist: null,
  trackNumber: null,
  genre: null,
  duration: 200,
  albumId: 'al',
  hasLyrics: false,
  trackGain: null,
  albumGain: null,
});

/**
 * Quatro faixas que cobrem os quatro estados: nunca tocada, em rotação, esquecida, e uma
 * com contagem mas sem data (o caso de quem apagou o histórico).
 */
const tracks = [track('nunca'), track('agora'), track('antiga'), track('semData')];

const input = (over: Partial<SmartInput> = {}): SmartInput => ({
  tracks,
  playsOf: (id) => ({ nunca: 0, agora: 12, antiga: 3, semData: 5 })[id] ?? 0,
  lastPlayed: new Map([
    ['agora', NOW - 2 * DAY],
    ['antiga', NOW - (FORGOTTEN_DAYS + 30) * DAY],
  ]),
  now: NOW,
  ...over,
});

const ids = (list: Track[]) => list.map((t) => t.id);

test('"tudo" devolve a lista como ela chegou', () => {
  assert.deepEqual(ids(smartList('all', input())), ['nunca', 'agora', 'antiga', 'semData']);
});

test('nunca ouvidas exige zero nas duas fontes', () => {
  // `semData` tem contagem 5 e nenhuma data: já foi ouvida, e fica fora.
  assert.deepEqual(ids(smartList('unplayed', input())), ['nunca']);
});

test('mais tocadas ordena por contagem, e desempata por título', () => {
  assert.deepEqual(ids(smartList('most', input())), ['agora', 'semData', 'antiga']);
  // `nunca` não entra: contagem zero.
  assert.ok(!ids(smartList('most', input())).includes('nunca'));
});

test('mais tocadas com contagens iguais fica em ordem de título', () => {
  const same = [track('b', 'Beta'), track('a', 'Alfa')];
  const list = smartList('most', input({ tracks: same, playsOf: () => 4 }));
  assert.deepEqual(
    list.map((t) => t.title),
    ['Alfa', 'Beta']
  );
});

test('desta semana pega só os últimos sete dias, do mais recente para o mais antigo', () => {
  const lastPlayed = new Map([
    ['agora', NOW - 1 * DAY],
    ['antiga', NOW - 3 * DAY],
    ['semData', NOW - 9 * DAY], // fora da janela
  ]);
  assert.deepEqual(ids(smartList('week', input({ lastPlayed }))), ['agora', 'antiga']);
});

test('esquecidas: tocadas alguma vez, e há mais de seis meses', () => {
  assert.deepEqual(ids(smartList('forgotten', input())), ['antiga']);
});

test('esquecidas exclui quem nunca tocou e quem não tem data', () => {
  const list = ids(smartList('forgotten', input()));
  assert.ok(!list.includes('nunca'));
  // Contagem sem data não dá para datar: não há como dizer *quando* foi esquecida.
  assert.ok(!list.includes('semData'));
});

test('a borda dos seis meses', () => {
  const dentro = new Map([['antiga', NOW - (FORGOTTEN_DAYS - 1) * DAY]]);
  assert.deepEqual(ids(smartList('forgotten', input({ lastPlayed: dentro }))), []);
  const fora = new Map([['antiga', NOW - (FORGOTTEN_DAYS + 1) * DAY]]);
  assert.deepEqual(ids(smartList('forgotten', input({ lastPlayed: fora }))), ['antiga']);
});

test('esquecidas ordena da mais antiga para a menos', () => {
  const lastPlayed = new Map([
    ['agora', NOW - 400 * DAY],
    ['antiga', NOW - 200 * DAY],
    ['semData', NOW - 900 * DAY],
  ]);
  assert.deepEqual(ids(smartList('forgotten', input({ lastPlayed }))), [
    'semData',
    'agora',
    'antiga',
  ]);
});

test('biblioteca vazia devolve lista vazia em todos os recortes', () => {
  const empty = input({ tracks: [], lastPlayed: new Map() });
  for (const key of ['all', 'unplayed', 'most', 'forgotten', 'week'] as const) {
    assert.deepEqual(smartList(key, empty), []);
  }
});

test('não muta a lista que recebeu', () => {
  const original = [...tracks];
  smartList('most', input());
  smartList('forgotten', input());
  smartList('week', input());
  assert.deepEqual(ids(tracks), ids(original));
});
