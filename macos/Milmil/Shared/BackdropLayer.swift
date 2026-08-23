import SwiftUI

/// Paints `BackdropStore` behind the content column: the banner (or a
/// title-seeded gradient), then the same gradient stack the web uses —
/// left-to-right fade so text stays readable, bottom fade into the page.
struct BackdropLayer: View {
    @Environment(BackdropStore.self) private var backdrop
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GeometryReader { proxy in
            let height = min(max(proxy.size.height * 0.62, 420), 640)
            ZStack(alignment: .top) {
                Theme.background
                ZStack {
                    Rectangle().fill(Theme.animeGradient(backdrop.fallbackSeed))
                    if let image = backdrop.image {
                        RemoteImage(url: image, maxPixel: 1600) { Color.clear }
                            .id(image)
                    }
                }
                .frame(height: height)
                .overlay(
                    LinearGradient(
                        stops: [
                            .init(color: Theme.background.opacity(0.85), location: 0),
                            .init(color: Theme.background.opacity(0.35), location: 0.35),
                            .init(color: .clear, location: 0.6),
                        ],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .overlay(
                    LinearGradient(
                        stops: [
                            .init(color: .clear, location: 0),
                            .init(color: .clear, location: 0.45),
                            .init(color: Theme.background, location: 1),
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .overlay(Theme.background.opacity(backdrop.dim))
                .frame(maxHeight: .infinity, alignment: .top)
            }
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.35), value: backdrop.image)
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: backdrop.dim)
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
