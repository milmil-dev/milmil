import SwiftUI

/// Liquid Glass, iOS 26. The macOS client needs availability shims in
/// `GlassStyles.swift` because it still supports macOS 15; iOS starts at 26,
/// so the real APIs are used directly.
extension View {
    /// Floating chrome — bar buttons, the player HUD, pairing cards.
    func glassSurface(in shape: some Shape, interactive: Bool = false) -> some View {
        glassEffect(interactive ? .regular.interactive() : .regular, in: shape)
    }

    /// A screen's one prominent action. Fills with ink, never the accent —
    /// Vesica Violet is for state and emphasis — and the label has to take the
    /// background colour or it is white on white, which is how the first cut
    /// of the detail page's play button shipped.
    func inkProminentButtonStyle() -> some View {
        buttonStyle(.glassProminent).tint(Theme.ink(0.92)).foregroundStyle(Theme.background)
    }
}

enum Theme {
    /// Vesica Violet, shared with the web app (`--mm-accent`) and macOS.
    static let accent = Color(red: 0.655, green: 0.545, blue: 0.980)
    static let background = Color(red: 0.027, green: 0.027, blue: 0.027)

    /// White in dark mode, near-black in light — the same ink token the web
    /// app and macOS client use. Prominent buttons fill with this, never the
    /// accent: Vesica Violet is for state and emphasis.
    static func ink(_ opacity: Double = 1) -> Color { .primary.opacity(opacity) }
}
