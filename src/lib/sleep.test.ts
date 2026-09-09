/** node --test src/lib/sleep.test.ts */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  expired,
  fadeVolume,
  FADE_SECONDS,
  leftOf,
  sleepLabel,
  SLEEP_OFF,
  startClock,
  stopsAtTrackEnd,
} from './sleep.ts';

const T0 = 1_700_000_000_000;
const min = (n: number) => n * 60_000;

test('o relógio marca o fim a partir de agora', () => {
  const sleep = startClock(30, T0);
  assert.equal(leftOf(sleep, T0), 30 * 60);
  assert.equal(leftOf(sleep, T0 + min(29)), 60);
});

test('não conta tempo negativo depois de vencer', () => {
  const sleep = startClock(5, T0);
  assert.equal(leftOf(sleep, T0 + min(9)), 0);
});

test('vence exatamente na hora, não antes', () => {
  const sleep = startClock(15, T0);
  assert.equal(expired(sleep, T0 + min(15) - 1), false);
  assert.equal(expired(sleep, T0 + min(15)), true);
});

test('desligado e "fim da faixa" não têm relógio', () => {
  assert.equal(leftOf(SLEEP_OFF, T0), null);
  assert.equal(leftOf({ kind: 'track' }, T0), null);
  assert.equal(expired(SLEEP_OFF, T0 + min(999)), false);
  assert.equal(expired({ kind: 'track' }, T0 + min(999)), false);
});

test('só "fim da faixa" para no fim da faixa', () => {
  assert.equal(stopsAtTrackEnd({ kind: 'track' }), true);
  assert.equal(stopsAtTrackEnd(SLEEP_OFF), false);
  assert.equal(stopsAtTrackEnd(startClock(30, T0)), false);
});

test('o esmaecimento só começa dentro da janela', () => {
  assert.equal(fadeVolume(600), 1);
  assert.equal(fadeVolume(FADE_SECONDS), 1);
  assert.equal(fadeVolume(FADE_SECONDS / 2), 0.5);
  assert.equal(fadeVolume(0), 0);
  assert.equal(fadeVolume(-3), 0);
});

test('o rótulo vira segundos no último minuto', () => {
  const sleep = startClock(30, T0);
  assert.equal(sleepLabel(sleep, T0), '30');
  // 90 s restantes ainda contam em minutos, arredondando para cima.
  assert.equal(sleepLabel(sleep, T0 + min(28.5)), '2');
  assert.equal(sleepLabel(sleep, T0 + min(29.5)), '30s');
  assert.equal(sleepLabel(SLEEP_OFF, T0), null);
  assert.equal(sleepLabel({ kind: 'track' }, T0), '·');
});
