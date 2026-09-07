package com.nossapesca.storyshare

import android.content.Intent
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Manda o card para o Stories do Instagram, com a etiqueta lida do cache do app.
 *
 * Existe por um detalhe do Android que não tem contorno em JavaScript:
 * `FLAG_GRANT_READ_URI_PERMISSION` só concede a URI que está no `data` do intent (e as do
 * ClipData). Uma URI que viaja em *extra* — e `interactive_asset_uri` é extra — chega
 * ilegível ao outro app. O FileProvider do Expo é `exported="false"`, como todo
 * FileProvider deve ser, então sem uma concessão explícita o Instagram não abre o arquivo.
 *
 * A alternativa sem código nativo era publicar a etiqueta no MediaStore, de onde qualquer
 * app com permissão de mídia lê. Só que aí sobra um arquivo na galeria do usuário, e
 * apagá-lo depois faz o Android pedir confirmação — um diálogo "apagar esta foto?" no fim
 * de cada compartilhamento. Vinte linhas aqui trocam isso por nada.
 *
 * `grantUriPermission` é revogado sozinho quando a atividade de destino termina.
 */
class StoryShareModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("StoryShare")

    /**
     * Devolve false quando o Instagram não está instalado ou recusou o intent — quem
     * chama cai na folha do sistema.
     *
     * `sticker` é o `content://` do FileProvider do app. As duas cores são `#RRGGBB`, e o
     * Instagram desenha o gradiente entre elas no lugar de uma imagem de fundo.
     */
    AsyncFunction("open") { sticker: String, top: String, bottom: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      val uri = Uri.parse(sticker)

      val intent = Intent("com.instagram.share.ADD_TO_STORY").apply {
        setPackage(INSTAGRAM)
        type = "image/png"
        putExtra("source_application", context.packageName)
        putExtra("interactive_asset_uri", uri)
        putExtra("top_background_color", top)
        putExtra("bottom_background_color", bottom)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }

      if (intent.resolveActivity(context.packageManager) == null) return@AsyncFunction false

      // A concessão é o motivo deste módulo existir: sem ela a URI do extra não abre.
      context.grantUriPermission(INSTAGRAM, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)

      try {
        context.startActivity(intent)
        true
      } catch (e: Exception) {
        context.revokeUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        false
      }
    }
  }

  private companion object {
    const val INSTAGRAM = "com.instagram.android"
  }
}
