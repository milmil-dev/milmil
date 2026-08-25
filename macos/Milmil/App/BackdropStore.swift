import Foundation
import Observation

/// The full-bleed banner behind the whole window (web `BannerImage`):
/// pages publish an image + how dark it should be; the root crossfades.
@Observable
final class BackdropStore {
    /// How the layer fades the banner into the page.
    enum Style {
        /// Strong leading fade so text at the left stays readable (Home).
        case page
        /// Web detail-page treatment: full-width banner, darkened evenly,
        /// only soft top/bottom fades.
        case hero
    }

    private(set) var image: URL?
    private(set) var fallbackSeed = "milmil"
    /// 0 = full banner, 1 = nearly hidden (pages that need readable content).
    private(set) var dim = 0.0
    private(set) var style: Style = .page
    /// Owner token so a page leaving the screen only clears its own image.
    private var owner: String?

    func set(_ image: URL?, seed: String, dim: Double = 0, style: Style = .page, owner: String) {
        self.owner = owner
        self.image = image
        fallbackSeed = seed
        self.dim = dim
        self.style = style
    }

    /// Scroll-linked dimming: only the current owner may adjust it, so a page
    /// scrolling away can't dim the next page's backdrop.
    func setDim(_ dim: Double, owner: String) {
        guard self.owner == owner else { return }
        self.dim = dim
    }

    func clear(owner: String) {
        guard self.owner == owner else { return }
        image = nil
        dim = 0
        style = .page
    }
}
