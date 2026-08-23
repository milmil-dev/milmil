import Foundation
import Observation

/// The full-bleed banner behind the whole window (web `BannerImage`):
/// pages publish an image + how dark it should be; the root crossfades.
@Observable
final class BackdropStore {
    private(set) var image: URL?
    private(set) var fallbackSeed = "milmil"
    /// 0 = full banner, 1 = nearly hidden (pages that need readable content).
    private(set) var dim = 0.0
    /// Owner token so a page leaving the screen only clears its own image.
    private var owner: String?

    func set(_ image: URL?, seed: String, dim: Double = 0, owner: String) {
        self.owner = owner
        self.image = image
        fallbackSeed = seed
        self.dim = dim
    }

    func clear(owner: String) {
        guard self.owner == owner else { return }
        image = nil
        dim = 0
    }
}
