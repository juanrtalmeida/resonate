import ActivityKit
import Foundation

/// Contrato compartilhado entre o app e a extensão do widget.
///
/// Este arquivo tem de estar em **ambos** os targets: o app cria e atualiza a atividade,
/// a extensão a desenha, e os dois precisam da mesma definição para o ActivityKit
/// serializar o estado entre eles.
struct ResonateActivityAttributes: ActivityAttributes {
  /// O que muda enquanto a atividade vive.
  public struct ContentState: Codable, Hashable {
    var title: String
    var artist: String
    var album: String
    var isPlaying: Bool
    /// Segundos decorridos no instante em que o estado foi publicado.
    var elapsed: Double
    /// Zero quando a duração ainda não é conhecida.
    var duration: Double
    /// Cor de acento do app, em `#RRGGBB`, para a ilha combinar com a interface.
    var accentHex: String
    /// Caminho de arquivo da capa. A extensão não acessa o sandbox do app, então a
    /// imagem precisa estar num App Group compartilhado — sem isso, fica sem capa.
    var artworkPath: String?
  }

  /// Identidade da faixa. Fixa durante a atividade; trocar de faixa reinicia o estado.
  var trackId: String
}
