/**
 * O lado de I/O da cópia de escuta: montar o arquivo, entregá-lo ao sistema, e ler de volta.
 *
 * Separado de `lib/backup.ts` pela mesma razão que `storage.ts` é separado de `paths.ts`:
 * lá é decisão pura, com teste; aqui é `expo-file-system`, `expo-sharing` e os providers, o
 * que nenhum teste alcança. A divisão mantém no lado testável tudo o que pode estar errado
 * em silêncio — a fusão do histórico, a validação do arquivo, a soma das contagens.
 */

import { File, Paths } from 'expo-file-system';
import { useCallback } from 'react';

import { allPlays, importPlays } from './db';
import { newPlays, parseBackup, BACKUP_VERSION, type Backup } from './backup';
import { usePlaylists } from './playlists';
import { usePrefs } from './prefs';
import { adoptPicked } from './sources';

/** O que o arquivo se chama. A data no nome é o que distingue duas cópias na mesma pasta. */
function fileName(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `resonate-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

export type ImportResult = {
  playlists: number;
  plays: number;
};

export function useBackup() {
  const prefs = usePrefs();
  const playlists = usePlaylists();

  /**
   * Monta o arquivo e abre a folha de compartilhar do sistema.
   *
   * Pela folha, e não gravando numa pasta escolhida: é o caminho que alcança tudo — AirDrop,
   * e-mail, iCloud, Drive, "salvar em Arquivos" — sem o app pedir permissão de escrita em
   * lugar nenhum. O mesmo caminho que `share.ts` usa para o card de compartilhar.
   *
   * O arquivo é escrito no cache. É lixo depois de compartilhado, e cache é a pasta que o
   * sistema recolhe sozinho — em Documents ele apareceria na pasta do app no Files.app,
   * junto da música do usuário, e ficaria lá para sempre.
   */
  const exportBackup = useCallback(async (): Promise<boolean> => {
    const at = Date.now();
    const backup: Backup = {
      version: BACKUP_VERSION,
      exportedAt: at,
      prefs: {
        liked: prefs.liked,
        likedAlbums: prefs.likedAlbums,
        plays: prefs.plays,
        progress: prefs.progress,
        spoken: prefs.spoken as Record<string, string>,
        heard: prefs.heard,
        sessions: prefs.sessions,
        edits: prefs.edits,
      },
      // A capa fica fora: é um arquivo de imagem dentro do app, e um caminho dele no
      // backup apontaria para o nada no aparelho novo. Ver `lib/backup.ts`.
      playlists: playlists.playlists.map((p) => ({
        id: p.id,
        name: p.name,
        trackIds: p.trackIds,
        createdAt: p.createdAt,
      })),
      plays: readPlays(),
    };

    try {
      const target = new File(Paths.cache, fileName(at));
      if (target.exists) target.delete();
      target.create();
      target.write(JSON.stringify(backup));

      const Sharing = await import('expo-sharing');
      if (!(await Sharing.isAvailableAsync())) return false;
      await Sharing.shareAsync(target.uri, {
        mimeType: 'application/json',
        UTI: 'public.json',
      });
      return true;
    } catch {
      return false;
    }
  }, [prefs, playlists]);

  /**
   * Abre o seletor, lê o arquivo e devolve o que ele trouxe.
   *
   * `null` quer dizer "não deu" — cancelado, ilegível, ou não é um backup nosso. A tela
   * distingue cancelamento de erro pelo que ela mesma sabe: se o usuário cancelou, não há
   * o que dizer.
   */
  const importBackup = useCallback(async (): Promise<ImportResult | null> => {
    let text: string;
    try {
      const picked = await File.pickFileAsync({ mimeTypes: ['application/json'] });
      if (picked.canceled) return null;

      /*
        O arquivo é trazido para o cache antes de ser lido.

        O seletor do iOS entrega uma cópia temporária que é nossa para limpar (ver
        `adopt` em `sources.ts`), e ler direto dela deixaria essa cópia no container.
        Movendo, ela vira nosso arquivo de cache e é apagada logo abaixo.
      */
      const target = new File(Paths.cache, 'restore.json');
      if (target.exists) target.delete();
      await adoptPicked(picked.result, target);
      text = target.textSync();
      target.delete();
    } catch {
      return null;
    }

    let backup: Backup | null;
    try {
      backup = parseBackup(JSON.parse(text));
    } catch {
      return null; // não é JSON
    }
    if (!backup) return null;

    prefs.restore(backup.prefs);
    playlists.restore(backup.playlists);

    // Só o que ainda não está lá: importar duas vezes não pode dobrar o histórico.
    const fresh = newPlays(readPlays(), backup.plays);
    try {
      importPlays(fresh);
    } catch {
      // banco indisponível: as preferências e as listas já entraram, e é o que mais importa
    }

    return { playlists: backup.playlists.length, plays: fresh.length };
  }, [prefs, playlists]);

  return { exportBackup, importBackup };
}

/** O histórico, ou vazio se o banco não abrir. Exportar sem histórico é melhor que falhar. */
function readPlays() {
  try {
    return allPlays();
  } catch {
    return [];
  }
}
