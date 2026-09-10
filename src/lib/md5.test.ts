/** node --test src/lib/md5.test.ts */
import assert from 'node:assert/strict';
import test from 'node:test';

import { md5 } from './md5.ts';

/**
 * Os vetores do apêndice A.5 do RFC 1321, literais.
 *
 * São eles que dão sentido a ter escrito MD5 à mão: um hash errado não parece errado, ele
 * parece "senha inválida" num servidor que está perfeitamente certo.
 */
test('os vetores do RFC 1321', () => {
  assert.equal(md5(''), 'd41d8cd98f00b204e9800998ecf8427e');
  assert.equal(md5('a'), '0cc175b9c0f1b6a831c399e269772661');
  assert.equal(md5('abc'), '900150983cd24fb0d6963f7d28e17f72');
  assert.equal(md5('message digest'), 'f96b697d7cb7938d525a2f31aaf161d0');
  assert.equal(md5('abcdefghijklmnopqrstuvwxyz'), 'c3fcd3d76192e4007dfb496cca67e13b');
  assert.equal(
    md5('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'),
    'd174ab98d277d9f5a5611c2c9f419d9f'
  );
  assert.equal(
    md5('12345678901234567890123456789012345678901234567890123456789012345678901234567890'),
    '57edf4a22be3c955ac49da2e2107b67a'
  );
});

/**
 * As bordas do preenchimento.
 *
 * 55, 56 e 64 bytes são exatamente onde o bloco vira: 55 é o último que cabe com o
 * comprimento no mesmo bloco, 56 é o primeiro que força um bloco extra, e 64 é o múltiplo
 * exato. Um erro no `while (bytes.length % 64 !== 56)` passa em "abc" e falha só aqui.
 */
test('as bordas do preenchimento de bloco', () => {
  assert.equal(md5('a'.repeat(55)), 'ef1772b6dff9a122358552954ad0df65');
  assert.equal(md5('a'.repeat(56)), '3b0c8ac703f828b04c6c197006d17218');
  assert.equal(md5('a'.repeat(63)), 'b06521f39153d618550606be297466d5');
  assert.equal(md5('a'.repeat(64)), '014842d480b571495a4a0363793f7367');
  assert.equal(md5('a'.repeat(65)), 'c743a45e0d2e6a95cb859adae0248435');
});

/** UTF-8: a senha do usuário pode ter acento, e o servidor hasheia os bytes, não as letras. */
test('a senha em UTF-8 vale pelos bytes dela', () => {
  assert.equal(md5('é'), '66ddcd97cfdeabb2f6fb8a999b4bc76f');
  assert.equal(md5('señor'), '528059d6e5084feff6cbb1d11dbb19ee');
  // Fora do BMP: emoji é par surrogate, e juntar os dois meios é o que dá os 4 bytes.
  assert.equal(md5('🎵'), '571a5ba7aec0b965e1f2f6e272a279fa');
});

/**
 * A forma que o Subsonic pede: `md5(senha + salt)`.
 *
 * Não é um vetor do RFC, é o contrato do protocolo — o teste existe para fixar a **ordem**
 * da concatenação, que é o erro fácil e silencioso: `md5(salt + senha)` é um hash
 * perfeitamente válido que nenhum servidor aceita.
 */
test('o token do Subsonic é md5(senha + salt), nessa ordem', () => {
  const senha = 'sesame';
  const salt = 'c19b2d';
  assert.equal(md5(senha + salt), '26719a1196d2a940705a59634eb18eab');
  assert.notEqual(md5(senha + salt), md5(salt + senha));
});
