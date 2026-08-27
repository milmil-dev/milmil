import SwiftUI

/// Paints `BackdropStore` behind the content column: the banner (or a
/// title-seeded gradient), then the same gradient stack the web uses —
/// left-to-right fade so text stays readable, bottom fade into the page.
struct BackdropLayer: View {
    @Environment(BackdropStore.self) private var backdrop
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GeometryReader { proxy in
            let banner = backdrop.banner
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
                        // Web BannerImage's even darkening (brightness 0.6),
                        // but washed toward the page colour rather than to
                        // black: in the light theme a black wash fights the
                        // near-black `ink` text sitting on top of it.
                        Theme.background.opacity(0.45)
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
                // Web BannerImage's left gradient (`max-w-[80rem]`): the strip
                // of banner under the title, tags and synopsis is washed back
                // into the page colour, so hero text keeps its contrast even
                // over bright artwork. Without it a red/orange banner swallows
                // the `ink`-toned meta row and chips.
                .overlay {
                    if backdrop.style == .hero {
                        LinearGradient(
                            stops: [
                                .init(color: Theme.background, location: 0),
                                .init(color: Theme.background.opacity(0.6), location: 0.15),
                                .init(color: .clear, location: 0.5),
                            ],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                        .frame(maxWidth: 1280, alignment: .leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
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
    }
}
