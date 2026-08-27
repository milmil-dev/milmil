import SwiftUI

// Liquid Glass adapters. The app still targets macOS 15, so call sites use
// these instead of the raw macOS 26 APIs: glass on 26+, the closest classic
// treatment below.
extension View {
    /// `.buttonStyle(.glass)` on macOS 26+, `.bordered` before.
    @ViewBuilder
    func glassButtonStyle() -> some View {
        if #available(macOS 26.0, *) {
            buttonStyle(.glass)
        } else {
            buttonStyle(.bordered)
        }
    }

    /// `.buttonStyle(.glassProminent)` on macOS 26+, `.borderedProminent` before.
    /// Filled with ink (white in dark mode, near-black in light) and inverted
    /// text — the hero's "primary" look — never the accent: Vesica Violet is
    /// for state and emphasis, not for button backgrounds.
    @ViewBuilder
    func glassProminentButtonStyle() -> some View {
        if #available(macOS 26.0, *) {
            buttonStyle(.glassProminent).tint(Theme.ink(0.92)).foregroundStyle(Theme.background)
        } else {
            buttonStyle(.borderedProminent).tint(Theme.ink(0.92)).foregroundStyle(Theme.background)
        }
    }

    /// Liquid Glass surface for floating chrome (player HUD, hero buttons,
    /// overlays); ultra-thin material before macOS 26.
    @ViewBuilder
    func glassSurface(in shape: some Shape, interactive: Bool = false) -> some View {
        if #available(macOS 26.0, *) {
            glassEffect(interactive ? .regular.interactive() : .regular, in: shape)
        } else {
            background(.ultraThinMaterial, in: shape)
        }
    }

    /// Opaque top scroll edge instead of macOS 26's adaptive glass gradient,
    /// which shifts color with whatever content scrolls beneath it.
    @ViewBuilder
    func hardTopScrollEdge() -> some View {
        if #available(macOS 26.0, *) {
            scrollEdgeEffectStyle(.hard, for: .top)
        } else {
            self
        }
    }
}
