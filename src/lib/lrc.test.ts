/** node --test src/lib/lrc.test.ts */
import assert from 'node:assert/strict';
import test from 'node:test';

import { lineAt, lineProgress, parseLrc, wordAt } from './lrc.ts';

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

test('carimbo por palavra sai do texto e vira trechos cronometrados', () => {
  const { synced, lines } = parseLrc('[00:10.00]<00:10.00>um <00:10.50>dois <00:11.20>três');
  assert.equal(synced, true);
  assert.equal(lines[0].time, 10);
  assert.equal(lines[0].text, 'um dois três', 'nenhum carimbo sobra na letra');
  assert.deepEqual(lines[0].words, [
    { time: 10, text: 'um', space: true },
    { time: 10.5, text: 'dois', space: true },
    { time: 11.2, text: 'três', space: false },
  ]);
});

test('linha só com carimbo por palavra começa na primeira delas', () => {
  const { synced, lines } = parseLrc('<00:04.00>um <00:04.80>dois');
  assert.equal(synced, true);
  assert.equal(lines[0].time, 4);
  assert.equal(lines[0].text, 'um dois');
});

test('texto antes do primeiro carimbo por palavra fica com o tempo da linha', () => {
  const { lines } = parseLrc('[00:20.00]um <00:21.00>dois');
  assert.deepEqual(lines[0].words, [
    { time: 20, text: 'um', space: true },
    { time: 21, text: 'dois', space: false },
  ]);
});

test('refrão repetido não leva os carimbos por palavra junto', () => {
  const { lines } = parseLrc('[00:30.00][00:10.00]<00:10.00>um <00:10.50>dois');
  assert.equal(lines.length, 2);
  assert.equal(lines[0].text, 'um dois');
  assert.equal(lines[0].words, null, 'os tempos por palavra só valeriam na primeira vez');
});

test('linha sem carimbo por palavra continua sem trechos', () => {
  assert.equal(parseLrc('[00:12.00]uma frase inteira').lines[0].words, null);
});

test('wordAt', () => {
  const words = parseLrc('[00:10.00]<00:10.00>um <00:12.00>dois').lines[0].words!;
  assert.equal(wordAt(words, 9), -1, 'antes da primeira');
  assert.equal(wordAt(words, 10), 0, 'exatamente no carimbo');
  assert.equal(wordAt(words, 11.9), 0);
  assert.equal(wordAt(words, 99), 1, 'depois da última');
});

test('palavra partida em sílabas não ganha espaço no meio', () => {
  const { lines } = parseLrc('[00:10.00]<00:10.00>can<00:10.40>tan<00:10.80>do <00:11.50>bem');
  assert.deepEqual(
    lines[0].words?.map((w) => [w.text, w.space]),
    [
      ['can', false],
      ['tan', false],
      ['do', true],
      ['bem', false],
    ]
  );
  assert.equal(lines[0].text, 'cantando bem');
});

test('espaço depois do carimbo também separa', () => {
  const { lines } = parseLrc('[00:10.00]<00:10.00>um<00:10.50> dois');
  assert.deepEqual(
    lines[0].words?.map((w) => [w.text, w.space]),
    [
      ['um', true],
      ['dois', false],
    ]
  );
  assert.equal(lines[0].text, 'um dois');
});
