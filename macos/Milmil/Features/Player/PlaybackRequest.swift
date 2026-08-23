import Foundation
import MilmilAPI

/// What the browse screens hand to the player window.
struct PlaybackRequest: Hashable, Sendable {
    let bangumiID: Int
    /// nil → resume candidate (in-progress, else first unwatched with a file).
    let episodeID: String?
    let title: String
    let coverImage: URL?

    init(bangumiID: Int, episodeID: String? = nil, title: String, coverImage: URL? = nil) {
        self.bangumiID = bangumiID
        self.episodeID = episodeID
        self.title = title
        self.coverImage = coverImage
    }
}

/// App-wide owner of the single player window's controller. The window
/// scene reads `controller`; browse screens call `play`.
@Observable
final class PlayerCoordinator {
    private(set) var controller: PlayerController?
    /// Set by the shell when a server session starts, cleared on logout.
    var session: ServerSession? {
        didSet { if session == nil { closePlayer() } }
    }

    var isPlayerOpen: Bool { controller != nil }

    /// Reuses the live controller (one mpv instance) when the window is
    /// already open; the caller then opens/raises the `player` window.
    func play(_ request: PlaybackRequest) {
        guard let session else { return }
        if let controller {
            controller.play(request)
        } else {
            let controller = PlayerController(session: session)
            self.controller = controller
            controller.play(request)
        }
    }

    func closePlayer() {
        controller?.shutdown()
        controller = nil
    }
}
