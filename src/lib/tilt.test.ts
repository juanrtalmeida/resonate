/** node --test src/lib/tilt.test.ts */
import assert from 'node:assert/strict';
import test from 'node:test';

import { TILT_MAX, TILT_REST, tiltAngles, tiltStep } from './tilt.ts';

/** Roda n leituras iguais e devolve os ângulos no fim. */
function hold(x: number, y: number, n: number, from = TILT_REST) {
  let s = from;
  for (let i = 0; i < n; i++) s = tiltStep(s, x, y);
  return { state: s, ...tiltAngles(s) };
}

test('primeira leitura é a referência: nasce no centro', () => {
  const { rx, ry } = hold(0.4, -0.9, 1);
  assert.equal(rx, -0);
  assert.equal(ry, 0);
});

test('aparelho parado fora do reto continua no centro', () => {
  const { rx, ry } = hold(0.4, -0.9, 50);
  assert.ok(Math.abs(ry) < 0.01, `ry=${ry}`);
  assert.ok(Math.abs(rx) < 0.01, `rx=${rx}`);
});

test('inclinar move a capa, dentro da amplitude', () => {
  const rest = tiltStep(TILT_REST, 0, 0);
  const { ry } = hold(0.5, 0, 20, rest);
  assert.ok(ry > 1, `ry=${ry}`);
  assert.ok(ry <= TILT_MAX, `ry=${ry}`);
});

test('inclinação mantida volta ao centro', () => {
  const rest = tiltStep(TILT_REST, 0, 0);
  const { ry } = hold(0.5, 0, 400, rest);
  assert.ok(Math.abs(ry) < 0.2, `ry=${ry}`);
});

test('o passo não muda o estado que recebe', () => {
  const before = tiltStep(TILT_REST, 0, 0);
  const snapshot = { ...before };
  tiltStep(before, 0.5, 0.2);
  assert.deepEqual(before, snapshot);
});
