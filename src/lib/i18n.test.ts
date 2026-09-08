/** node --test src/lib/i18n.test.ts */
import assert from 'node:assert/strict';
import test from 'node:test';

import { deviceLang, localeOf, resolveLang, translate, LANGS } from './i18n.ts';

test('traduz nos cinco idiomas', () => {
  assert.equal(translate('pt', 'nav.library'), 'Biblioteca');
  assert.equal(translate('en', 'nav.library'), 'Library');
  assert.equal(translate('es', 'nav.settings'), 'Ajustes');
  assert.equal(translate('ja', 'nav.search'), '検索');
  assert.equal(translate('zh', 'tab.albums'), '专辑');
});

test('interpola por nome', () => {
  assert.equal(translate('en', 'search.none.body', { query: 'nick' }), 'No results for “nick”.');
  assert.equal(
    translate('pt', 'lib.stats', { tracks: 10, albums: 2, hours: 1 }),
    '10 faixas · 2 álbuns · 1 h'
  );
});

test('escolhe singular quando n vale 1', () => {
  assert.equal(translate('pt', 'count.tracks', { n: 1 }), '1 faixa');
  assert.equal(translate('pt', 'count.tracks', { n: 4 }), '4 faixas');
  assert.equal(translate('en', 'count.albums', { n: 1 }), '1 album');
  assert.equal(translate('en', 'count.albums', { n: 9 }), '9 albums');
  // Japonês e chinês não contam plural: as duas formas existem e são iguais.
  assert.equal(translate('ja', 'count.tracks', { n: 1 }), '1曲');
  assert.equal(translate('zh', 'count.chapters', { n: 3 }), '3 章');
});

test('chave sem plural ignora o n', () => {
  assert.equal(translate('pt', 'count.files', { n: 1 }), '1 arquivos'.replace('1 arquivos', '1 arquivos'));
});

test('auto resolve para o idioma do aparelho, e o resto para si mesmo', () => {
  assert.equal(resolveLang('ja'), 'ja');
  assert.equal(resolveLang('auto'), deviceLang());
  assert.ok(LANGS.some((l) => l.key === deviceLang()));
});

test('etiqueta de locale por idioma', () => {
  assert.equal(localeOf('pt'), 'pt-BR');
  assert.equal(localeOf('zh'), 'zh-CN');
  assert.equal(localeOf('en'), 'en-US');
});
