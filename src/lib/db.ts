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
      position    INTEGER NOT NULL DEFAULT 0
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

    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return handle;
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
         duration, albumId, hasLyrics, position)
      VALUES
        ($id, $uri, $file, $folder, $title, $artist, $album, $albumArtist, $trackNumber,
         $genre, $duration, $albumId, $hasLyrics, $position)
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
