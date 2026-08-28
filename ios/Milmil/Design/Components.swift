import MilmilAPI
import SwiftUI

/// Cover art with everything a shelf needs on it: the rounded corner, a
/// gradient stand-in while it loads, a rating, and how far through it you are.
///
/// One component rather than five hand-rolled `AsyncImage` blocks — the first
/// cut had a different corner radius and a different placeholder on every
/// screen, and no screen showed watch progress at all.
struct Poster: View {
    let title: String
    let url: URL?
    var width: CGFloat = 112
    var score: Double = 0
    var progress: Double = 0
    var badge: String?

    private var height: CGFloat { width * 1.42 }

    var body: some View {
        ZStack(alignment: .bottom) {
            Theme.artworkGradient(title)
            AsyncImage(url: url, transaction: .init(animation: .easeOut(duration: 0.22))) { phase in
                if let image = phase.image {
                    image.resizable().scaledToFill().transition(.opacity)
                }
            }

            // A scrim only where something sits on top of the art, so a clean
            // poster stays clean.
            if score > 0 || progress > 0 {
                LinearGradient(
                    colors: [.clear, .black.opacity(0.65)],
                    startPoint: .center,
                    endPoint: .bottom
                )
            }

            VStack(alignment: .leading, spacing: 5) {
                Spacer(minLength: 0)
                if score > 0 {
                    Label(score.formatted(.number.precision(.fractionLength(0...1))), systemImage: "star.fill")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.white)
                        .labelStyle(.titleAndIcon)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(.black.opacity(0.45), in: Capsule())
                }
                if progress > 0 {
                    Capsule()
                        .fill(.white.opacity(0.25))
                        .frame(height: 3)
                        .overlay(alignment: .leading) {
                            GeometryReader { geometry in
                                Capsule()
                                    .fill(Theme.accent)
                                    .frame(width: geometry.size.width * progress)
                            }
                        }
                }
            }
            .padding(7)

            if let badge {
                Text(badge)
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .background(.black.opacity(0.55), in: Capsule())
                    .padding(6)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
        }
        .frame(width: width, height: height)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.poster, style: .continuous))
        .overlay {
            // A hairline keeps a dark poster from dissolving into a dark page.
            RoundedRectangle(cornerRadius: Theme.Radius.poster, style: .continuous)
                .strokeBorder(.white.opacity(0.08), lineWidth: 0.5)
        }
        .shadow(color: .black.opacity(0.45), radius: 8, y: 4)
    }
}

/// A poster with its title under it, as a shelf card.
struct PosterCard: View {
    let title: String
    let url: URL?
    var width: CGFloat = 112
    var score: Double = 0
    var progress: Double = 0
    var badge: String?
    var caption: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Poster(title: title, url: url, width: width, score: score, progress: progress, badge: badge)
            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.ink(0.92))
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                if let caption {
                    Text(caption)
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.ink(0.5))
                        .lineLimit(1)
                }
            }
            // A fixed caption height keeps a row of cards from going ragged
            // when one title wraps to two lines and its neighbour does not.
            .frame(height: caption == nil ? 34 : 48, alignment: .top)
        }
        .frame(width: width, alignment: .leading)
        .contentShape(.rect)
    }
}

/// A shelf heading. Optional trailing action, which is what makes it read as a
/// section rather than a stray label.
struct SectionHeader: View {
    let title: String
    var action: (() -> Void)?

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .font(.system(size: 19, weight: .semibold))
                .foregroundStyle(Theme.ink(0.95))
            Spacer()
            if let action {
                Button(action: action) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.ink(0.4))
                        .frame(width: 30, height: 30)
                        .contentShape(.rect)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, Theme.Space.margin)
    }
}

/// A card surface: one grey, one radius, one hairline, everywhere.
struct CardBackground: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous)
                    .strokeBorder(.white.opacity(0.06), lineWidth: 0.5)
            }
    }
}

/// Presses shrink slightly. The difference between a list of rectangles and an
/// app that feels alive is almost entirely this.
struct PressableCard: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .opacity(configuration.isPressed ? 0.85 : 1)
            .animation(.spring(response: 0.28, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

extension View {
    func cardBackground() -> some View { modifier(CardBackground()) }
}

/// The loading state: shapes where the content will be, sweeping. A spinner in
/// the middle of an empty screen tells the user nothing about what is coming.
struct Skeleton: View {
    var width: CGFloat?
    var height: CGFloat
    var radius: CGFloat = 8

    @State private var sweep = false

    var body: some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(Theme.ink(0.07))
            .frame(width: width, height: height)
            .overlay {
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [.clear, Theme.ink(0.06), .clear],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .offset(x: sweep ? 220 : -220)
            }
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .onAppear {
                withAnimation(.linear(duration: 1.3).repeatForever(autoreverses: false)) { sweep = true }
            }
    }
}

/// A shelf of skeletons, so the home page has a shape before it has data.
struct ShelfSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Skeleton(width: 120, height: 20)
                .padding(.horizontal, Theme.Space.margin)
            HStack(spacing: 12) {
                ForEach(0..<4, id: \.self) { _ in
                    VStack(alignment: .leading, spacing: 8) {
                        Skeleton(width: 112, height: 159, radius: Theme.Radius.poster)
                        Skeleton(width: 84, height: 12)
                    }
                }
            }
            .padding(.horizontal, Theme.Space.margin)
        }
    }
}

/// The namespace the zoom transition matches across.
///
/// A poster tap should *become* the detail page rather than cutting to it —
/// iOS 26 does this with `matchedTransitionSource` on the source and
/// `navigationTransition(.zoom:)` on the destination, and they have to agree on
/// a namespace. The shell owns it; every shelf reads it from the environment.
struct ZoomNamespaceKey: EnvironmentKey {
    static let defaultValue: Namespace.ID? = nil
}

extension EnvironmentValues {
    var zoomNamespace: Namespace.ID? {
        get { self[ZoomNamespaceKey.self] }
        set { self[ZoomNamespaceKey.self] = newValue }
    }
}

extension View {
    /// Marks this view as where the zoom into `bangumiID`'s page starts.
    @ViewBuilder
    func zoomSource(_ bangumiID: Int, in namespace: Namespace.ID?) -> some View {
        if let namespace {
            matchedTransitionSource(id: bangumiID, in: namespace)
        } else {
            self
        }
    }
}
