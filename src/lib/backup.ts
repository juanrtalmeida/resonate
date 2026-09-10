/**
 * Cópia da própria escuta: um arquivo que sai e volta.
 *
 * O app não tem conta, e essa decisão é boa — mas ela deixa um buraco: celular perdido é
 * anos de histórico, curtidas, listas e progresso perdidos, sem cópia em lugar nenhum. Um
 * arquivo é o oposto de nuvem, e é a resposta que combina com o resto do app: o usuário é
 * dono dos dados dele **como arquivo**, para guardar onde quiser.
 *
 * ## O que entra, e o que fica fora de propósito
 *
 * Entra o que **só existe aqui**: curtidas, contagens, progresso, marcas de podcast e
 * audiolivro, sessões de leitura, correções de metadados, listas, e o histórico com data.
 * Nada disso se recupera de nenhum lugar se o aparelho sumir.
 *
 * Fica fora:
 *
 * - **A biblioteca.** Ela é derivada dos arquivos e uma varredura a reconstrói. Levá-la
 *   inflaria o arquivo com dezenas de milhares de linhas que o aparelho novo vai descobrir
 *   sozinho.
 * - **A senha do servidor.** É o dado mais sensível que as preferências carregam, e um
 *   backup é feito para sair do aparelho — mandado por e-mail, guardado em nuvem de
 *   terceiro. Reconectar é digitar a senha uma vez; vazá-la num arquivo compartilhado não
 *   tem desfazer. Ver `lib/subsonic.ts`.
 * - **Pastas e concessões** (`sources`, `granted`). São caminhos e permissões deste
 *   aparelho, e no aparelho novo eles apontam para o nada — ou, pior, para outra pasta.
 * - **O acento, o tratamento e o idioma.** Aparência não é escuta. Deixá-los fora mantém o
 *   arquivo sendo o que ele diz ser, e evita que restaurar um backup troque o tema de quem
 *   já ajustou o app do jeito dele.
 *
 * ## As chaves são caminhos, e é isso que faz a restauração funcionar
 *
 * Tudo aqui é chaveado por `Track.id`, que é o caminho do arquivo em forma portátil (ver
 * `lib/paths.ts`). Restaurando no mesmo acervo, tudo reencontra a faixa — inclusive depois
 * de o container do iOS trocar, que é justamente o que a forma portátil resolve. Faixa que
 * não existe mais fica como chave órfã, inofensiva: nenhuma tela procura por ela.
 *
 * A parte pura vive aqui e tem teste. Ler as preferências, consultar o banco e abrir o
 * seletor de arquivos é trabalho de quem chama.
 */

import type { Play } from './history';

/**
 * Versão do formato.
 *
 * Existe desde a primeira para que a segunda tenha o que checar: um arquivo sem versão
 * obrigaria adivinhar o formato pelo conteúdo. Arquivo de versão futura é recusado inteiro,
 * e não lido pela metade — meio backup restaurado é pior que nenhum.
 */
export const BACKUP_VERSION = 1;

/** O que o backup carrega das preferências. Um subconjunto, ver o cabeçalho. */
export type BackupPrefs = {
  liked: string[];
  likedAlbums: string[];
  plays: Record<string, number>;
  progress: Record<string, number>;
  spoken: Record<string, string>;
  heard: string[];
  sessions: Record<string, number>;
  edits: unknown;
};

export type BackupPlaylist = {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
};

export type Backup = {
  version: number;
  exportedAt: number;
  prefs: BackupPrefs;
  playlists: BackupPlaylist[];
  plays: Play[];
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

const numbersByKey = (v: unknown): Record<string, number> => {
  if (!isObject(v)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(v)) {
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
  }
  return out;
};

const stringsByKey = (v: unknown): Record<string, string> => {
  if (!isObject(v)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(v)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
};

/**
 * Lê um arquivo de backup, campo por campo.
 *
 * Defensivo em cada campo, e não um `as Backup`: o arquivo vem de fora — pode ser de uma
 * versão diferente, ter sido editado à mão, ou ser um JSON qualquer que o usuário escolheu
 * por engano no seletor. Um `as` faria o app aceitar tudo e quebrar depois, longe daqui,
 * com uma lista de curtidas que contém `null`.
 *
 * Campo estranho é **descartado**, não recusado: perder as sessões de leitura de um backup
 * meio corrompido é muito melhor que perder as curtidas junto. Só o envelope — não ser
 * objeto, ou ser de versão futura — recusa o arquivo inteiro.
 */
export function parseBackup(raw: unknown): Backup | null {
  if (!isObject(raw)) return null;
  const version = typeof raw.version === 'number' ? raw.version : 0;
  if (version < 1 || version > BACKUP_VERSION) return null;

  const prefs = isObject(raw.prefs) ? raw.prefs : {};

  return {
    version,
    exportedAt: typeof raw.exportedAt === 'number' ? raw.exportedAt : 0,
    prefs: {
      liked: strings(prefs.liked),
      likedAlbums: strings(prefs.likedAlbums),
      plays: numbersByKey(prefs.plays),
      progress: numbersByKey(prefs.progress),
      spoken: stringsByKey(prefs.spoken),
      heard: strings(prefs.heard),
      sessions: numbersByKey(prefs.sessions),
      // `edits` tem forma própria e migração própria em `lib/edits.ts`; passa inteiro e é
      // lá que ele é saneado.
      edits: prefs.edits ?? null,
    },
    playlists: Array.isArray(raw.playlists) ? raw.playlists.flatMap(playlistOf) : [],
    plays: Array.isArray(raw.plays) ? raw.plays.flatMap(playOf) : [],
  };
}

/** Uma lista, ou nada. `flatMap` sobre isto descarta o que não presta. */
function playlistOf(raw: unknown): BackupPlaylist[] {
  if (!isObject(raw)) return [];
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return [];
  return [
    {
      id: raw.id,
      name: raw.name,
      trackIds: strings(raw.trackIds),
      createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
    },
  ];
}

/** Uma escuta, ou nada. */
function playOf(raw: unknown): Play[] {
  if (!isObject(raw)) return [];
  if (typeof raw.at !== 'number' || typeof raw.trackId !== 'string') return [];
  if (typeof raw.seconds !== 'number' || !Number.isFinite(raw.seconds)) return [];
  return [
    {
      at: raw.at,
      trackId: raw.trackId,
      albumId: typeof raw.albumId === 'string' ? raw.albumId : '',
      artist: typeof raw.artist === 'string' ? raw.artist : '',
      album: typeof raw.album === 'string' ? raw.album : '',
      title: typeof raw.title === 'string' ? raw.title : '',
      seconds: raw.seconds,
    },
  ];
}

/**
 * As escutas de `incoming` que ainda não estão em `existing`.
 *
 * Importar duas vezes o mesmo arquivo não pode dobrar o histórico — e vai acontecer, porque
 * "será que importei?" é a dúvida natural de quem acabou de trocar de aparelho. Sem isto,
 * as horas da tela de Escuta dobrariam e o ranking passaria a mentir.
 *
 * A identidade de uma escuta é `at` + `trackId`: o instante em que ela terminou e a faixa.
 * Duas escutas da mesma faixa no mesmo milissegundo são a mesma escuta — o player grava uma
 * por vez, e a chance de colisão real é a de tocar a mesma faixa duas vezes no mesmo
 * milissegundo.
 */
export function newPlays(existing: Play[], incoming: Play[]): Play[] {
  const seen = new Set(existing.map((p) => `${p.at}|${p.trackId}`));
  const out: Play[] = [];
  for (const play of incoming) {
    const key = `${play.at}|${play.trackId}`;
    // Também contra repetição dentro do próprio arquivo importado.
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(play);
  }
  return out;
}

/**
 * Une listas de faixas por id, preservando a ordem: as existentes primeiro, as novas
 * depois.
 *
 * Restaurar não substitui o que está no aparelho — quem importa pode já ter usado o app
 * antes de lembrar do backup, e apagar o que ele fez nesse meio-tempo seria uma surpresa
 * ruim. Curtida é conjunto, então unir é a operação certa e não há o que perder.
 */
export function union(existing: string[], incoming: string[]): string[] {
  const seen = new Set(existing);
  return [...existing, ...incoming.filter((id) => !seen.has(id))];
}

/**
 * Contagens somadas por chave.
 *
 * Somar, e não substituir: as contagens dos dois lados são escutas que aconteceram de
 * verdade, e o total é a soma delas. Substituir jogaria fora o que o aparelho novo já
 * contou.
 */
export function addCounts(
  existing: Record<string, number>,
  incoming: Record<string, number>
): Record<string, number> {
  const out = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    out[key] = (out[key] ?? 0) + value;
  }
  return out;
}

/**
 * Posições de escuta, com a **maior** vencendo.
 *
 * Progresso não soma — somar dois "estou no minuto 12" daria o minuto 24, que é um lugar
 * onde ninguém parou. E a maior é a certa em vez da mais recente: sem data por entrada, é a
 * única escolha que não faz o usuário perder terreno num audiolivro.
 */
export function furthest(
  existing: Record<string, number>,
  incoming: Record<string, number>
): Record<string, number> {
  const out = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    out[key] = Math.max(out[key] ?? 0, value);
  }
  return out;
}
