import SwiftUI

/// The visual tokens, shared with the web app and the macOS client.
///
/// A token layer rather than literals at the call site: the first cut of this
/// app reached for `.white.opacity(0.06)` and `RoundedRectangle(cornerRadius:)`
/// wherever a surface was needed, and the result was twelve slightly different
/// greys and five different corner radii.
enum Theme {
    /// Vesica Violet — the web's `--mm-accent`, and the macOS client's.
    static let accent = Color(red: 0.655, green: 0.545, blue: 0.980)

    /// Apple TV's dark grey rather than pure black: black kills every shadow
    /// and makes artwork float on nothing.
    static let background = Color(red: 0.078, green: 0.078, blue: 0.086)

    /// One step up from the background, for cards.
    static let surface = Color(red: 0.110, green: 0.110, blue: 0.122)

    /// White in dark mode, near-black in light — prominent buttons fill with
    /// this, never the accent. Vesica Violet is for state and emphasis.
    static func ink(_ opacity: Double = 1) -> Color { .primary.opacity(opacity) }

    /// The corner scale. Three sizes, used consistently: a poster, a card, a
    /// sheet. Anything else is a mistake.
    enum Radius {
        static let poster: CGFloat = 12
        static let card: CGFloat = 18
        static let sheet: CGFloat = 26
    }

    /// The spacing scale. Multiples of 4, named for what they separate.
    enum Space {
        /// Inside a control.
        static let tight: CGFloat = 6
        /// Between an image and its caption.
        static let inline: CGFloat = 10
        /// Between rows.
        static let row: CGFloat = 14
        /// Screen margin.
        static let margin: CGFloat = 16
        /// Between sections.
        static let section: CGFloat = 28
    }

    /// Poster gradient fallback, ported from `web/src/lib/gradient.ts` so the
    /// same title gets the same colours on every client. Stands in for artwork
    /// that has not loaded, or that the server has none of.
    static func artworkGradient(_ name: String) -> LinearGradient {
        var hash: UInt32 = 5381
        for scalar in name.unicodeScalars {
            hash = ((hash << 5) &+ hash) ^ UInt32(truncatingIfNeeded: scalar.value)
        }
        let h1 = Double(hash % 360)
        let h2 = (h1 + 55 + Double((hash >> 8) % 50)).truncatingRemainder(dividingBy: 360)
        return LinearGradient(
            colors: [
                Color(hue: h1 / 360, saturation: 0.42, brightness: 0.34),
                Color(hue: h2 / 360, saturation: 0.38, brightness: 0.20),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}
