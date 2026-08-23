import SwiftUI

/// The centred glass card every pre-login screen sits in, over a tilted
/// poster wall (the web login page's backdrop).
struct OnboardingCard<Content: View>: View {
    let title: String
    let subtitle: String
    @ViewBuilder var content: () -> Content
    @ObserveInjection private var inject

    var body: some View {
        ZStack {
            PosterWall()
            VStack(spacing: 0) {
                AppMark(size: 52)
                    .padding(.bottom, 14)
                Text(title)
                    .font(.system(size: 22, weight: .bold))
                Text(subtitle)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.Text.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.top, 4)
                    .padding(.bottom, 24)
                VStack(alignment: .leading, spacing: 14) {
                    content()
                }
                .padding(24)
                .frame(width: 420)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(.white.opacity(0.08)))
                .shadow(color: .black.opacity(0.5), radius: 30, y: 20)
            }
        }
        .frame(minWidth: 800, minHeight: 560)
    }
}

struct AppMark: View {
    var size: CGFloat

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.27, style: .continuous)
                .fill(Theme.accent.opacity(0.1))
                .overlay(RoundedRectangle(cornerRadius: size * 0.27, style: .continuous).strokeBorder(Theme.accent.opacity(0.2)))
            Circle()
                .fill(RadialGradient(
                    colors: [Color(hex: 0xC4B5FD), Color(hex: 0x6D28D9)],
                    center: .init(x: 0.35, y: 0.35),
                    startRadius: 0,
                    endRadius: size * 0.4
                ))
                .frame(width: size * 0.58, height: size * 0.58)
            Image(systemName: "play.fill")
                .font(.system(size: size * 0.22, weight: .bold))
                .foregroundStyle(.white)
                .offset(x: size * 0.02)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// The web login page's cinema wall: trending covers from
/// `GET /discover/trending` in a 14-column grid, tilted in perspective
/// (`rotateY(-22°) rotateZ(2°)`), dimmed 55 %, vignetted, with an accent glow
/// behind the form. Falls back to title-keyed gradients until covers arrive
/// (or when there is no server yet). The only motion is a one-off fade-in.
struct PosterWall: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ObserveInjection private var inject

    private static let columns = 14
    private static let slots = 210
    private static let fallbackNames = ["尖帽子的魔法工房", "黄泉使者", "葬送的芙莉莲", "药屋少女的呢喃", "迷宫饭", "夏日重现", "异兽魔都", "左撇子艾伦"]

    var body: some View {
        let covers = session.trendingCovers
        GeometryReader { proxy in
            let columns = Array(repeating: GridItem(.flexible(), spacing: 5), count: Self.columns)
            LazyVGrid(columns: columns, spacing: 10) {
                ForEach(0..<Self.slots, id: \.self) { index in
                    cell(index: index, covers: covers)
                        .aspectRatio(2 / 3, contentMode: .fit)
                        .clipShape(RoundedRectangle(cornerRadius: 3))
                }
            }
            .frame(width: proxy.size.width * 1.8)
            .offset(x: -proxy.size.width * 0.4, y: -proxy.size.height * 0.2)
            .rotation3DEffect(.degrees(-22), axis: (x: 0, y: 1, z: 0), perspective: 0.6)
            .rotationEffect(.degrees(2))
        }
        .animation(reduceMotion ? nil : .easeOut(duration: 1.2), value: covers)
        .overlay(Color.black.opacity(0.55))
        .overlay(
            RadialGradient(
                stops: [
                    .init(color: .clear, location: 0),
                    .init(color: Theme.background.opacity(0.35), location: 0.7),
                    .init(color: Theme.background, location: 1),
                ],
                center: .center,
                startRadius: 0,
                endRadius: 900
            )
        )
        .overlay(
            // Accent glow behind the form (web: 600px circle at 5% + 120px blur).
            // A radial gradient instead of `.blur` so nothing clips to a hard disc.
            RadialGradient(colors: [Theme.accent.opacity(0.07), .clear], center: .center, startRadius: 0, endRadius: 420)
        )
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private func cell(index: Int, covers: [URL]) -> some View {
        let fallback = Theme.animeGradient(Self.fallbackNames[index % Self.fallbackNames.count] + String(index))
        if covers.isEmpty {
            Rectangle().fill(fallback)
        } else {
            RemoteImage(url: covers[index % covers.count], maxPixel: 240) {
                Rectangle().fill(fallback)
            }
        }
    }
}

/// Label + control stack used by the onboarding forms.
struct FormField<Control: View>: View {
    let label: String
    @ViewBuilder var control: () -> Control

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.Text.secondary)
            control()
        }
    }
}

struct InlineError: View {
    let message: String

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "exclamationmark.circle.fill")
                .foregroundStyle(.red)
            Text(message)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.Text.primary)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.red.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
        .accessibilityElement(children: .combine)
    }
}
