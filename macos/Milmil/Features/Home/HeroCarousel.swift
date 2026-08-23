import MilmilAPI
import SwiftUI

/// Apple TV-style billboard over the page backdrop: poster, title, meta,
/// Play / Details. Auto-advances every 8 s, pauses on hover, ←/→ to step.
struct HeroCarousel: View {
    let items: [AnimeSummary]
    var onOpen: (AnimeSummary) -> Void
    var onPlay: (AnimeSummary) -> Void
    var onActiveChange: (AnimeSummary) -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var index = 0
    @State private var hovering = false
    @State private var timer: Task<Void, Never>?
    @ObserveInjection private var inject

    private var featured: AnimeSummary? { items.indices.contains(index) ? items[index] : items.first }

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            if let featured {
                HStack(alignment: .center, spacing: 32) {
                    PosterCard(title: featured.title, cover: featured.coverImage, width: 220, onOpen: { onOpen(featured) })
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 14) {
                        Text(featured.title)
                            .font(.system(size: 40, weight: .heavy))
                            .tracking(-0.5)
                            .lineLimit(2)
                            .foregroundStyle(.white)
                            .shadow(color: .black.opacity(0.5), radius: 12, y: 2)
                        metaRow(featured)
                        if let description = featured.description?.strippingHTML {
                            Text(description)
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.65))
                                .lineSpacing(4)
                                .lineLimit(3)
                                .frame(maxWidth: 560, alignment: .leading)
                                .shadow(color: .black.opacity(0.5), radius: 6, y: 1)
                        }
                        HStack(spacing: 10) {
                            Button { onPlay(featured) } label: {
                                Label("播放", systemImage: "play.fill")
                            }
                            .buttonStyle(HeroButtonStyle(primary: true))
                            .keyboardShortcut(.return, modifiers: [])
                            Button("詳情") { onOpen(featured) }
                                .buttonStyle(HeroButtonStyle(primary: false))
                        }
                        .padding(.top, 4)
                    }
                    .frame(maxWidth: 680, alignment: .leading)
                    Spacer(minLength: 0)
                }
                .id(featured.id)
                .transition(slideTransition)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 400, alignment: .leading)
        .overlay(alignment: .bottomLeading) { dots.padding(.top, 24) }
        .overlay(alignment: .bottomTrailing) { arrows }
        .animation(reduceMotion ? nil : .easeOut(duration: 0.4), value: index)
        .onHover { hovering = $0 }
        .onAppear { restartTimer() }
        .onDisappear { timer?.cancel() }
        .onChange(of: items.count) { restartTimer() }
        .onChange(of: index) { if let featured { onActiveChange(featured) } }
        .task(id: items.first?.id) { if let featured { onActiveChange(featured) } }
        .focusable()
        .focusEffectDisabled()
        .onKeyPress(.leftArrow) { step(-1); return .handled }
        .onKeyPress(.rightArrow) { step(1); return .handled }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("精選作品")
    }

    private var slideTransition: AnyTransition {
        if reduceMotion { return .opacity }
        return .asymmetric(
            insertion: .opacity.combined(with: .offset(y: 12)),
            removal: .opacity.combined(with: .offset(y: -8))
        )
    }

    private func metaRow(_ item: AnimeSummary) -> some View {
        HStack(spacing: 10) {
            if item.score > 0 {
                HStack(spacing: 4) {
                    Image(systemName: "heart.fill").font(.system(size: 12))
                    Text(item.score, format: .number.precision(.fractionLength(1)))
                }
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(Theme.accent)
                Rectangle().fill(.white.opacity(0.15)).frame(width: 1, height: 14)
            }
            ForEach(item.genres.prefix(4), id: \.self) { Chip(text: $0) }
            if let meta = metaText(item) {
                Chip(text: meta).opacity(0.7)
            }
        }
    }

    private func metaText(_ item: AnimeSummary) -> String? {
        var parts: [String] = []
        if let season = Formatters.season(from: item.airDate) { parts.append(season) }
        if let type = item.mediaType { parts.append(type) }
        if item.episodeCount > 0 { parts.append("\(item.episodeCount) 集") }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private var dots: some View {
        HStack(spacing: 8) {
            ForEach(items.indices, id: \.self) { i in
                Capsule()
                    .fill(i == index ? .white : .white.opacity(0.5))
                    .frame(width: i == index ? 22 : 8, height: i == index ? 6 : 8)
                    .onTapGesture { index = i; restartTimer() }
            }
        }
        .animation(.snappy(duration: 0.25), value: index)
        .accessibilityHidden(true)
    }

    private var arrows: some View {
        HStack(spacing: 6) {
            arrow("chevron.left") { step(-1) }
            arrow("chevron.right") { step(1) }
        }
    }

    private func arrow(_ symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 28, height: 28)
                .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 7))
        }
        .buttonStyle(.plain)
    }

    private func step(_ delta: Int) {
        guard !items.isEmpty else { return }
        index = (index + delta + items.count) % items.count
        restartTimer()
    }

    private func restartTimer() {
        timer?.cancel()
        guard items.count > 1 else { return }
        timer = Task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(8))
                guard !Task.isCancelled else { return }
                if !hovering { index = (index + 1) % items.count }
            }
        }
    }
}

struct HeroButtonStyle: ButtonStyle {
    let primary: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: primary ? .semibold : .medium))
            .foregroundStyle(primary ? .black : .white.opacity(0.85))
            .padding(.horizontal, primary ? 18 : 14)
            .frame(height: 30)
            .background(primary ? .white : .white.opacity(0.1), in: Capsule())
            .overlay(Capsule().strokeBorder(.white.opacity(primary ? 0 : 0.1)))
            .opacity(configuration.isPressed ? 0.8 : 1)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}

extension String {
    /// Bangumi descriptions can carry HTML; the web strips tags the same way.
    var strippingHTML: String {
        replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
            .replacingOccurrences(of: "\r\n", with: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
