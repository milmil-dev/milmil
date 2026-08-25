import AppKit
import SwiftUI

/// Visual tokens from the design canvas (docs/plans/…-macos-client-design.md §7.5),
/// now adaptive: each token resolves per the window's effective appearance, so the
/// same views render both the original dark palette and its light counterpart.
enum Theme {
    /// Apple TV app dark grey, not the web's pure black; near-white in light mode.
    static let background = Color(light: 0xF6F6F8, dark: 0x141416)
    static let surface = Color(light: 0xFFFFFF, dark: 0x1C1C1E)
    /// Vesica Violet — shared with the web app (`--mm-accent`); the light variant
    /// is its darker companion for contrast on light surfaces.
    static let accent = Color(light: 0x7857E6, dark: 0xA78BFA)

    enum Text {
        static let primary = Theme.ink(0.92)
        static let secondary = Theme.ink(0.62)
        static let tertiary = Theme.ink(0.42)
        static let muted = Theme.ink(0.22)
    }

    /// White in dark mode, near-black ink in light mode — the counterpart of
    /// the web's `text-ink/xx` scale. Use for text, hairlines and subtle
    /// surface tints that must flip with the theme; keep literal white/black
    /// for anything drawn over artwork or video.
    static func ink(_ opacity: Double = 1) -> Color {
        Color(
            light: NSColor(red: 16 / 255, green: 16 / 255, blue: 22 / 255, alpha: opacity),
            dark: NSColor(white: 1, alpha: opacity)
        )
    }

    /// User-facing theme choice, persisted like the web's `milmil-theme` and
    /// mirrored to the server's `appearance.theme` (`dark` | `light` | `system`).
    enum Preference: String, CaseIterable, Identifiable {
        case dark
        case light
        case system

        var id: String { rawValue }

        var label: String {
            switch self {
            case .dark: String(localized: "深色")
            case .light: String(localized: "淺色")
            case .system: String(localized: "跟隨系統")
            }
        }

        /// nil follows the system appearance.
        var colorScheme: ColorScheme? {
            switch self {
            case .dark: .dark
            case .light: .light
            case .system: nil
            }
        }
    }

    /// Poster gradient fallback, ported from web/src/lib/gradient.ts so the
    /// same title gets the same colours on both clients. Stays dark in both
    /// themes — it stands in for artwork, not for a surface.
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

    /// Appearance-adaptive color: resolves `light`/`dark` per the effective
    /// appearance at draw time, so preferredColorScheme flips it live.
    init(light: NSColor, dark: NSColor) {
        self.init(nsColor: NSColor(name: nil) { appearance in
            appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua ? dark : light
        })
    }

    init(light: UInt32, dark: UInt32, opacity: Double = 1) {
        self.init(light: NSColor(hex: light, alpha: opacity), dark: NSColor(hex: dark, alpha: opacity))
    }
}

extension NSColor {
    convenience init(hex: UInt32, alpha: Double = 1) {
        self.init(
            srgbRed: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            alpha: alpha
        )
    }
}
