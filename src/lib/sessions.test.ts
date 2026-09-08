/** node --test src/lib/sessions.test.ts */
import assert from 'node:assert/strict';
import test from 'node:test';

import { reading } from './sessions.ts';

const M = 60;

test('desligado não devolve régua', () => {
  assert.equal(reading({ chapters: [3600], heard: [0] }, 0), null);
});

test('livro sem duração conhecida não devolve régua', () => {
  assert.equal(reading({ chapters: [null, null], heard: [0, 0] }, 30), null);
});

test('começo do livro é a sessão 1', () => {
  const r = reading({ chapters: [3600, 3600], heard: [0, 0] }, 30)!;
  assert.equal(r.at, 1);
  assert.equal(r.total, 4);
  assert.equal(r.left, 30 * M);
  assert.equal(r.done, 0);
});

test('a sessão avança com o ouvido, atravessando capítulo', () => {
  // 2h de livro, 45 min por sessão: 3 sessões. Ouvido 1h10 = 70 min → sessão 2.
  const r = reading({ chapters: [3600, 3600], heard: [3600, 10 * M] }, 45)!;
  assert.equal(r.total, 3);
  assert.equal(r.at, 2);
  assert.equal(r.left, 20 * M);
  assert.equal(Math.round(r.done * 100), 56);
});

test('a última sessão é o resto do livro, não um bloco cheio', () => {
  // 100 min, 45 por sessão: 3 sessões, a última com 10 min.
  const r = reading({ chapters: [100 * M], heard: [95 * M] }, 45)!;
  assert.equal(r.at, 3);
  assert.equal(r.total, 3);
  assert.equal(r.left, 5 * M);
});

test('no fim do livro a sessão não passa da última', () => {
  const r = reading({ chapters: [90 * M], heard: [90 * M] }, 30)!;
  assert.equal(r.at, 3);
  assert.equal(r.total, 3);
  assert.equal(r.left, 0);
});

test('ouvido além da duração não estoura a conta', () => {
  const r = reading({ chapters: [30 * M], heard: [99 * M] }, 30)!;
  assert.equal(r.at, 1);
  assert.equal(r.total, 1);
  assert.equal(r.left, 0);
});
