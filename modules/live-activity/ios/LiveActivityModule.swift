import ActivityKit
import ExpoModulesCore

/// Estado que chega do JavaScript.
struct LiveActivityState: Record {
  @Field var trackId: String = ""
  @Field var title: String = ""
  @Field var artist: String = ""
  @Field var album: String = ""
  @Field var isPlaying: Bool = false
  @Field var elapsed: Double = 0
  @Field var duration: Double = 0
  @Field var accentHex: String = "#F2653A"
  @Field var artworkPath: String?
}

/// Ponte para o ActivityKit: cria, atualiza e encerra a Live Activity do que está tocando.
///
/// Toda a superfície é tolerante: em iOS anterior a 16.2, com Live Activities desligadas
/// nos ajustes, ou se o sistema recusar a criação, os métodos não fazem nada em vez de
/// lançar. O player não deve depender disso para funcionar.
public class LiveActivityModule: Module {
  /// Guardado como `Any` porque o tipo genérico `Activity<…>` só existe em iOS 16.1+ e
  /// uma propriedade não pode ser marcada com disponibilidade.
  private var current: Any?

  public func definition() -> ModuleDefinition {
    Name("LiveActivity")

    Function("isSupported") { () -> Bool in
      if #available(iOS 16.2, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    AsyncFunction("start") { (state: LiveActivityState) in
      guard #available(iOS 16.2, *) else { return }
      guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }

      // Trocar de faixa encerra a atividade anterior: o ActivityAttributes carrega o id
      // da faixa, que é fixo enquanto a atividade vive.
      self.endCurrent()

      let attributes = ResonateActivityAttributes(trackId: state.trackId)
      let content = ActivityContent(state: Self.contentState(from: state), staleDate: nil)

      do {
        self.current = try Activity.request(
          attributes: attributes,
          content: content,
          pushType: nil
        )
      } catch {
        // Limite de atividades atingido, ou o usuário desativou para o app.
        self.current = nil
      }
    }

    AsyncFunction("update") { (state: LiveActivityState) in
      guard #available(iOS 16.2, *) else { return }
      guard let activity = self.current as? Activity<ResonateActivityAttributes> else { return }
      let content = ActivityContent(state: Self.contentState(from: state), staleDate: nil)
      await activity.update(content)
    }

    AsyncFunction("end") { () in
      guard #available(iOS 16.2, *) else { return }
      await self.endCurrentAsync()
    }

    OnDestroy {
      self.endCurrent()
    }
  }

  @available(iOS 16.2, *)
  private static func contentState(
    from state: LiveActivityState
  ) -> ResonateActivityAttributes.ContentState {
    ResonateActivityAttributes.ContentState(
      title: state.title,
      artist: state.artist,
      album: state.album,
      isPlaying: state.isPlaying,
      elapsed: state.elapsed,
      duration: state.duration,
      accentHex: state.accentHex,
      artworkPath: state.artworkPath
    )
  }

  private func endCurrent() {
    guard #available(iOS 16.2, *) else { return }
    guard let activity = current as? Activity<ResonateActivityAttributes> else { return }
    current = nil
    Task { await activity.end(nil, dismissalPolicy: .immediate) }
  }

  @available(iOS 16.2, *)
  private func endCurrentAsync() async {
    guard let activity = current as? Activity<ResonateActivityAttributes> else { return }
    current = nil
    await activity.end(nil, dismissalPolicy: .immediate)
  }
}
