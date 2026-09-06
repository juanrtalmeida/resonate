/** node --test src/lib/lrc.test.ts */
import assert from 'node:assert/strict';
import test from 'node:test';

import { lineAt, lineProgress, parseLrc } from './lrc.ts';

test('LRC sincronizado', () => {
  const { synced, lines } = parseLrc(
    ['[00:12.00]primeira', '[00:17.50]segunda', '[01:05.25]terceira'].join('\n')
  );
  assert.equal(synced, true);
  assert.deepEqual(
    lines.map((l) => l.time),
    [12, 17.5, 65.25]
  );
  assert.equal(lines[2].text, 'terceira');
});

test('carimbo com milissegundos de três dígitos', () => {
  assert.equal(parseLrc('[00:03.125]texto').lines[0].time, 3.125);
});

test('carimbo sem fração', () => {
  assert.equal(parseLrc('[02:07]texto').lines[0].time, 127);
});

test('a mesma linha em vários momentos vira várias entradas ordenadas', () => {
  const { lines } = parseLrc(['[00:40.00][00:10.00]refrão', '[00:25.00]verso'].join('\n'));
  assert.deepEqual(
    lines.map((l) => [l.time, l.text]),
    [
      [10, 'refrão'],
      [25, 'verso'],
      [40, 'refrão'],
    ]
  );
});

test('metadados do cabeçalho são descartados', () => {
  const { lines } = parseLrc(['[ti:Titulo]', '[ar:Artista]', '[00:05.00]texto'].join('\n'));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].text, 'texto');
});

test('letra sem carimbo continua valendo, marcada como não sincronizada', () => {
  const { synced, lines } = parseLrc('primeira\n\nsegunda');
  assert.equal(synced, false);
  assert.deepEqual(
    lines.map((l) => l.text),
    ['primeira', 'segunda']
  );
  assert.equal(lines[0].time, null);
});

test('carimbo no meio da linha não conta como tempo', () => {
  const { lines } = parseLrc('texto [00:12.00] mais texto');
  assert.equal(lines[0].time, null);
  assert.equal(lines[0].text, 'texto [00:12.00] mais texto');
});

test('lineAt', () => {
  const { lines } = parseLrc(['[00:10.00]a', '[00:20.00]b', '[00:30.00]c'].join('\n'));
  assert.equal(lineAt(lines, 0), -1, 'antes do primeiro carimbo');
  assert.equal(lineAt(lines, 10), 0, 'exatamente no carimbo');
  assert.equal(lineAt(lines, 25), 1);
  assert.equal(lineAt(lines, 999), 2, 'depois da última');
});

test('lineProgress', () => {
  const { lines } = parseLrc(['[00:10.00]a', '[00:20.00]b'].join('\n'));
  assert.equal(lineProgress(lines, 0, 15, 60), 0.5);
  assert.equal(lineProgress(lines, 0, 10, 60), 0);
  // A última linha se estende até o fim da faixa.
  assert.equal(lineProgress(lines, 1, 40, 60), 0.5);
});

test('sem letra, sem linhas', () => {
  assert.deepEqual(parseLrc('').lines, []);
  assert.deepEqual(parseLrc('   \n  ').lines, []);
});
