/** node --test src/lib/gain.test.ts */
import assert from 'node:assert/strict';
import test from 'node:test';

import { dbToVolume, gainVolume, parseGain, NO_GAIN } from './gain.ts';

test('o formato do padrão, e as variações que aparecem na prática', () => {
  assert.equal(parseGain('-7.53 dB'), -7.53);
  assert.equal(parseGain('-7.53dB'), -7.53);
  assert.equal(parseGain('-7.53'), -7.53);
  assert.equal(parseGain('+2.10 dB'), 2.1);
  assert.equal(parseGain('2.10 dB'), 2.1);
  // Vírgula decimal: ferramenta rodando em locale pt/es grava assim.
  assert.equal(parseGain('-7,53 dB'), -7.53);
  assert.equal(parseGain('  -7.53 dB  '), -7.53);
});

test('zero é medida válida, não ausência', () => {
  assert.equal(parseGain('0.00 dB'), 0);
  assert.equal(parseGain('0'), 0);
  // E zero dB não mexe no volume.
  assert.equal(dbToVolume(0), 1);
});

test('o que não é número vira null', () => {
  assert.equal(parseGain(''), null);
  assert.equal(parseGain(null), null);
  assert.equal(parseGain(undefined), null);
  assert.equal(parseGain('dB'), null);
  assert.equal(parseGain('desconhecido'), null);
});

/**
 * O teste que justifica o módulo: decibel de amplitude usa 20, não 10.
 *
 * Com 10 o efeito sai ao quadrado e a biblioteca inteira soa abafada — −6 dB viraria 0,25.
 */
test('decibéis viram amplitude com o expoente sobre 20', () => {
  assert.ok(Math.abs(dbToVolume(-6) - 0.501) < 0.002);
  assert.ok(Math.abs(dbToVolume(-20) - 0.1) < 0.001);
  assert.ok(Math.abs(dbToVolume(-3) - 0.708) < 0.002);
});

test('ganho positivo não passa do volume cheio', () => {
  assert.equal(dbToVolume(3), 1);
  assert.equal(dbToVolume(12), 1);
});

test('o piso impede que uma tag corrompida deixe a faixa inaudível', () => {
  assert.equal(dbToVolume(-60), 0.05);
  assert.equal(dbToVolume(-1000), 0.05);
});

test('desligado é sempre volume cheio, mesmo com ganho na tag', () => {
  assert.equal(gainVolume({ track: -12, album: -9 }, 'off'), 1);
});

test('o modo álbum prefere o ganho do álbum; o modo faixa, o da faixa', () => {
  const gain = { track: -12, album: -6 };
  assert.equal(gainVolume(gain, 'album'), dbToVolume(-6));
  assert.equal(gainVolume(gain, 'track'), dbToVolume(-12));
});

test('cada modo cai no outro ganho quando o dele falta', () => {
  assert.equal(gainVolume({ track: -8, album: null }, 'album'), dbToVolume(-8));
  assert.equal(gainVolume({ track: null, album: -4 }, 'track'), dbToVolume(-4));
});

test('sem tag nenhuma, volume cheio nos dois modos', () => {
  assert.equal(gainVolume(NO_GAIN, 'album'), 1);
  assert.equal(gainVolume(NO_GAIN, 'track'), 1);
});
