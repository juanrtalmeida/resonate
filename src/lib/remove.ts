/**
 * Apagar arquivos de áudio do aparelho.
 *
 * Duas rotas, porque o Android moderno tem duas realidades para o mesmo arquivo:
 *
 * - `File.delete()` do expo-file-system resolve o que o app pode escrever direto: a pasta
 *   Documents no iOS e as pastas concedidas por SAF no Android.
 * - O resto está sob o armazenamento com escopo, e só sai pelo MediaStore. Ali o Android
 *   11+ *exige* a confirmação do sistema — é ele quem mostra o diálogo, não nós, e é por
 *   isso que esta função pode voltar sem ter apagado nada mesmo sem erro.
 *
 * A rota do MediaStore custa uma varredura da consulta de áudio para achar o asset pela
 * URI. É caro, e é aceitável: apagar é raro e deliberado, ao contrário de listar.
 *
 * O módulo nativo entra por `import()` só quando alguém apaga de verdade.
 */

import { File } from 'expo-file-system';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

import { isRemote } from './subsonic';
import { pathKey } from './tags';

/** O que aconteceu com cada faixa pedida. */
export type RemoveResult = {
  removed: string[];
  /** Ficaram: o sistema recusou, o usuário negou, ou o arquivo não existe mais. */
  kept: string[];
};

/** Tenta o caminho direto. Serve para SAF e para o sandbox do iOS. */
function deleteDirect(uri: string): boolean {
  try {
    const file = new File(uri);
    if (!file.exists) return true; // já não está lá: o pedido está atendido
    file.delete();
    return true;
  } catch {
    return false;
  }
}

/**
 * Caminho do MediaStore, para o que o armazenamento com escopo protege.
 *
 * `Asset` só pode ser reconstruído a partir de um `content://`, e o que a biblioteca
 * guarda é o `file://` que a varredura viu. Então não há como pular a consulta: é ela
 * que faz a ponte entre os dois. A comparação é por `pathKey`, o mesmo critério que a
 * varredura usa para não duplicar arquivo.
 */
async function deleteViaMediaStore(uris: string[]): Promise<Set<string>> {
  const done = new Set<string>();
  if (Platform.OS !== 'android') return done;
  if (!requireOptionalNativeModule('ExpoMediaLibraryNext')) return done;

  try {
    const ml = await import('expo-media-library');
    const { Asset, AssetField, MediaType, Query } = ml;
    const wanted = new Map(uris.map((uri) => [pathKey(uri), uri]));

    const assets = await new Query().eq(AssetField.MEDIA_TYPE, MediaType.AUDIO).exe();
    const targets: { asset: InstanceType<typeof Asset>; uri: string }[] = [];
    for (let i = 0; i < assets.length; i += 100) {
      const batch = assets.slice(i, i + 100);
      const infos = await Promise.all(batch.map((a) => a.getInfo()));
      infos.forEach((info, at) => {
        const uri = info.uri && wanted.get(pathKey(info.uri));
        if (uri) targets.push({ asset: batch[at], uri });
      });
      if (targets.length === wanted.size) break;
    }
    if (!targets.length) return done;

    // De uma vez: é um diálogo do sistema, e um por faixa seria insuportável.
    await Asset.delete(targets.map((t) => t.asset));
    for (const t of targets) done.add(t.uri);
  } catch {
    // Usuário negou o diálogo do sistema, ou o módulo não está no build.
  }
  return done;
}

/**
 * Apaga os arquivos destas faixas.
 *
 * Nunca é chamada sem confirmação — quem chama é o menu de contexto, que pergunta antes
 * e diz quantas faixas são.
 *
 * Faixa de servidor é recusada **aqui**, e não apenas escondida no menu.
 *
 * Não é zelo: sem esta guarda ela saía da biblioteca sem nada ser apagado de lugar
 * nenhum. A `uri` de uma faixa remota é a URL de stream, e `deleteDirect` faz
 * `new File(url)` — `exists` é falso para um `https://`, e o `return true` de "já não está
 * lá: o pedido está atendido" a punha na lista de removidas. O menu então a tirava do
 * índice, em silêncio, com o arquivo intacto no servidor.
 *
 * Ela sai em `kept`, que é a verdade: continua lá. Ver `lib/subsonic.ts`.
 */
export async function removeFromDevice(
  tracks: { id: string; uri: string }[]
): Promise<RemoveResult> {
  const removed: string[] = [];
  const remaining: { id: string; uri: string }[] = [];

  for (const track of tracks) {
    // Apagar no servidor é operação do servidor, e o Subsonic não tem endpoint para isso.
    if (isRemote(track.id)) continue;
    if (deleteDirect(track.uri)) removed.push(track.id);
    else remaining.push(track);
  }

  if (remaining.length) {
    const done = await deleteViaMediaStore(remaining.map((t) => t.uri));
    for (const track of remaining) if (done.has(track.uri)) removed.push(track.id);
  }

  const gone = new Set(removed);
  return { removed, kept: tracks.filter((t) => !gone.has(t.id)).map((t) => t.id) };
}
