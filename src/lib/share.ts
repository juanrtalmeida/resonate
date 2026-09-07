/**
 * Compartilhar uma faixa, um álbum ou uma lista como imagem.
 *
 * O card é uma View de verdade, montada em RN e capturada em PNG — é como Spotify e
 * Apple Music fazem. Nada de desenhar a mesma coisa duas vezes: o que o usuário vê na
 * pré-visualização é literalmente o arquivo que sai.
 *
 * Dois caminhos de saída, porque um não cobre o outro:
 *
 * - A folha do sistema (`expo-sharing`) alcança tudo o que o aparelho tem instalado, sem
 *   integração por app, e é o único caminho no iOS.
 * - O Stories do Instagram só entra pelo intent `com.instagram.share.ADD_TO_STORY`, que
 *   é Android puro. Vale o trabalho porque é o destino que as pessoas de fato usam, e é
 *   o que o Spotify oferece.
 *
 * Os módulos nativos entram por `import()` dentro das funções, e não no topo: assim um
 * build feito antes deles existirem continua abrindo o app, e só esta ação falha.
 */

import { Platform } from 'react-native';

/** Formato de Stories. Tudo o que o card desenha assume esta proporção. */
export const CARD_WIDTH = 360;
export const CARD_HEIGHT = 640;

/** Resolução do arquivo que sai. 1080x1920 é o que o Instagram quer. */
const OUT_WIDTH = 1080;
const OUT_HEIGHT = 1920;

export type ShareTarget = 'sheet' | 'stories';

/** O Stories só existe como intent do Android. */
export const canShareToStories = Platform.OS === 'android';

/**
 * Captura a View apontada pelo ref e devolve o caminho do arquivo.
 *
 * `tmpfile` em vez de base64: o arquivo é o que os dois caminhos de saída querem, e
 * atravessar um PNG de 1080x1920 pela ponte como string não serve para nada.
 */
async function capture(ref: React.RefObject<unknown>): Promise<string> {
  const { captureRef } = await import('react-native-view-shot');
  return captureRef(ref, {
    format: 'png',
    quality: 1,
    result: 'tmpfile',
    fileName: `resonate-${Date.now()}`,
    width: OUT_WIDTH,
    height: OUT_HEIGHT,
  });
}

/**
 * Manda o card para o Stories do Instagram.
 *
 * O intent precisa de um `content://`, não de um `file://`: o Instagram é outro
 * processo, e desde o Android 7 passar um caminho de arquivo entre apps lança
 * `FileUriExposedException`. `getContentUriAsync` devolve a URI do FileProvider que o
 * Expo já registra, e a flag 1 (`FLAG_GRANT_READ_URI_PERMISSION`) é o que autoriza o
 * Instagram a lê-la.
 *
 * `source_application` é exigido pelo Instagram para atribuir a origem. Sem um app id
 * do Facebook registrado sobra o nome do pacote, que as versões atuais aceitam.
 *
 * Devolve false quando o Instagram não está instalado ou recusou — quem chama cai na
 * folha do sistema.
 */
async function toStories(file: string): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const { getContentUriAsync } = await import('expo-file-system/legacy');
    const IntentLauncher = await import('expo-intent-launcher');
    const uri = await getContentUriAsync(file);
    await IntentLauncher.startActivityAsync('com.instagram.share.ADD_TO_STORY', {
      packageName: 'com.instagram.android',
      data: uri,
      type: 'image/png',
      flags: 1,
      extra: { source_application: 'com.nossapesca.Resonate' },
    });
    return true;
  } catch {
    return false;
  }
}

/** Folha do sistema. Alcança Instagram, WhatsApp, Telegram, salvar em arquivo. */
async function toSheet(file: string, title: string): Promise<boolean> {
  try {
    const Sharing = await import('expo-sharing');
    if (!(await Sharing.isAvailableAsync())) return false;
    await Sharing.shareAsync(file, {
      mimeType: 'image/png',
      dialogTitle: title,
      UTI: 'public.png',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Captura e entrega. Devolve false quando não deu — sem módulo nativo, sem app de
 * destino, ou o usuário fechou a folha.
 *
 * O Stories cai na folha quando falha: é melhor abrir a folha do que não fazer nada
 * depois de o usuário ter escolhido compartilhar.
 */
export async function shareCard(
  ref: React.RefObject<unknown>,
  target: ShareTarget,
  title: string
): Promise<boolean> {
  let file: string;
  try {
    file = await capture(ref);
  } catch {
    return false;
  }
  if (target === 'stories' && (await toStories(file))) return true;
  return toSheet(file, title);
}
