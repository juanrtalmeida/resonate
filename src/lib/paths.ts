/**
 * Referências portáteis de arquivo.
 *
 * O id de uma faixa é o caminho dela, e o caminho da pasta Documents do iOS carrega o
 * UUID do container do app:
 *
 *     file:///…/Containers/Data/Application/74D2E777-…/Documents/Music/x.flac
 *
 * Esse UUID **muda** — em reinstalação, em restauração de backup, em algumas
 * atualizações. Quando muda, tudo o que foi gravado com o caminho antigo aponta para o
 * nada: as capas somem, a fila não retoma, os favoritos e o progresso ficam órfãos, e a
 * biblioteca só volta com uma varredura nova. O usuário vê isso como "o app esqueceu
 * tudo depois da atualização".
 *
 * A saída é não guardar o prefixo. O que vai para o disco é uma referência portátil —
 * `doc://Music/x.flac` — e o caminho absoluto é remontado na leitura, contra a raiz que
 * vale *agora*. Nada fora de Documents é tocado: `content://` do SAF e os caminhos do
 * MediaStore no Android já são estáveis, e reescrevê-los seria estragar o que funciona.
 *
 * Este módulo é puro de propósito — a raiz entra por parâmetro, e não de
 * `expo-file-system`. É o que deixa a conversão rodar em `node --test`, onde ela é
 * conferida caminho por caminho.
 */

export const DOC = 'doc://';

/**
 * Uma pasta Documents de container do iOS, de qualquer geração.
 *
 * Serve para o resgate: um arquivo gravado antes desta mudança, ou depois de o container
 * já ter trocado, traz um caminho absoluto que não bate com a raiz atual. Reconhecer o
 * formato converte esse caminho em portátil em vez de deixá-lo morto.
 *
 * Ancorado em `/Containers/Data/Application/<uuid>/Documents/` e não num `/Documents/`
 * solto: no Android existe uma pasta com esse nome no armazenamento do usuário, e recortar
 * ali transformaria a música dele numa referência que não resolve.
 */
const IOS_CONTAINER = /^file:\/\/\/.*\/Containers\/Data\/Application\/[^/]+\/Documents\//;

/** Garante a barra final: a raiz é um prefixo, e sem ela `slice` come um caractere. */
export const asRoot = (uri: string): string => (uri.endsWith('/') ? uri : `${uri}/`);

/**
 * Caminho absoluto → referência portátil. Idempotente: o que já é portátil volta igual,
 * e é isso que deixa a migração ser uma passada só sobre chaves de qualquer geração.
 */
export function toPortable(root: string, uri: string): string {
  if (!uri || uri.startsWith(DOC)) return uri;
  const base = asRoot(root);
  if (uri.startsWith(base)) return DOC + uri.slice(base.length);
  const stale = IOS_CONTAINER.exec(uri);
  return stale ? DOC + uri.slice(stale[0].length) : uri;
}

/** Referência portátil → caminho absoluto. O que não é portátil passa intacto. */
export function toAbsolute(root: string, ref: string): string {
  return ref.startsWith(DOC) ? asRoot(root) + ref.slice(DOC.length) : ref;
}

/** As duas conversões sobre as chaves de um objeto, preservando os valores. */
export function mapKeys<V>(
  record: Record<string, V>,
  convert: (key: string) => string
): Record<string, V> {
  const out: Record<string, V> = {};
  for (const [key, value] of Object.entries(record)) out[convert(key)] = value;
  return out;
}
