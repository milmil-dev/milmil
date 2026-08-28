import SwiftUI

/// Liquid Glass, iOS 26. The macOS client needs availability shims in
/// `GlassStyles.swift` because it still supports macOS 15; iOS starts at 26,
/// so the real APIs are used directly.
extension View {
    /// Floating chrome — the tab bar, the player HUD, pairing cards.
    func glassSurface(in shape: some Shape, interactive: Bool = false) -> some View {
        glassEffect(interactive ? .regular.interactive() : .regular, in: shape)
    }

    /// A screen's one prominent action. Fills with ink, never the accent —
    /// Vesica Violet is for state and emphasis — and the label has to take the
    /// background colour or it is white on white.
    func inkProminentButtonStyle() -> some View {
        buttonStyle(.glassProminent).tint(Theme.ink(0.92)).foregroundStyle(Theme.background)
    }
}
