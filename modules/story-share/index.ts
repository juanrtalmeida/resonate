/**
 * Stories do Instagram, com a etiqueta lida direto do cache do app.
 *
 * Só existe no Android — `ADD_TO_STORY` é um intent, e não há equivalente no iOS sem o
 * SDK do Facebook. Num build sem o módulo nativo, `openStory` devolve false e o
 * compartilhamento cai na folha do sistema.
 *
 * `requireOptionalNativeModule` em vez de import direto, pelo mesmo motivo do
 * live-activity: um build antigo não pode derrubar o app no boot.
 */

import { requireOptionalNativeModule } from 'expo-modules-core';

const native = requireOptionalNativeModule<{
  open: (sticker: string, top: string, bottom: string) => Promise<boolean>;
}>('StoryShare');

export const canOpenStory = native !== null;

/**
 * @param sticker `content://` do FileProvider do app, apontando para o PNG da etiqueta.
 * @param top Cor do topo do gradiente, `#RRGGBB`.
 * @param bottom Cor do pé do gradiente, `#RRGGBB`.
 */
export async function openStory(
  sticker: string,
  top: string,
  bottom: string
): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.open(sticker, top, bottom);
  } catch {
    return false;
  }
}
