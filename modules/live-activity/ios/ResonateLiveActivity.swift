import ActivityKit
import SwiftUI
import WidgetKit

/// A Live Activity do Resonate: cartão na tela de bloqueio e as três formas da
/// Dynamic Island.
///
/// Este arquivo pertence **à extensão de widget**, não ao app. O app só publica estado;
/// quem desenha é o sistema, dentro dos limites de tamanho que ele impõe.
@available(iOS 16.2, *)
struct ResonateLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: ResonateActivityAttributes.self) { context in
      LockScreenCard(state: context.state)
        .activityBackgroundTint(Color(hex: "#0E0C0B"))
        .activitySystemActionForegroundColor(Color(hex: context.state.accentHex))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Artwork(state: context.state, size: 44)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(remaining(context.state))
            .font(.system(size: 13, weight: .medium, design: .monospaced))
            .foregroundStyle(.secondary)
        }
        DynamicIslandExpandedRegion(.center) {
          VStack(alignment: .leading, spacing: 2) {
            Text(context.state.title)
              .font(.system(size: 14, weight: .semibold))
              .lineLimit(1)
            Text(context.state.artist)
              .font(.system(size: 12))
              .foregroundStyle(.secondary)
              .lineLimit(1)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
        DynamicIslandExpandedRegion(.bottom) {
          Progress(state: context.state)
        }
      } compactLeading: {
        Artwork(state: context.state, size: 20)
      } compactTrailing: {
        // Espaço apertado: só o progresso, em anel.
        ProgressRing(state: context.state)
      } minimal: {
        ProgressRing(state: context.state)
      }
      .widgetURL(URL(string: "resonate://player"))
      .keylineTint(Color(hex: context.state.accentHex))
    }
  }
}

/// Cartão da tela de bloqueio.
@available(iOS 16.2, *)
private struct LockScreenCard: View {
  let state: ResonateActivityAttributes.ContentState

  var body: some View {
    HStack(spacing: 14) {
      Artwork(state: state, size: 56)

      VStack(alignment: .leading, spacing: 3) {
        Text(state.title)
          .font(.system(size: 16, weight: .semibold))
          .lineLimit(1)
        Text(state.artist)
          .font(.system(size: 13))
          .foregroundStyle(.secondary)
          .lineLimit(1)
        Progress(state: state)
          .padding(.top, 4)
      }
    }
    .padding(16)
  }
}

/// Capa da faixa, com a arte procedural do app como reserva.
///
/// A extensão não alcança o sandbox do app: sem um App Group compartilhado,
/// `artworkPath` não abre e o degradê no acento assume — que é a mesma linguagem visual
/// das capas geradas dentro do app.
@available(iOS 16.2, *)
private struct Artwork: View {
  let state: ResonateActivityAttributes.ContentState
  let size: CGFloat

  var body: some View {
    let accent = Color(hex: state.accentHex)

    return Group {
      if let path = state.artworkPath, let image = UIImage(contentsOfFile: path) {
        Image(uiImage: image).resizable().scaledToFill()
      } else {
        LinearGradient(
          colors: [accent.opacity(0.9), accent.opacity(0.35)],
          startPoint: .topLeading,
          endPoint: .bottomTrailing
        )
      }
    }
    .frame(width: size, height: size)
    .clipShape(RoundedRectangle(cornerRadius: size * 0.24, style: .continuous))
  }
}

/// Barra de progresso fina.
@available(iOS 16.2, *)
private struct Progress: View {
  let state: ResonateActivityAttributes.ContentState

  var body: some View {
    GeometryReader { geo in
      ZStack(alignment: .leading) {
        Capsule().fill(.white.opacity(0.16))
        Capsule()
          .fill(Color(hex: state.accentHex))
          .frame(width: geo.size.width * fraction(state))
      }
    }
    .frame(height: 3)
  }
}

/// Anel de progresso, para os espaços mínimos da ilha.
@available(iOS 16.2, *)
private struct ProgressRing: View {
  let state: ResonateActivityAttributes.ContentState

  var body: some View {
    ZStack {
      Circle().stroke(.white.opacity(0.2), lineWidth: 2)
      Circle()
        .trim(from: 0, to: fraction(state))
        .stroke(Color(hex: state.accentHex), style: StrokeStyle(lineWidth: 2, lineCap: .round))
        .rotationEffect(.degrees(-90))
      if !state.isPlaying {
        // Pausado, o anel sozinho pareceria uma faixa que não avança.
        Image(systemName: "pause.fill").font(.system(size: 7))
      }
    }
    .frame(width: 18, height: 18)
  }
}

@available(iOS 16.2, *)
private func fraction(_ state: ResonateActivityAttributes.ContentState) -> CGFloat {
  guard state.duration > 0 else { return 0 }
  return min(1, max(0, CGFloat(state.elapsed / state.duration)))
}

@available(iOS 16.2, *)
private func remaining(_ state: ResonateActivityAttributes.ContentState) -> String {
  guard state.duration > 0 else { return "--:--" }
  let left = Int(max(0, state.duration - state.elapsed).rounded())
  return String(format: "-%d:%02d", left / 60, left % 60)
}

extension Color {
  /// `#RRGGBB` vindo dos tokens do app.
  init(hex: String) {
    let clean = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
    var value: UInt64 = 0
    Scanner(string: clean).scanHexInt64(&value)
    self.init(
      .sRGB,
      red: Double((value >> 16) & 0xFF) / 255,
      green: Double((value >> 8) & 0xFF) / 255,
      blue: Double(value & 0xFF) / 255,
      opacity: 1
    )
  }
}
