import ExpoModulesCore
import UIKit

/**
 Stories do Instagram no iOS.

 O contrato é outro do Android: não há intent. O Instagram lê a etiqueta e as cores de
 fundo da **área de transferência**, em itens com chaves próprias, e só depois é aberto
 pelo esquema `instagram-stories://share`. Os itens ganham validade de cinco minutos para
 não ficarem no pasteboard do usuário depois que o compartilhamento aconteceu.

 `canOpenURL` exige `instagram-stories` em `LSApplicationQueriesSchemes` no Info.plist —
 sem isso o sistema responde false mesmo com o app instalado.

 `source_application` deveria ser um App ID do Facebook. Sem um registrado sobra o
 bundle id, que é o ponto historicamente mais sujeito a recusa neste caminho.

 Não verificado em aparelho: este projeto não tem pasta `ios/` e não houve como rodar.
 */
public class StoryShareModule: Module {
  public func definition() -> ModuleDefinition {
    Name("StoryShare")

    AsyncFunction("open") { (sticker: String, top: String, bottom: String, promise: Promise) in
      let source = Bundle.main.bundleIdentifier ?? ""
      guard let url = URL(string: "instagram-stories://share?source_application=\(source)"),
            UIApplication.shared.canOpenURL(url)
      else {
        return promise.resolve(false)
      }

      // O caminho chega como `file://` do cache do app.
      guard let fileURL = URL(string: sticker),
            let data = try? Data(contentsOf: fileURL)
      else {
        return promise.resolve(false)
      }

      UIPasteboard.general.setItems(
        [[
          "com.instagram.sharedSticker.stickerImage": data,
          "com.instagram.sharedSticker.backgroundTopColor": top,
          "com.instagram.sharedSticker.backgroundBottomColor": bottom,
        ]],
        options: [.expirationDate: Date().addingTimeInterval(300)]
      )

      UIApplication.shared.open(url, options: [:]) { opened in
        promise.resolve(opened)
      }
    }
    .runOnQueue(.main)
  }
}
