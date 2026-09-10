/**
 * De onde vêm os arquivos de áudio. Uma interface, duas realidades:
 *
 * - Android: expo-media-library (MediaStore). O aparelho tem uma árvore navegável e o
 *   MediaStore já indexou tudo. As "pastas" do onboarding saem do diretório pai das URIs.
 * - iOS: sandbox. Só existe a pasta Documents do app, exposta ao Files.app por
 *   UIFileSharingEnabled — é o que VLC e Doppler fazem. O onboarding importa arquivos
 *   em vez de listar pastas do sistema.
 */

import { Directory, File, Paths } from 'expo-file-system';
import { requireOptionalNativeModule } from 'expo-modules-core';

import { pathKey } from './tags';
import { Platform } from 'react-native';

/**
 * O expo-media-library é carregado sob demanda, e só depois de confirmar que o módulo
 * nativo existe.
 *
 * O pacote chama `requireNativeModule('ExpoMediaLibraryNext')` no topo de um dos seus
 * arquivos, então basta *avaliar* o JS para a exceção estourar — um `try/catch` em volta
 * do `import()` não é confiável, porque em Expo Go e em development builds antigos a
 * falha acontece na avaliação do módulo, fora do fluxo do await.
 *
 * `requireOptionalNativeModule` devolve `null` em vez de lançar, e não toca no JS do
 * pacote. É a única checagem segura antes do import.
 */
async function mediaLibrary() {
  if (Platform.OS !== 'android') return null;
  if (!requireOptionalNativeModule('ExpoMediaLibraryNext')) return null;
  try {
    return await import('expo-media-library');
  } catch {
    return null;
  }
}

export type AudioFile = {
  uri: string;
  name: string;
  folder: string;
  /** Segundos, quando a fonte já sabe. */
  duration: number | null;
};

export type Folder = {
  path: string;
  name: string;
  count: number;
};

const AUDIO_EXT = new Set([
  'mp3',
  'm4a',
  'm4b',
  'mp4',
  'aac',
  'flac',
  'ogg',
  'oga',
  'opus',
  'wav',
  'aif',
  'aiff',
  'wma',
]);

const isAudio = (name: string) => AUDIO_EXT.has(name.split('.').pop()?.toLowerCase() ?? '');

/**
 * `unavailable` significa que o app foi aberto sem o módulo nativo — Expo Go, ou um
 * development build feito antes de `expo-media-library` entrar no projeto.
 */
export type Access = 'ok' | 'denied' | 'unavailable';

/** O iOS não precisa de permissão para a própria pasta Documents. */
export async function ensureAccess(): Promise<Access> {
  if (Platform.OS !== 'android') return 'ok';
  const ml = await mediaLibrary();
  if (!ml) return 'unavailable';
  try {
    const { granted } = await ml.requestPermissionsAsync(false, ['audio']);
    return granted ? 'ok' : 'denied';
  } catch {
    return 'unavailable';
  }
}

export const canBrowseFolders = Platform.OS === 'android';

/** Percorre um diretório recursivamente. Serve para a pasta do app no iOS e para as
 * pastas concedidas por SAF no Android. */
function walk(dir: Directory, out: AudioFile[]): void {
  let entries: (Directory | File)[];
  try {
    entries = dir.list();
  } catch {
    return; // permissão revogada ou diretório removido
  }
  for (const entry of entries) {
    if (entry instanceof Directory) walk(entry, out);
    else if (isAudio(entry.name))
      out.push({
        uri: entry.uri,
        name: entry.name,
        folder: Paths.dirname(entry.uri),
        duration: null,
      });
  }
}

async function listAndroid(extra: string[]): Promise<AudioFile[]> {
  const out: AudioFile[] = [];
  const ml = await mediaLibrary();

  // Sem o módulo nativo ainda dá para ler as pastas concedidas por SAF, que passam pelo
  // expo-file-system. A biblioteca fica menor, mas o app funciona.
  if (ml) {
    const { AssetField, MediaType, Query } = ml;
    const assets = await new Query().eq(AssetField.MEDIA_TYPE, MediaType.AUDIO).exe();
    // Em lotes: cada getInfo() é uma travessia da ponte nativa.
    for (let i = 0; i < assets.length; i += 100) {
      const infos = await Promise.all(assets.slice(i, i + 100).map((a) => a.getInfo()));
      for (const info of infos) {
        if (!info.uri || !isAudio(info.filename)) continue;
        out.push({
          uri: info.uri,
          name: info.filename,
          folder: Paths.dirname(info.uri),
          // O media library devolve milissegundos; o resto do app trabalha em segundos.
          duration: info.duration == null ? null : info.duration / 1000,
        });
      }
    }
  }

  // Pastas concedidas por SAF: entram além do MediaStore, sem repetir o que ele já viu.
  // A comparação é por caminho, não por URI — ver pathKey.
  const seen = new Set(out.map((f) => pathKey(f.uri)));
  for (const uri of extra) {
    const found: AudioFile[] = [];
    walk(new Directory(uri), found);
    for (const file of found) {
      const key = pathKey(file.uri);
      if (seen.has(key)) continue;
      // Registrar aqui também: duas pastas concedidas podem se sobrepor
      // (conceder `Music` e depois `Music/Rock` traria Rock duas vezes).
      seen.add(key);
      out.push(file);
    }
  }
  return out;
}


function listIos(): AudioFile[] {
  const out: AudioFile[] = [];
  walk(Paths.document, out);
  return out;
}

/**
 * ponytail: no Android é um getInfo() por arquivo — a lista inteira leva alguns segundos
 * num aparelho cheio. O cache evita repetir o trabalho entre o onboarding e a varredura.
 */
let cached: AudioFile[] | null = null;

export async function listAudioFiles(
  refresh = false,
  /** Pastas concedidas por SAF, guardadas nas preferências. Só valem no Android. */
  extra: string[] = []
): Promise<AudioFile[]> {
  if (!cached || refresh) {
    cached = Platform.OS === 'android' ? await listAndroid(extra) : listIos();
  }
  return cached;
}

/**
 * Abre o seletor de pastas do sistema e devolve a URI concedida.
 *
 * No Android moderno não existe navegar `/storage/emulated/0` como no protótipo: o acesso
 * a pastas fora da mídia indexada passa obrigatoriamente pelo seletor do sistema (SAF).
 *
 * ponytail: se o Android não persistir a concessão entre sessões, a pasta deixa de ser
 * lida na varredura seguinte e some da biblioteca sem erro.
 */
export async function pickFolder(): Promise<string | null> {
  try {
    const dir = await Directory.pickDirectoryAsync();
    cached = null;
    return dir.uri;
  } catch {
    return null; // o usuário cancelou
  }
}

/** Caminho legível: sem esquema e sem escapes de URL. */
export function displayPath(path: string): string {
  return decodeURIComponent(path.replace(/^file:\/\//, ''));
}

/** Agrupa por diretório pai — é a lista de fontes do onboarding. */
export function foldersOf(files: AudioFile[]): Folder[] {
  const counts = new Map<string, number>();
  for (const f of files) counts.set(f.folder, (counts.get(f.folder) ?? 0) + 1);
  return [...counts]
    .map(([path, count]) => ({ path, name: Paths.basename(path) || path, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Traz para dentro do app o que o seletor de arquivos devolveu — **movendo** quando o que
 * ele devolveu já é uma cópia nossa.
 *
 * ## Por que isso existe
 *
 * O seletor do iOS é criado pelo `expo-file-system` com `asCopy: true`
 * (`ios/FilePickingUtils.swift`). Isso quer dizer que **o próprio iOS já copiou** o arquivo
 * para o container do app antes de nos entregar a URL, e que somos nós os responsáveis por
 * ela: o delegate do Expo repassa a URL e não apaga nada.
 *
 * Copiar a partir dali criava uma **segunda** cópia. O arquivo passava a ocupar o dobro
 * dentro do app — a nossa, em Documents, e a do seletor, no diretório temporário, que o
 * iOS só recolhe quando lhe convém e que aparece no armazenamento do aparelho até lá.
 * Importar um álbum de 400 MB custava 800 MB.
 *
 * Mover resolve na origem: as duas pontas estão no mesmo volume, então é um rename — nada
 * é lido, nada é escrito duas vezes, e não sobra o que limpar.
 *
 * ## Por que não é sempre um move
 *
 * No Android o seletor é `ACTION_OPEN_DOCUMENT`, que devolve um `content://` apontando
 * para o arquivo **original do usuário**. Mover ali tiraria a música do lugar dela — é
 * exatamente o que `01-contexto.md` promete que o app nunca faz. O discriminador é o
 * esquema: cópia do seletor do iOS é `file://` dentro do nosso container; SAF é
 * `content://`. Na dúvida, copia — o comportamento antigo, que desperdiça espaço mas não
 * mexe no que é do usuário.
 */
async function adopt(file: File, target: Directory | File): Promise<void> {
  if (Platform.OS === 'ios' && file.uri.startsWith('file://')) {
    await file.move(target, { overwrite: true });
    return;
  }
  await file.copy(target, { overwrite: true });
}

/**
 * iOS: traz arquivos de fora do sandbox para Documents, onde a varredura enxerga.
 * Devolve quantos entraram.
 *
 * **Não traz o que já está lá.** A pasta do app é visível no Files.app
 * (`UIFileSharingEnabled`), então o seletor mostra a própria pasta do Resonate entre os
 * lugares de onde importar — e é o lugar mais óbvio, porque é onde a música do usuário
 * está. Importar dali copiava o arquivo para a raiz de Documents ao lado do que já existia
 * em `Documents/Music/`, e a varredura, que é recursiva, achava os dois: peso dobrado e a
 * faixa repetida na biblioteca.
 *
 * A comparação é pelo **nome**, e não por conteúdo. Com `asCopy: true` o que chega às
 * nossas mãos é sempre uma cópia temporária nova, então não há como comparar caminho de
 * origem; e hash de arquivo inteiro custaria ler cada FLAC de 40 MB para decidir. Nome
 * igual dentro da mesma biblioteca é indício suficiente — e o custo de errar é pequeno nos
 * dois sentidos: pular um arquivo homônimo de verdade, ou não pular nada.
 */
export async function importFiles(): Promise<number> {
  const picked = await File.pickFileAsync({ multipleFiles: true, mimeTypes: ['audio/*'] });
  if (picked.canceled) return 0;

  // A lista em cache basta: ela é o que a biblioteca conhece agora.
  const known = new Set((await listAudioFiles()).map((f) => f.name.toLowerCase()));

  let n = 0;
  for (const file of picked.result) {
    try {
      if (known.has(file.name.toLowerCase())) {
        /*
          Já está na biblioteca. A cópia que o seletor fez é nossa para limpar — deixá-la
          seria justamente o desperdício que este caminho existe para não ter.
        */
        if (Platform.OS === 'ios' && file.uri.startsWith('file://')) file.delete();
        continue;
      }
      await adopt(file, Paths.document);
      known.add(file.name.toLowerCase());
      n++;
    } catch {
      // arquivo sem permissão de leitura ou nome duplicado: segue para o próximo
    }
  }
  if (n) cached = null;
  return n;
}

/**
 * O mesmo `adopt`, para quem escolhe um arquivo que não é música — o `.lrc` da letra e a
 * capa de uma lista. O vazamento era idêntico nos dois; uma capa de vários megabytes
 * duplicada é o mesmo desperdício em escala menor.
 */
export { adopt as adoptPicked };
