import SwiftUI

/// Paints `BackdropStore` behind the content column: the banner (or a
/// title-seeded gradient), then the same gradient stack the web uses —
/// left-to-right fade so text stays readable, bottom fade into the page.
struct BackdropLayer: View {
    @Environment(BackdropStore.self) private var backdrop
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// The decoded banner, swapped only after the next image finishes
    /// loading, so carousel rotations crossfade image-to-image instead of
    /// dipping through the fallback gradient while the network round-trips.
    @State private var banner: CGImage?

    var body: some View {
        GeometryReader { proxy in
            let height = min(max(proxy.size.height * 0.62, 420), 640)
            ZStack(alignment: .top) {
                Theme.background
                ZStack {
                    Rectangle().fill(Theme.animeGradient(backdrop.fallbackSeed))
                    if let banner {
                        Image(decorative: banner, scale: 1)
                            .resizable()
                            .scaledToFill()
                            .transition(.opacity)
                            .id(ObjectIdentifier(banner))
                    }
                }
                .frame(height: height)
                .clipped()
                .overlay {
                    if backdrop.style == .hero {
                        // Web BannerImage: even darkening (brightness 0.6),
                        // no leading fade — the picture stays visible.
                        Color.black.opacity(0.4)
                    } else {
                        LinearGradient(
                            stops: [
                                .init(color: Theme.background.opacity(0.85), location: 0),
                                .init(color: Theme.background.opacity(0.35), location: 0.35),
                                .init(color: .clear, location: 0.6),
                            ],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    }
                }
                .overlay {
                    if backdrop.style == .hero {
                        LinearGradient(
                            stops: [
                                .init(color: Theme.background.opacity(0.5), location: 0),
                                .init(color: .clear, location: 0.25),
                                .init(color: .clear, location: 0.7),
                                .init(color: Theme.background, location: 1),
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    } else {
                        LinearGradient(
                            stops: [
                                .init(color: .clear, location: 0),
                                .init(color: .clear, location: 0.45),
                                .init(color: Theme.background, location: 1),
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    }
                }
                .overlay(Theme.background.opacity(backdrop.dim))
                .frame(maxHeight: .infinity, alignment: .top)
            }
            // Web crossfades banner switches over 1s (AnimatePresence).
            .animation(reduceMotion ? nil : .easeInOut(duration: 1.0), value: banner.map(ObjectIdentifier.init))
            // Web fades the banner over 1s when scrolling past the hero.
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.8), value: backdrop.dim)
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .task(id: backdrop.image) {
            guard let url = backdrop.image else {
                banner = nil
                return
            }
            guard let image = await ImageCache.shared.image(for: url, maxPixel: 1600) else { return }
            banner = image
        }
    }
}
