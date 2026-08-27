import SwiftUI

// Loading placeholders. One shimmer for the whole app: every skeleton is
// built from `SkeletonBox` / `SkeletonText` and inherits the same sheen,
// timing and Reduce Motion fallback, instead of each screen re-inventing a
// pulse. Wrap a group in `.shimmering()` once — the highlight travels across
// the group in window coordinates, so a poster and its title line are lit by
// one moving band rather than each animating on its own clock.
//
// Shape the skeleton like the content that replaces it: same sizes, same
// spacing. A placeholder that matches the real layout means nothing jumps
// when the data lands.

// MARK: - Primitives

/// A block standing in for an image, a card or any filled shape.
struct SkeletonBox: View {
    var cornerRadius: CGFloat = 8
    /// Slightly stronger fills read better for large shapes, lighter ones for
    /// text lines; both stay subtle on the dark surface.
    var opacity: Double = 0.06

    var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(Theme.ink(opacity))
            .shimmerSheen(in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    }
}

/// A text line. Height matches a rendered line of the corresponding font
/// size, so a heading placeholder is not the same bar as a caption.
struct SkeletonText: View {
    var width: CGFloat?
    var height: CGFloat = 11
    var maxWidth: CGFloat?

    var body: some View {
        Capsule(style: .continuous)
            .fill(Theme.ink(0.08))
            .shimmerSheen(in: Capsule(style: .continuous))
            .frame(width: width, height: height)
            .frame(maxWidth: maxWidth, alignment: .leading)
    }
}

/// Several text lines, the last one short the way wrapped prose ends.
struct SkeletonParagraph: View {
    var lines = 3
    var height: CGFloat = 11
    var spacing: CGFloat = 7

    var body: some View {
        VStack(alignment: .leading, spacing: spacing) {
            ForEach(0..<lines, id: \.self) { index in
                SkeletonText(height: height, maxWidth: index == lines - 1 ? 180 : .infinity)
            }
        }
    }
}

// MARK: - Shimmer

/// Where the highlight band currently is, in window coordinates, so every
/// skeleton under one `.shimmering()` lights up as the band passes it.
private struct ShimmerBand: Equatable {
    /// Leading edge of the band, in the window's coordinate space.
    var x: CGFloat
    var width: CGFloat
}

private struct ShimmerBandKey: EnvironmentKey {
    static let defaultValue: ShimmerBand? = nil
}

private extension EnvironmentValues {
    var shimmerBand: ShimmerBand? {
        get { self[ShimmerBandKey.self] }
        set { self[ShimmerBandKey.self] = newValue }
    }
}

extension View {
    /// Sweeps a highlight across the receiver on a loop. Apply to the whole
    /// skeleton group, not to each box.
    func shimmering(active: Bool = true) -> some View {
        modifier(ShimmerModifier(active: active))
    }

    /// Draws the travelling highlight inside `shape`. Clipping to the shape
    /// (rather than masking by the placeholder's own translucent fill, which
    /// would multiply the sheen down to near-invisibility) is what keeps it
    /// readable on a 6%-opacity block.
    fileprivate func shimmerSheen(in shape: some Shape) -> some View {
        modifier(ShimmerSheenModifier(shape: shape))
    }
}

private struct ShimmerModifier: ViewModifier {
    let active: Bool
    @State private var phase: CGFloat = 0
    @State private var frame: CGRect = .zero
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        if !active {
            content
        } else if reduceMotion {
            // A travelling highlight is exactly the kind of motion Reduce
            // Motion asks us to drop; a slow fade still reads as "working".
            content.modifier(PulseModifier())
        } else {
            let band = ShimmerBand(x: bandOrigin, width: bandWidth)
            content
                .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { frame = $0 }
                .environment(\.shimmerBand, frame.width > 0 ? band : nil)
                .task(id: frame.width) {
                    guard frame.width > 0 else { return }
                    phase = 0
                    withAnimation(.linear(duration: 1.4).delay(0.25).repeatForever(autoreverses: false)) {
                        phase = 1
                    }
                }
        }
    }

    /// A band a bit wider than a third of the group, so the sheen reads as a
    /// sweep rather than a flash even on a narrow column.
    private var bandWidth: CGFloat { max(frame.width * 0.38, 160) }

    /// Travels from fully off the leading edge to fully past the trailing one.
    private var bandOrigin: CGFloat {
        frame.minX - bandWidth + phase * (frame.width + bandWidth)
    }
}

private struct ShimmerSheenModifier<S: Shape>: ViewModifier {
    let shape: S
    @Environment(\.shimmerBand) private var band

    func body(content: Content) -> some View {
        content.overlay {
            if let band {
                GeometryReader { proxy in
                    let originX = proxy.frame(in: .global).minX
                    LinearGradient(
                        colors: [.clear, Theme.ink(0.16), .clear],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                    .frame(width: band.width)
                    .offset(x: band.x - originX)
                }
                .clipShape(shape)
                .allowsHitTesting(false)
            }
        }
    }
}

private struct PulseModifier: ViewModifier {
    @State private var dim = false

    func body(content: Content) -> some View {
        content
            .opacity(dim ? 0.55 : 1)
            .animation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true), value: dim)
            .onAppear { dim = true }
    }
}

/// A standalone sheen for content that is not built from the primitives —
/// `RemoteImage`'s gradient placeholder, for one. Self-animating, so it does
/// not need an enclosing `.shimmering()`.
struct ShimmerSheen: View {
    var cornerRadius: CGFloat = 0
    @State private var phase: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GeometryReader { proxy in
            let width = proxy.size.width
            let band = max(width * 0.4, 120)
            LinearGradient(
                colors: [.clear, Theme.ink(0.14), .clear],
                startPoint: .leading,
                endPoint: .trailing
            )
            .frame(width: band)
            .offset(x: -band + phase * (width + band))
            .task(id: width) {
                guard width > 0, !reduceMotion else { return }
                phase = 0
                withAnimation(.linear(duration: 1.4).delay(0.25).repeatForever(autoreverses: false)) {
                    phase = 1
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        .allowsHitTesting(false)
    }
}

// MARK: - Shared shapes

/// Rows in a `groupedCard()` list — notifications, downloads, media files.
struct SkeletonRows: View {
    var count = 6
    var height: CGFloat = 54
    /// Leading square (poster, still, avatar); 0 for text-only rows.
    var leading: CGFloat = 40
    var inset: CGFloat = 14

    var body: some View {
        VStack(spacing: 0) {
            ForEach(0..<count, id: \.self) { index in
                if index > 0 { RowDivider(inset: leading > 0 ? inset * 2 + leading : inset) }
                HStack(spacing: 12) {
                    if leading > 0 {
                        SkeletonBox(cornerRadius: 6).frame(width: leading, height: leading)
                    }
                    VStack(alignment: .leading, spacing: 7) {
                        SkeletonText(width: 220, height: 12)
                        SkeletonText(width: 130, height: 10)
                    }
                    Spacer(minLength: 0)
                    SkeletonText(width: 54, height: 10)
                }
                .padding(.horizontal, inset)
                .frame(height: height)
            }
        }
        .groupedCard()
        .shimmering()
        .accessibilityLabel("載入中")
    }
}

/// A titled section of rows, matching `SectionLabel` + `groupedCard()`.
struct SkeletonSection: View {
    var rows = 4
    var leading: CGFloat = 40

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            SkeletonText(width: 96, height: 13).shimmering()
            SkeletonRows(count: rows, leading: leading)
        }
    }
}
