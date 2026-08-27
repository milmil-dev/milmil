import Foundation
import MilmilAPI

/// What the browse screens hand to the player.
struct PlaybackRequest: Hashable, Sendable {
    let bangumiID: Int
    /// nil → resume candidate (in-progress, else first unwatched with a file).
    let episodeID: String?
    let title: String
    let coverImage: URL?
    /// 從頭播放: ignore the server's resume position for this open.
    let fromStart: Bool
    /// Open at this position (a shared `…&t=` link); wins over resume.
    let startSeconds: Double?

    init(bangumiID: Int, episodeID: String? = nil, title: String, coverImage: URL? = nil, fromStart: Bool = false, startSeconds: Double? = nil) {
        self.bangumiID = bangumiID
        self.episodeID = episodeID
        self.title = title
        self.coverImage = coverImage
        self.fromStart = fromStart
        self.startSeconds = startSeconds
    }
}

/// App-wide owner of the single `PlayerController` (one mpv instance).
///
/// Normal state is the in-app watch page (`Route.watch`), like the web.
/// "Pop out" moves the same render view into the dedicated `player`
/// window scene; closing that window hands it back.
@Observable
final class PlayerCoordinator {
    enum Presentation {
        case embedded
        case window
    }

    private(set) var controller: PlayerController?
    private(set) var presentation: Presentation = .embedded
    /// The `WatchView` currently on screen (per-view token, so a page that
    /// replaces another cannot be cleared by the old page's disappearance).
    var activeWatchToken: UUID?
    var watchVisible: Bool { activeWatchToken != nil }
    /// Set by the shell when a server session starts, cleared on logout.
    var session: ServerSession? {
        didSet { if session == nil { closePlayer() } }
    }

    var isPlayerOpen: Bool { controller != nil }

    /// Reuses the live controller when it exists; the caller then shows the
    /// watch page (`router.openWatch`) or the window.
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

    /// Same series already loaded? Then pushing the watch page must not restart it.
    func isPlaying(bangumiID: Int, episodeID: String?) -> Bool {
        guard let controller, controller.request?.bangumiID == bangumiID else { return false }
        if let episodeID { return controller.episode?.episodeID == episodeID }
        return true
    }

    func popOut() {
        presentation = .window
    }

    /// The dedicated window closed: re-embed if a watch page is showing,
    /// otherwise stop playback (keep mpv warm).
    func windowDidClose() {
        presentation = .embedded
        if !watchVisible { controller?.windowClosed() }
    }

    /// The watch page left the stack while embedded → stop, like the web.
    /// Covered by another route (作品頁 pushed on top) → keep playing.
    func watchDidAppear(token: UUID) {
        activeWatchToken = token
    }

    func watchDidDisappear(token: UUID, stillOnStack: Bool) {
        guard activeWatchToken == token else { return }
        activeWatchToken = nil
        if presentation == .embedded, !stillOnStack { controller?.windowClosed() }
    }

    func closePlayer() {
        controller?.shutdown()
        controller = nil
        presentation = .embedded
    }
}
