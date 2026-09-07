/**
 * Compartilhar uma faixa, um álbum ou uma lista como imagem.
 *
 * Dois caminhos de saída, e eles não produzem a mesma coisa:
 *
 * - **A folha do sistema** (`expo-sharing`) recebe *um* arquivo e nada mais. Alcança tudo
 *   o que o aparelho tem instalado, é o único caminho no iOS, e por isso o card sai dela
 *   achatado: fundo, capa, nome e marca assados num PNG de 1080x1920.
 *
 * - **O Stories do Instagram** aceita duas camadas, e é assim que o card do Spotify não
 *   parece um print: a caixa vai como *etiqueta* (`interactive_asset_uri`), que o usuário
 *   arrasta e redimensiona lá dentro, e o fundo é um gradiente que o próprio Instagram
 *   desenha a partir de `top_background_color` e `bottom_background_color`. Duas strings
 *   de cor — nenhuma segunda imagem.
 *
 * A etiqueta é a razão de existir `publishSticker`. `FLAG_GRANT_READ_URI_PERMISSION` só
 * concede a URI que está no `data` do intent, nunca as que viajam em extras — e o
 * FileProvider do Expo é `exported="false"`, então um `content://` dele em extra sai
 * ilegível para o Instagram. A saída sem código nativo é publicar a etiqueta no
 * MediaStore: dali qualquer app com permissão de mídia lê, sem precisar de concessão.
 *
 * Os módulos nativos entram por `import()` dentro das funções, e não no topo: assim um
 * build feito antes deles existirem continua abrindo o app, e só esta ação falha.
 *
 * Nada é escrito fora do app: a captura fica no cache dele, que é onde o view-shot grava.
 * O PNG que aparecia em `DCIM/` — indexado como foto na galeria — vinha do
 * `Asset.create` da versão anterior, que publicava a etiqueta no MediaStore para o
 * Instagram poder lê-la. Não existe mais.
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
 *
 * Sem `resize` a captura sai no tamanho nativo da View — que é o que a etiqueta quer, e
 * o alfa fora dos cantos arredondados vem de graça no PNG. O card achatado, esse sim,
 * precisa dos 1080x1920 que o Instagram pede.
 */
async function capture(ref: React.RefObject<unknown>, resize: boolean): Promise<string> {
  const { captureRef } = await import('react-native-view-shot');
  return captureRef(ref, {
    format: 'png',
    quality: 1,
    result: 'tmpfile',
    ...(resize ? { width: OUT_WIDTH, height: OUT_HEIGHT } : null),
  });
}

/**
 * Manda a etiqueta para o Stories, com o fundo por conta do Instagram.
 *
 * `interactive_asset_uri` é o que faz a caixa chegar como objeto arrastável em vez de
 * papel de parede, e as duas cores substituem a imagem de fundo — é a combinação que dá
 * o card do Spotify. Sem `data` de propósito: uma imagem ali viraria o fundo e cobriria o
 * gradiente.
 *
 * O intent sai de um módulo nativo nosso, e não do `expo-intent-launcher`, por um detalhe
 * do Android sem contorno em JavaScript: `FLAG_GRANT_READ_URI_PERMISSION` só concede a
 * URI do `data`, nunca as que viajam em extras. Uma etiqueta em `interactive_asset_uri`
 * chega ilegível, e o FileProvider do Expo é `exported="false"` — como todo FileProvider
 * deve ser. `modules/story-share` chama `grantUriPermission` antes de disparar, e com isso
 * a etiqueta pode ficar no cache do app.
 *
 * A versão anterior publicava a etiqueta no MediaStore para escapar disso. Funcionava, e
 * deixava um arquivo na galeria do usuário a cada compartilhamento; apagá-lo depois fazia
 * o Android pedir "apagar esta foto?" no fim de cada envio. Nada é escrito fora do app
 * agora.
 *
 * Devolve false quando o Instagram não está instalado, quando o módulo nativo não está no
 * build, ou quando ele recusou — quem chama cai na folha do sistema com o card achatado.
 */
async function toStories(sticker: string, top: string, bottom: string): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const { getContentUriAsync } = await import('expo-file-system/legacy');
    const { openStory } = await import('../../modules/story-share');
    return await openStory(await getContentUriAsync(sticker), top, bottom);
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
 * Cada destino captura a sua View: o Stories quer só a caixa, com o fundo transparente,
 * e a folha quer o card inteiro. Duas capturas da mesma árvore, e nenhuma tela a mais.
 *
 * O Stories cai na folha quando falha: é melhor abrir a folha do que não fazer nada
 * depois de o usuário ter escolhido compartilhar.
 */
export async function shareCard({
  card,
  sticker,
  target,
  title,
  top,
  bottom,
}: {
  /** O card inteiro, com fundo. Vai para a folha do sistema. */
  card: React.RefObject<unknown>;
  /** Só a caixa. Vira etiqueta no Stories. */
  sticker: React.RefObject<unknown>;
  target: ShareTarget;
  title: string;
  /** As duas paradas do gradiente que o Instagram desenha atrás da etiqueta. */
  top: string;
  bottom: string;
}): Promise<boolean> {
  if (target === 'stories') {
    try {
      if (await toStories(await capture(sticker, false), top, bottom)) return true;
    } catch {
      // segue para a folha
    }
  }
  try {
    return await toSheet(await capture(card, true), title);
  } catch {
    return false;
  }
}
