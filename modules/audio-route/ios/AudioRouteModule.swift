import AVKit
import ExpoModulesCore
import UIKit

/**
 Seletor de saída de áudio no iOS.

 É uma **view**, e não uma função: o iOS não tem API para apresentar o seletor de rota por
 conta própria. O único caminho sancionado é o `AVRoutePickerView`, um botão da AVKit que
 abre a folha do AirPlay quando tocado. O Android tem o contrário — um painel do sistema
 aberto por intent, que é o que `src/lib/audio-output.ts` faz lá.

 O botão desenha o próprio glifo do AirPlay, então aqui não há ícone nosso: quem manda no
 desenho é a Apple, e é isso que faz o controle parecer nativo. O `tint` deixa a cor
 casar com o resto do player.

 Não verificado em aparelho: este projeto não tem pasta `ios/` e não houve como rodar.
 */
public class AudioRouteModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AudioRoute")

    /*
      Existe para o JavaScript ter o que perguntar.

      `requireOptionalNativeModule` procura um módulo registrado; um módulo que só declara
      uma `View` é o tipo de coisa que pode devolver null sem erro nenhum, e aí o botão
      desaparece calado. Uma função trivial garante o registro.
    */
    Function("isAvailable") { true }

    View(RoutePickerView.self) {
      Prop("tint") { (view: RoutePickerView, hex: String) in
        view.setTint(hex)
      }
    }
  }
}

class RoutePickerView: ExpoView {
  private let picker = AVRoutePickerView()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    // Falso: o app é só áudio, e com `true` o botão prefere rotas de vídeo.
    picker.prioritizesVideoDevices = false
    addSubview(picker)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    picker.frame = bounds
  }

  func setTint(_ hex: String) {
    guard let color = UIColor(hex: hex) else { return }
    picker.tintColor = color
    // A mesma cor nos dois estados: um acento diferente quando conectado brigaria com o
    // acento que o usuário escolheu em Ajustes.
    picker.activeTintColor = color
  }
}

private extension UIColor {
  /// `#RRGGBB` ou `#RRGGBBAA`.
  convenience init?(hex: String) {
    var value = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if value.hasPrefix("#") { value.removeFirst() }
    guard value.count == 6 || value.count == 8, let n = UInt64(value, radix: 16) else {
      return nil
    }
    let hasAlpha = value.count == 8
    let r = CGFloat((n >> (hasAlpha ? 24 : 16)) & 0xFF) / 255
    let g = CGFloat((n >> (hasAlpha ? 16 : 8)) & 0xFF) / 255
    let b = CGFloat((n >> (hasAlpha ? 8 : 0)) & 0xFF) / 255
    let a = hasAlpha ? CGFloat(n & 0xFF) / 255 : 1
    self.init(red: r, green: g, blue: b, alpha: a)
  }
}
