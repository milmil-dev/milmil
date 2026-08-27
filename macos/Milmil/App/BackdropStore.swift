import CoreGraphics
import Foundation
import Observation

/// The full-bleed banner behind the whole window (web `BannerImage`).
///
/// Every page publishes what it wants under its own owner key; the shell
/// tells the store which owners are on screen (sidebar root first, then each
/// pushed route). The topmost owner that has published wins, so a pushed
/// page that is still loading keeps the banner beneath it instead of dipping
/// to the gradient, and popping back restores the root's banner without the
/// root having to notice — SwiftUI does not re-run `onAppear` on a
/// NavigationStack root that was merely covered.
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

    private struct Entry {
        var image: URL?
        var seed: String
        var dim: Double
        var style: Style
    }

    private var entries: [String: Entry] = [:]
    /// Owners currently on screen, root first (see `show`).
    private var stack: [String] = []

    private var active: Entry? {
        for owner in stack.reversed() {
            if let entry = entries[owner] { return entry }
        }
        return nil
    }

    var image: URL? { active?.image }
    var fallbackSeed: String { active?.seed ?? "milmil" }
    /// 0 = full banner, 1 = nearly hidden (pages that need readable content).
    var dim: Double { active?.dim ?? 0 }
    var style: Style { active?.style ?? .page }

    /// The decoded banner, swapped only after the next image finishes
    /// loading, so switches crossfade image-to-image instead of dipping
    /// through the fallback gradient while the network round-trips. Owned
    /// here rather than by `BackdropLayer` so a freshly created layer (each
    /// pushed route carries its own) paints the current banner at once.
    private(set) var banner: CGImage?
    private var loading: URL?
    private var loader: Task<Void, Never>?

    func set(_ image: URL?, seed: String, dim: Double = 0, style: Style = .page, owner: String) {
        entries[owner] = Entry(image: image, seed: seed, dim: dim, style: style)
        refresh()
    }

    /// Scroll-linked dimming; only shows while that owner is the active one.
    func setDim(_ dim: Double, owner: String) {
        entries[owner]?.dim = dim
    }

    /// The owners on screen, root first. Entries for owners that left the
    /// screen are dropped, so a page returns to a clean slate next time.
    func show(_ owners: [String]) {
        stack = owners
        entries = entries.filter { owners.contains($0.key) }
        refresh()
    }

    private func refresh() {
        let url = image
        guard url != loading else { return }
        loading = url
        loader?.cancel()
        guard let url else {
            loader = nil
            banner = nil
            return
        }
        loader = Task { [weak self] in
            guard let decoded = await ImageCache.shared.image(for: url, maxPixel: 1600),
                  !Task.isCancelled, let self, self.loading == url else { return }
            self.banner = decoded
        }
    }
}
