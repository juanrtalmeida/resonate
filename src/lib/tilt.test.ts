/** node --test src/lib/tilt.test.ts */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createTilt, TILT_MAX } from './tilt.ts';

test('primeira leitura é a referência: nasce no centro', () => {
  const step = createTilt();
  assert.deepEqual(step(0.4, -0.9), { rx: -0, ry: 0 });
});

test('aparelho parado fora do reto continua no centro', () => {
  const step = createTilt();
  let last = { rx: 0, ry: 0 };
  for (let i = 0; i < 50; i++) last = step(0.4, -0.9);
  assert.ok(Math.abs(last.ry) < 0.01, `ry=${last.ry}`);
  assert.ok(Math.abs(last.rx) < 0.01, `rx=${last.rx}`);
});

test('inclinar move a capa, dentro da amplitude', () => {
  const step = createTilt();
  step(0, 0);
  let last = { rx: 0, ry: 0 };
  for (let i = 0; i < 20; i++) last = step(0.5, 0);
  assert.ok(last.ry > 1, `ry=${last.ry}`);
  assert.ok(last.ry <= TILT_MAX, `ry=${last.ry}`);
});

test('inclinação mantida volta ao centro', () => {
  const step = createTilt();
  step(0, 0);
  let last = { rx: 0, ry: 0 };
  for (let i = 0; i < 400; i++) last = step(0.5, 0);
  assert.ok(Math.abs(last.ry) < 0.2, `ry=${last.ry}`);
});
