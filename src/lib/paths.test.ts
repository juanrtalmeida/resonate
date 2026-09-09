/** node --test src/lib/paths.test.ts */
import assert from 'node:assert/strict';
import test from 'node:test';

import { DOC, mapKeys, toAbsolute, toPortable } from './paths.ts';

const ROOT = 'file:///var/mobile/Containers/Data/Application/AAAA-1111/Documents';
const OTHER = 'file:///var/mobile/Containers/Data/Application/BBBB-2222/Documents/';

test('recorta a raiz atual', () => {
  assert.equal(toPortable(ROOT, `${ROOT}/Music/x.flac`), `${DOC}Music/x.flac`);
  assert.equal(toPortable(`${ROOT}/`, `${ROOT}/Music/x.flac`), `${DOC}Music/x.flac`);
});

test('remonta contra a raiz que vale agora', () => {
  assert.equal(toAbsolute(OTHER, `${DOC}Music/x.flac`), `${OTHER}Music/x.flac`);
  assert.equal(toAbsolute(`${ROOT}`, `${DOC}covers/a1.jpg`), `${ROOT}/covers/a1.jpg`);
});

test('a ida e a volta preservam o caminho', () => {
  const uri = `${ROOT}/Music/Vela Norte/01 Beira de Rio.flac`;
  assert.equal(toAbsolute(ROOT, toPortable(ROOT, uri)), uri);
});

test('é idempotente: converter de novo não corrói', () => {
  const once = toPortable(ROOT, `${ROOT}/Music/x.flac`);
  assert.equal(toPortable(ROOT, once), once);
  assert.equal(toPortable(OTHER, once), once);
});

test('resgata um caminho de container antigo', () => {
  // É o caso que o bug deixou pelo caminho: gravado com um UUID que não existe mais.
  assert.equal(toPortable(OTHER, `${ROOT}/Music/x.flac`), `${DOC}Music/x.flac`);
});

test('não toca no que já é estável', () => {
  const saf = 'content://com.android.externalstorage.documents/tree/primary%3AMusic';
  const store = 'file:///storage/emulated/0/Music/x.mp3';
  assert.equal(toPortable(ROOT, saf), saf);
  assert.equal(toPortable(ROOT, store), store);
  assert.equal(toAbsolute(ROOT, saf), saf);
  assert.equal(toAbsolute(ROOT, store), store);
});

test('não recorta uma pasta Documents do usuário no Android', () => {
  const android = 'file:///storage/emulated/0/Documents/Music/x.mp3';
  assert.equal(toPortable(ROOT, android), android);
});

test('vazio passa intacto', () => {
  assert.equal(toPortable(ROOT, ''), '');
});

test('mapKeys converte as chaves e preserva os valores', () => {
  const before = { [`${ROOT}/a.flac`]: 3, 'content://b': 1 };
  const after = mapKeys(before, (k) => toPortable(ROOT, k));
  assert.deepEqual(after, { [`${DOC}a.flac`]: 3, 'content://b': 1 });
});
