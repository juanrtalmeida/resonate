/**
 * O que as duas telas de Ajustes têm em comum.
 *
 * São duas — a nossa e a nativa (ver `app/settings.tsx`) — e nenhuma delas é a dona destas
 * três peças: a lista dos tratamentos do Now Playing, o host de uma URL e a tradução do
 * erro do servidor. Duplicá-las nos dois arquivos era garantir que uma versão acabasse
 * dizendo uma coisa e a outra, outra.
 *
 * Nada de React aqui: são dados e duas funções.
 */

import type { Key, Translate } from './i18n';
import type { Treatment } from './prefs';
import { SubsonicError } from './subsonic';

/** Os três modos do Now Playing. Título e explicação são chaves de tradução. */
export const TREATMENTS = [
  { key: 'ember', title: 'treatment.ember', blurb: 'treatment.ember.blurb' },
  { key: 'vinyl', title: 'treatment.vinyl', blurb: 'treatment.vinyl.blurb' },
  { key: 'wave', title: 'treatment.wave', blurb: 'treatment.wave.blurb' },
] as const satisfies { key: Treatment; title: Key; blurb: Key }[];

/** O host da URL, para rotular as faixas. Sem parser: só o miolo entre `//` e a barra. */
export function hostOf(url: string): string | null {
  const at = url.indexOf('//');
  const rest = at < 0 ? url : url.slice(at + 2);
  const host = rest.split('/')[0].trim();
  return host || null;
}

/**
 * O erro do servidor em texto do usuário.
 *
 * As mensagens do `SubsonicError` são chaves nossas, não texto do servidor: o que o
 * Subsonic devolve em `error.message` vem no idioma dele e costuma ser um jargão
 * ("Wrong username or password"). Código 40 é credencial, e é o erro que quase todo mundo
 * comete na primeira tentativa.
 *
 * O `t` vem por parâmetro em vez de hook — é o que o tipo `Translate` existe para (ver
 * `lib/i18n.ts`), e é o que mantém este arquivo fora do React.
 */
export function messageOf(error: unknown, t: Translate): string {
  if (!(error instanceof SubsonicError)) return t('streaming.error.unknown');
  if (error.code === 40 || error.code === 41) return t('streaming.error.credentials');
  if (error.message === 'timeout') return t('streaming.error.timeout');
  if (error.message === 'unreachable') return t('streaming.error.unreachable');
  if (error.message === 'badResponse') return t('streaming.error.badResponse');
  return t('streaming.error.server', { message: error.message });
}
