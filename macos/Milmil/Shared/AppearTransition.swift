import SwiftUI

// Staged entrances. macOS has no `.zoom(sourceID:in:)` navigation transition
// — that one is iOS-only — so a pushed page arrives with the system's plain
// slide and its content simply pops in the moment the request returns. What
// closes that gap is the page assembling itself: the parts nearest the top
// settle first and the rest follow a beat behind, which reads as arriving
// rather than appearing.
//
// Keep the stagger short. Beyond ~5 steps the tail lands late enough to feel
// like lag rather than choreography, so later sections share the last step.

extension View {
    /// Fades and lifts this view into place once `active` turns true, delayed
    /// by its position in the sequence. Reduce Motion keeps the fade and drops
    /// the movement.
    func appearStep(_ index: Int, active: Bool = true) -> some View {
        modifier(AppearStep(index: index, active: active))
    }
}

private struct AppearStep: ViewModifier {
    let index: Int
    let active: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Steps past this share the last delay rather than stretching further.
    private static let maxStep = 4
    private static let stagger = 0.055

    func body(content: Content) -> some View {
        let delay = Double(min(index, Self.maxStep)) * Self.stagger
        return content
            .opacity(active ? 1 : 0)
            .offset(y: active || reduceMotion ? 0 : 10)
            .animation(
                reduceMotion
                    ? .easeOut(duration: 0.2).delay(delay)
                    : .smooth(duration: 0.42, extraBounce: 0.02).delay(delay),
                value: active
            )
    }
}
