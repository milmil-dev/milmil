import SwiftUI

/// The centred glass card every pre-login screen sits in, over a tilted
/// poster wall (the web login page's backdrop).
struct OnboardingCard<Content: View>: View {
    let title: String
    let subtitle: String
    @ViewBuilder var content: () -> Content

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

/// Gradient poster wall, rotated like the web login page. Static — no
/// motion, so it is safe under Reduce Motion.
struct PosterWall: View {
    private static let names = ["尖帽子的魔法工房", "黄泉使者", "葬送的芙莉莲", "药屋少女的呢喃", "迷宫饭", "夏日重现", "异兽魔都", "左撇子艾伦"]

    var body: some View {
        GeometryReader { proxy in
            let columns = Array(repeating: GridItem(.flexible(), spacing: 5), count: 12)
            LazyVGrid(columns: columns, spacing: 10) {
                ForEach(0..<72, id: \.self) { index in
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Theme.animeGradient(Self.names[index % Self.names.count] + String(index)))
                        .aspectRatio(2 / 3, contentMode: .fit)
                }
            }
            .frame(width: proxy.size.width * 1.6)
            .offset(x: -proxy.size.width * 0.3, y: -proxy.size.height * 0.25)
            .rotationEffect(.degrees(-12))
            .opacity(0.9)
        }
        .overlay(Color.black.opacity(0.55))
        .overlay(LinearGradient(colors: [Theme.background.opacity(0.4), Theme.background.opacity(0.95)], startPoint: .top, endPoint: .bottom))
        .ignoresSafeArea()
        .accessibilityHidden(true)
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
