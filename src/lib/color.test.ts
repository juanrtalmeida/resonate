/** node --test src/lib/color.test.ts */
import assert from 'node:assert/strict';
import test from 'node:test';

import { hsl, isHex, toHsl } from './color.ts';

test('hsl acerta os vértices do cubo', () => {
  assert.equal(hsl(0, 100, 50), '#ff0000');
  assert.equal(hsl(120, 100, 50), '#00ff00');
  assert.equal(hsl(240, 100, 50), '#0000ff');
  assert.equal(hsl(0, 0, 100), '#ffffff');
  assert.equal(hsl(0, 0, 0), '#000000');
});

test('ida e volta devolve a mesma cor', () => {
  // Os quatro acentos do design: o seletor abre neles, então a conversão tem de fechar.
  for (const hex of ['#F2653A', '#E8B44A', '#5FBFA8', '#8A6BD1']) {
    const { h, s, l } = toHsl(hex);
    assert.equal(hsl(h, s, l), hex.toLowerCase());
  }
});

test('isHex recusa o que não é cor', () => {
  assert.ok(isHex('#F2653A'));
  assert.ok(!isHex('#F26'));
  assert.ok(!isHex('rgba(1,2,3,1)'));
  assert.ok(!isHex(undefined));
});
