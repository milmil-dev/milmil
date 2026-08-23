import SwiftUI

/// Visual tokens from the design canvas (docs/plans/…-macos-client-design.md §7.5).
enum Theme {
    /// Apple TV app dark grey, not the web's pure black.
    static let background = Color(hex: 0x141416)
    static let surface = Color(hex: 0x1C1C1E)
    /// Vesica Violet — shared with the web app (`--mm-accent`).
    static let accent = Color(hex: 0xA78BFA)

    enum Text {
        static let primary = Color.white.opacity(0.92)
        static let secondary = Color.white.opacity(0.62)
        static let tertiary = Color.white.opacity(0.42)
        static let muted = Color.white.opacity(0.22)
    }

    /// Poster gradient fallback, ported from web/src/lib/gradient.ts so the
    /// same title gets the same colours on both clients.
    static func animeGradient(_ name: String) -> LinearGradient {
        var hash: UInt32 = 5381
        for scalar in name.unicodeScalars {
            hash = ((hash << 5) &+ hash) ^ UInt32(truncatingIfNeeded: scalar.value)
        }
        let h1 = Double(hash % 360)
        let h2 = (h1 + 55 + Double((hash >> 8) % 50)).truncatingRemainder(dividingBy: 360)
        let h3 = (h2 + 45 + Double((hash >> 16) % 40)).truncatingRemainder(dividingBy: 360)
        return LinearGradient(
            stops: [
                .init(color: Color(hue: h1 / 360, saturation: 0.75, brightness: 0.45), location: 0),
                .init(color: Color(hue: h2 / 360, saturation: 0.8, brightness: 0.32), location: 0.55),
                .init(color: Color(hue: h3 / 360, saturation: 0.6, brightness: 0.2), location: 1),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }
}
