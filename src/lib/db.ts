/**
 * O banco. Guarda a biblioteca e o histórico de escuta.
 *
 * Antes disto a biblioteca era um `library.json` reescrito por inteiro a cada mudança.
 * Isso custava três coisas: o boot fazia `JSON.parse` de um arquivo que cresce com o
 * acervo; corrigir o título de **uma** faixa reescrevia todas; e não havia onde pôr um
 * histórico, porque um log que só cresce dentro de um arquivo que se reescreve inteiro é
 * um arquivo que se reescreve inteiro cada vez mais devagar.
 *
 * O que **não** mudou: a biblioteca continua sendo materializada em memória no boot, e é
 * de lá que as telas leem. Trocar isso por consulta sob demanda seria reescrever todas as
 * abas, a busca e as transições — e o ganho real do banco já está aqui, na escrita
 * incremental e na leitura por colunas em vez de um parse de texto. O teto de memória
 * segue existindo; ver `ponytail:` em `loadLibrary`.
 *
 * Tudo é síncrono de propósito. `LibraryProvider` lê a biblioteca no primeiro render,
 * e é isso que faz o mini player aparecer já montado em vez de piscar vazio.
 *
 * Caminhos vão para o banco em forma portátil — ver `lib/paths.ts`.
 */

import { File, Paths } from 'expo-file-system';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import type { Play } from './history';
import type { Library, Track } from './scan';
import { absolute, portable } from './storage';

const NAME = 'resonate.db';

/**
 * Uma linha da tabela `tracks`. SQLite não tem booleano, então `hasLyrics` é 0 ou 1, e
 * `position` guarda a ordem da faixa dentro do álbum — que é o que reconstrói
 * `Album.trackIds` sem precisar de uma tabela de junção.
 */
type TrackRow = {
  id: string;
  uri: string;
  file: string;
  folder: string;
  title: string;
  artist: string;
  album: string;
  albumArtist: string | null;
  trackNumber: number | null;
  genre: string | null;
  duration: number | null;
  albumId: string;
  hasLyrics: number;
  position: number;
  trackGain: number | null;
  albumGain: number | null;
};

type AlbumRow = { id: string; title: string; artist: string; cover: string | null };

let handle: SQLiteDatabase | null = null;

export function db(): SQLiteDatabase {
  if (handle) return handle;
  handle = openDatabaseSync(NAME);
  /*
    WAL porque há um escritor frequente e pequeno — o histórico — junto de leituras
    grandes: sem ele, gravar uma escuta bloqueia quem estiver lendo a biblioteca.

    O esquema é criado com `IF NOT EXISTS` em vez de migrações versionadas. Vale enquanto
    só se acrescenta tabela; no dia em que uma coluna existente mudar, isto passa a ser
    `PRAGMA user_version` com um passo por versão.
  */
  handle.execSync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS albums (
      id     TEXT PRIMARY KEY,
      title  TEXT NOT NULL,
      artist TEXT NOT NULL,
      cover  TEXT
    );

    CREATE TABLE IF NOT EXISTS tracks (
      id          TEXT PRIMARY KEY,
      uri         TEXT NOT NULL,
      file        TEXT NOT NULL,
      folder      TEXT NOT NULL,
      title       TEXT NOT NULL,
      artist      TEXT NOT NULL,
      album       TEXT NOT NULL,
      albumArtist TEXT,
      trackNumber INTEGER,
      genre       TEXT,
      duration    REAL,
      albumId     TEXT NOT NULL,
      hasLyrics   INTEGER NOT NULL DEFAULT 0,
      position    INTEGER NOT NULL DEFAULT 0,
      trackGain   REAL,
      albumGain   REAL
    );

    CREATE INDEX IF NOT EXISTS tracks_album ON tracks (albumId, position);

    CREATE TABLE IF NOT EXISTS plays (
      at      INTEGER NOT NULL,
      trackId TEXT NOT NULL,
      albumId TEXT NOT NULL,
      artist  TEXT NOT NULL,
      album   TEXT NOT NULL,
      title   TEXT NOT NULL,
      seconds REAL NOT NULL
    );

    CREATE INDEX IF NOT EXISTS plays_at ON plays (at);

    /*
      Indice de letras, para a busca por verso.

      Tabela a parte, e nao uma coluna em tracks, porque a letra e justamente o que D11
      mantem fora do indice da biblioteca: loadLibrary materializa tracks inteira em
      memoria no boot, e milhares de letras ali seriam megabytes carregados para nada em
      toda abertura do app. Aqui elas so sao lidas quando alguem busca.

      A coluna folded e o texto sem acento e em minuscula, na mesma normalizacao de
      lib/search.ts. Guardar as duas formas e o que permite achar "coracao" numa letra que
      escreve "coracao" com cedilha e til, sem depender de um LIKE insensivel a acento —
      que o SQLite nao tem.
    */
    CREATE TABLE IF NOT EXISTS lyrics (
      trackId TEXT PRIMARY KEY,
      text    TEXT NOT NULL,
      folded  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  /*
    Colunas adicionadas depois que o esquema já estava no aparelho de alguém.

    `CREATE TABLE IF NOT EXISTS` não altera a tabela que já existe: para quem instalou
    antes, as colunas novas do bloco acima simplesmente não aparecem, e o INSERT falha
    citando coluna inexistente. Era a dívida anotada em `07-roadmap-e-divida.md` —
    "esquema sem versão, no dia em que uma coluna mudar".

    Ainda não é versionamento, e de propósito: coluna **adicionada** é aditiva e idempotente
    por natureza, e `addColumn` cobre isso sem tabela de versão. O dia de versionar é o dia
    em que uma coluna existente mudar de tipo ou de significado — aí não há ALTER que
    resolva e os dados precisam ser reescritos.
  */
  addColumn(handle, 'tracks', 'trackGain', 'REAL');
  addColumn(handle, 'tracks', 'albumGain', 'REAL');

  return handle;
}

/**
 * Adiciona uma coluna se ela ainda não existe.
 *
 * Por `PRAGMA table_info`, e não por `try/catch` em volta do ALTER: o erro de "coluna
 * duplicada" do SQLite é indistinguível de outros erros de ALTER, e engolir todos deixaria
 * uma falha real passar em silêncio — para reaparecer como INSERT quebrado depois.
 */
function addColumn(handle: SQLiteDatabase, table: string, column: string, type: string): void {
  const columns = handle.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (columns.some((c) => c.name === column)) return;
  handle.execSync(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

const metaGet = (key: string): string | null =>
  db().getFirstSync<{ value: string }>('SELECT value FROM meta WHERE key = ?', key)?.value ?? null;

const metaSet = (key: string, value: string): void => {
  db().runSync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', key, value);
};

// ------------------------------------------------------------------ biblioteca

const toTrack = (row: TrackRow): Track => ({
  id: row.id,
  uri: absolute(row.uri),
  file: row.file,
  folder: absolute(row.folder),
  title: row.title,
  artist: row.artist,
  album: row.album,
  albumArtist: row.albumArtist,
  trackNumber: row.trackNumber,
  genre: row.genre,
  duration: row.duration,
  albumId: row.albumId,
  hasLyrics: row.hasLyrics === 1,
  // `?? null` porque uma coluna adicionada por migração vem `undefined` em linha antiga.
  trackGain: row.trackGain ?? null,
  albumGain: row.albumGain ?? null,
});

/**
 * A biblioteca inteira, ou null quando ainda não há nenhuma.
 *
 * ponytail: materializa tudo em memória. Duas consultas em vez de um parse de texto já é
 * bem mais barato, mas acima de umas 20 mil faixas o custo passa a ser o próprio array —
 * e aí o caminho é as telas consultarem o banco em vez de receberem a lista pronta.
 */
export function loadLibrary(): Library | null {
  /*
    Por título de álbum e depois pela posição na faixa.

    A aba de faixas mostra `library.tracks` na ordem em que ela vem, sem ordenar de novo.
    Ordenar por `albumId` seria ordenar por hash — as faixas de um álbum ficariam juntas,
    mas os álbuns entre si sairiam numa ordem sem sentido, e diferente da grade ao lado.
  */
  const rows = db().getAllSync<TrackRow>(`
    SELECT tracks.* FROM tracks
    LEFT JOIN albums ON albums.id = tracks.albumId
    ORDER BY albums.title COLLATE NOCASE, tracks.position
  `);
  if (!rows.length) return null;

  const albumRows = db().getAllSync<AlbumRow>('SELECT * FROM albums ORDER BY title COLLATE NOCASE');
  const trackIds = new Map<string, string[]>();
  const tracks = rows.map((row) => {
    const list = trackIds.get(row.albumId);
    if (list) list.push(row.id);
    else trackIds.set(row.albumId, [row.id]);
    return toTrack(row);
  });

  return {
    tracks,
    albums: albumRows.map((a) => ({
      id: a.id,
      title: a.title,
      artist: a.artist,
      cover: a.cover && absolute(a.cover),
      trackIds: trackIds.get(a.id) ?? [],
    })),
    folders: JSON.parse(metaGet('folders') ?? '[]').map(absolute) as string[],
    scannedAt: Number(metaGet('scannedAt') ?? 0),
  };
}

/**
 * Substitui a biblioteca inteira. É o que a varredura faz, e só ela.
 *
 * Numa transação só: sem ela, 5 mil faixas são 5 mil commits em disco, e o que leva
 * segundos passa a levar minutos. As declarações preparadas existem pelo mesmo motivo —
 * compilar o mesmo INSERT uma vez por faixa é o outro custo escondido.
 */
export function saveLibrary(library: Library): void {
  const at = new Map<string, number>();
  for (const album of library.albums) {
    album.trackIds.forEach((id, i) => at.set(id, i));
  }

  db().withTransactionSync(() => {
    db().execSync('DELETE FROM tracks; DELETE FROM albums;');

    const album = db().prepareSync(
      'INSERT INTO albums (id, title, artist, cover) VALUES ($id, $title, $artist, $cover)'
    );
    const track = db().prepareSync(`
      INSERT INTO tracks
        (id, uri, file, folder, title, artist, album, albumArtist, trackNumber, genre,
         duration, albumId, hasLyrics, position, trackGain, albumGain)
      VALUES
        ($id, $uri, $file, $folder, $title, $artist, $album, $albumArtist, $trackNumber,
         $genre, $duration, $albumId, $hasLyrics, $position, $trackGain, $albumGain)
    `);
    try {
      for (const a of library.albums) {
        album.executeSync({
          $id: a.id,
          $title: a.title,
          $artist: a.artist,
          $cover: a.cover ? portable(a.cover) : null,
        });
      }
      for (const t of library.tracks) {
        track.executeSync({
          $id: t.id,
          $uri: portable(t.uri),
          $file: t.file,
          $folder: portable(t.folder),
          $title: t.title,
          $artist: t.artist,
          $album: t.album,
          $albumArtist: t.albumArtist,
          $trackNumber: t.trackNumber,
          $genre: t.genre,
          $duration: t.duration,
          $albumId: t.albumId,
          $hasLyrics: t.hasLyrics ? 1 : 0,
          $position: at.get(t.id) ?? 0,
          $trackGain: t.trackGain,
          $albumGain: t.albumGain,
        });
      }
    } finally {
      album.finalizeSync();
      track.finalizeSync();
    }

    metaSet('folders', JSON.stringify(library.folders.map(portable)));
    metaSet('scannedAt', String(library.scannedAt));
  });
}

/** Uma faixa ganhou letra importada. Um UPDATE, e não a biblioteca inteira de volta. */
export function setHasLyrics(trackId: string): void {
  db().runSync('UPDATE tracks SET hasLyrics = 1 WHERE id = ?', trackId);
}

/**
 * Tira faixas do índice depois de os arquivos saírem do aparelho, e com elas os álbuns
 * que ficaram vazios — uma capa que abre numa tela em branco é pior que nada.
 */
export function deleteTracks(trackIds: string[]): void {
  if (!trackIds.length) return;
  db().withTransactionSync(() => {
    const remove = db().prepareSync('DELETE FROM tracks WHERE id = $id');
    try {
      for (const id of trackIds) remove.executeSync({ $id: id });
    } finally {
      remove.finalizeSync();
    }
    db().execSync('DELETE FROM albums WHERE id NOT IN (SELECT DISTINCT albumId FROM tracks)');
  });
}

export function clearLibrary(): void {
  db().withTransactionSync(() => {
    db().execSync('DELETE FROM tracks; DELETE FROM albums;');
    db().runSync('DELETE FROM meta WHERE key IN (?, ?)', 'folders', 'scannedAt');
  });
}

// -------------------------------------------------------------------- histórico

/** Registra uma escuta. Ver `lib/history.ts` para o que conta como uma. */
export function logPlay(play: Play): void {
  db().runSync(
    'INSERT INTO plays (at, trackId, albumId, artist, album, title, seconds) VALUES (?, ?, ?, ?, ?, ?, ?)',
    play.at,
    play.trackId,
    play.albumId,
    play.artist,
    play.album,
    play.title,
    play.seconds
  );
}

/** As escutas dentro de um intervalo fechado, da mais recente para a mais antiga. */
export const playsBetween = (from: number, to: number): Play[] =>
  db().getAllSync<Play>('SELECT * FROM plays WHERE at >= ? AND at <= ? ORDER BY at DESC', from, to);

/**
 * O primeiro e o último instante com escuta, ou null quando não há nenhuma.
 *
 * É o que define até onde o seletor de mês pode voltar: oferecer 2019 a quem instalou o
 * app semana passada é oferecer telas vazias.
 */
/**
 * Quando cada faixa tocou por último, em ms.
 *
 * Um `GROUP BY` no banco, e não a lista de escutas trazida para a memória: um histórico de
 * um ano são dezenas de milhares de linhas, e o que as listas inteligentes precisam é de
 * um número por faixa. Ver `lib/smart.ts`.
 */
export function lastPlayedAt(): Map<string, number> {
  const rows = db().getAllSync<{ trackId: string; at: number }>(
    'SELECT trackId, MAX(at) AS at FROM plays GROUP BY trackId'
  );
  return new Map(rows.map((r) => [r.trackId, r.at]));
}

/** Todo o histórico. Serve à exportação, que é a única coisa que quer tudo de uma vez. */
export const allPlays = (): Play[] =>
  db().getAllSync<Play>('SELECT * FROM plays ORDER BY at');

/**
 * Insere escutas importadas de um backup.
 *
 * Numa transação e com declaração preparada, pelo mesmo motivo de `saveLibrary`: um
 * histórico de um ano são dezenas de milhares de linhas, e uma por commit levaria minutos.
 *
 * Quem decide o que é novo é `newPlays`, em `lib/backup.ts` — aqui não há checagem de
 * duplicata de propósito, porque a chave de uma escuta é composta e um índice único sobre
 * ela custaria em toda gravação para servir só à importação.
 */
export function importPlays(plays: Play[]): void {
  if (!plays.length) return;
  db().withTransactionSync(() => {
    const insert = db().prepareSync(
      'INSERT INTO plays (at, trackId, albumId, artist, album, title, seconds) VALUES ($at, $trackId, $albumId, $artist, $album, $title, $seconds)'
    );
    try {
      for (const p of plays) {
        insert.executeSync({
          $at: p.at,
          $trackId: p.trackId,
          $albumId: p.albumId,
          $artist: p.artist,
          $album: p.album,
          $title: p.title,
          $seconds: p.seconds,
        });
      }
    } finally {
      insert.finalizeSync();
    }
  });
}

// ------------------------------------------------------------------- letras

/** Uma letra indexada. `folded` é responsabilidade de quem chama — ver `lib/search.ts`. */
export type LyricsEntry = { trackId: string; text: string; folded: string };

/**
 * Grava letras no índice.
 *
 * Em lote e numa transação: quem chama é a varredura, que já tem o texto em mãos — o
 * `parseTags` extrai a letra e o `toTrack` a descartava. Indexar não custa I/O nenhum a
 * mais, só a escrita.
 */
export function putLyrics(entries: LyricsEntry[]): void {
  if (!entries.length) return;
  db().withTransactionSync(() => {
    const insert = db().prepareSync(
      'INSERT OR REPLACE INTO lyrics (trackId, text, folded) VALUES ($trackId, $text, $folded)'
    );
    try {
      for (const e of entries) {
        insert.executeSync({ $trackId: e.trackId, $text: e.text, $folded: e.folded });
      }
    } finally {
      insert.finalizeSync();
    }
  });
}

/** Tira do índice a letra de faixa que não existe mais. */
export function pruneLyrics(): void {
  db().runSync('DELETE FROM lyrics WHERE trackId NOT IN (SELECT id FROM tracks)');
}

/**
 * Faixas cuja letra contém o trecho, com o verso que casou.
 *
 * `LIKE` com curinga nas duas pontas, sobre a coluna já normalizada. Não usa índice — é
 * uma varredura da tabela —, e é aceitável porque acontece só quando alguém digita na
 * busca, e porque a tabela tem uma linha por faixa *com letra*, que é uma fração do
 * acervo.
 *
 * ponytail: com muitos milhares de letras isto passa a pesar. O caminho é FTS5, que o
 * SQLite do expo-sqlite traz — deixado para quando doer, porque uma tabela virtual de FTS
 * precisa ser mantida em sincronia e isso é mais código para manter.
 */
export function searchLyrics(folded: string, limit: number): { trackId: string; text: string }[] {
  if (!folded) return [];
  return db().getAllSync<{ trackId: string; text: string }>(
    'SELECT trackId, text FROM lyrics WHERE folded LIKE ? LIMIT ?',
    `%${folded}%`,
    limit
  );
}

export function playSpan(): { first: number; last: number } | null {
  const row = db().getFirstSync<{ first: number | null; last: number | null }>(
    'SELECT MIN(at) AS first, MAX(at) AS last FROM plays'
  );
  return row?.first && row.last ? { first: row.first, last: row.last } : null;
}

export const clearHistory = (): void => {
  db().execSync('DELETE FROM plays');
};

// -------------------------------------------------------------------- migração

/**
 * Traz o `library.json` para o banco, uma vez.
 *
 * Uma biblioteca já indexada é minutos de leitura de tag; obrigar a varredura de novo só
 * porque o formato de armazenamento mudou seria cobrar do usuário uma decisão nossa. O
 * JSON é apagado depois de entrar — se a importação falhar no meio, ele fica onde está e
 * a próxima abertura tenta de novo.
 *
 * Recebe o leitor do JSON por parâmetro para não importar `scan.ts`, que importa este
 * arquivo. É a única razão da injeção.
 */
export function importJson(read: () => Library | null): void {
  const legacy = new File(Paths.document, 'library.json');
  try {
    if (!legacy.exists) return;
    const library = read();
    if (library?.tracks.length) saveLibrary(library);
    legacy.delete();
  } catch {
    // JSON corrompido ou sem espaço: segue sem biblioteca, e a varredura resolve
  }
}
