/**
 * As conversões de `lib/paths.ts` amarradas à pasta Documents deste aparelho.
 *
 * A separação existe para o outro lado: `paths.ts` é aritmética de string e roda em
 * `node --test`; aqui é onde `expo-file-system` entra, e por isso este arquivo não tem
 * lógica nenhuma. Quem grava ou lê disco chama daqui; quem só converte, de lá.
 */

import { Paths } from 'expo-file-system';

import { asRoot, mapKeys, toAbsolute, toPortable } from './paths';

/**
 * A raiz de agora, lida a cada chamada.
 *
 * Sem cache de propósito: guardar isto num módulo é assumir que a pasta Documents é a
 * mesma pela vida do processo, e é exatamente essa suposição que criou o bug que este
 * módulo conserta. O custo é ler uma propriedade.
 */
export const docRoot = (): string => asRoot(Paths.document.uri);

/** Caminho absoluto → referência portátil, para gravar. */
export const portable = (uri: string): string => toPortable(docRoot(), uri);

/** Referência portátil → caminho absoluto, para usar. */
export const absolute = (ref: string): string => toAbsolute(docRoot(), ref);

/** As chaves de um registro convertidas para portátil. Idempotente — serve de migração. */
export const portableKeys = <V,>(record: Record<string, V>): Record<string, V> =>
  mapKeys(record, portable);

/** Uma lista de referências convertida para portátil. Idempotente. */
export const portableAll = (refs: string[]): string[] => refs.map(portable);
