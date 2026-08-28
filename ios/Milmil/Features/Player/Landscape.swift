import SwiftUI
import UIKit

/// Turns the screen over to the video for as long as this is applied.
///
/// A phone held upright gives a 16:9 episode barely a third of the display —
/// the first simulator run showed the picture as a band across the middle with
/// black above and below. The rest of the app stays portrait.
enum Orientation {
    /// Called from `.task` and from the close action rather than from
    /// `onAppear`/`onDisappear`: SwiftUI runs those on the modifier during the
    /// cover's own transition, and the two requests raced — the log showed the
    /// scene going landscape and straight back before the video appeared.
    static func request(_ orientations: UIInterfaceOrientationMask) {
        guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first
        else { return }
        scene.requestGeometryUpdate(.iOS(interfaceOrientations: orientations))
        // Without this the bar stays in its old orientation until something
        // else forces a layout pass.
        scene.keyWindow?.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
    }
}
