/**
 * MD5, em JavaScript puro.
 *
 * Existe por uma exigência do protocolo Subsonic, não por escolha: a autenticação dele é
 * `token = md5(senha + salt)`, e não há outro esquema que todo servidor aceite. **Não é
 * criptografia nossa** — nada no app é protegido por isto, e MD5 não serve para proteger
 * nada. É um formato de mensagem que o servidor do outro lado espera.
 *
 * Puro em vez de `expo-crypto` por três razões, na ordem em que pesaram:
 *
 * 1. `expo-crypto` é módulo nativo. Entrar com ele obriga um rebuild, e tira do ar
 *    qualquer development build já instalado — para trinta linhas de aritmética inteira.
 * 2. O md5 de lá é `async`. Isso obrigaria `absolute()` (`lib/storage.ts`) a virar
 *    assíncrona, e ela é chamada de dentro do render e do caminho de play. Síncrono aqui
 *    mantém a montagem da URL de stream como aritmética de string.
 * 3. Roda em `node --test`, contra os vetores do RFC 1321. É a mesma razão de `paths.ts`
 *    ser puro: implementação sem teste seria um hash errado passando por certo, e um hash
 *    errado aparece como "senha inválida" num servidor que está certo.
 *
 * A implementação é o algoritmo do RFC 1321 direto, em quatro rodadas de dezesseis
 * operações. Sem otimização nenhuma: entra uma senha curta uma vez por sessão.
 */

/** Deslocamentos por operação, as quatro rodadas do RFC. */
const SHIFT = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

/**
 * A tabela K do RFC: `floor(abs(sin(i + 1)) * 2^32)`.
 *
 * Calculada, e não copiada como 64 constantes hexadecimais: a fórmula é conferível de
 * relance contra o RFC, e uma tabela literal é 64 oportunidades de errar um dígito sem
 * que nada aponte onde.
 */
const K = Array.from({ length: 64 }, (_, i) =>
  Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000)
);

/** Rotação à esquerda em 32 bits. */
const rotate = (value: number, by: number): number =>
  ((value << by) | (value >>> (32 - by))) >>> 0;

/**
 * UTF-8 na mão.
 *
 * `TextEncoder` existe no Hermes, mas não em toda versão de Node em que os testes rodam, e
 * a senha pode perfeitamente ter acento. Trinta linhas aqui valem menos que uma
 * divergência entre o que o teste confere e o que o aparelho calcula.
 */
function utf8(input: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < input.length; i++) {
    let code = input.charCodeAt(i);
    // Par surrogate: junta os dois meios num único ponto de código.
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < input.length) {
      const low = input.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        i++;
      }
    }
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000)
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
  }
  return out;
}

/** O hash de uma string, em hex minúsculo — o formato que o Subsonic espera no `t=`. */
export function md5(input: string): string {
  const bytes = utf8(input);
  const bitLength = bytes.length * 8;

  /*
    Preenchimento do RFC: um bit 1, zeros até faltarem 8 bytes para fechar o bloco de 64,
    e o comprimento em bits como inteiro de 64 bits little-endian.
  */
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 0; i < 8; i++) {
    // `bitLength / 2^32` para os quatro bytes de cima: deslocamento de 32 não existe em
    // JavaScript, e `>>> 32` devolveria o próprio número.
    const shift = i * 8;
    bytes.push(shift < 32 ? (bitLength >>> shift) & 0xff : Math.floor(bitLength / 2 ** shift) & 0xff);
  }

  let [a0, b0, c0, d0] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];

  for (let block = 0; block < bytes.length; block += 64) {
    // As dezesseis palavras do bloco, little-endian.
    const M = new Array<number>(16);
    for (let i = 0; i < 16; i++) {
      const at = block + i * 4;
      M[i] =
        bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24);
    }

    let [a, b, c, d] = [a0, b0, c0, d0];

    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }

      const tmp = d;
      d = c;
      c = b;
      // `>>> 0` a cada soma: sem isso o valor passa de 2^32 e o JavaScript vira float,
      // perdendo os bits de baixo justamente na rotação seguinte.
      b = (b + rotate((a + f + K[i] + M[g]) >>> 0, SHIFT[i])) >>> 0;
      a = tmp;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  return [a0, b0, c0, d0].map(hex).join('');
}

/** Uma palavra de 32 bits em hex little-endian, que é a ordem do digest do MD5. */
function hex(word: number): string {
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += ((word >>> (i * 8)) & 0xff).toString(16).padStart(2, '0');
  }
  return out;
}
