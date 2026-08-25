import Foundation
import MilmilAPI
import Observation
import OSLog

/// Pushable screens. The sidebar picks a root (`Destination`); everything
/// else is a route on that tab's `NavigationStack`.
enum Route: Hashable {
    case anime(bangumiID: Int)
    case discoverCategory(title: String, query: BrowseRoute)
    case history
    /// In-app watch page; `episodeID == nil` resumes the series.
    case watch(bangumiID: Int, episodeID: String?)
}

enum BrowseRoute: Hashable {
    case genre(String)
    case tag(String)
    case trending
    case query(BrowseQuery)
}

@Observable
final class Router {
    var destination: Destination = .home
    var path: [Route] = []
    var paletteShown = false
    /// Player fullscreen inside the main window: hide sidebar + toolbar.
    var immersive = false

    func push(_ route: Route) {
        path.append(route)
    }

    func openAnime(_ bangumiID: Int) {
        guard bangumiID > 0 else { return }
        push(.anime(bangumiID: bangumiID))
    }

    /// AniList-only entries (`bangumiID == 0`) have no detail route — no
    /// Bangumi episodes, comments or collection state — so they open the
    /// shell's preview sheet instead of silently doing nothing.
    var previewAnime: AnimeSummary?

    func open(_ anime: AnimeSummary) {
        if anime.bangumiID > 0 {
            openAnime(anime.bangumiID)
        } else {
            previewAnime = anime
        }
    }

    /// Replace an existing watch route instead of stacking them.
    func openWatch(bangumiID: Int, episodeID: String?) {
        guard bangumiID > 0 else { return }
        if case .watch = path.last { path.removeLast() }
        push(.watch(bangumiID: bangumiID, episodeID: episodeID))
    }

    private static let log = Logger(subsystem: "dev.milmil.macos", category: "router")

    func select(_ destination: Destination) {
        Self.log.notice("select \(destination.rawValue, privacy: .public) (was \(self.destination.rawValue, privacy: .public))")
        self.destination = destination
        path.removeAll()
    }

    func popToRoot() {
        path.removeAll()
    }

    /// `milmil://anime/<bangumiID>`, `milmil://watch/<bangumiID>?ep=<episodeID>`,
    /// `milmil://<tab>` (home, schedule, discover, search, collection, history,
    /// libraries, downloads, notifications). Returns false when unrecognised.
    @discardableResult
    func handle(url: URL) -> Bool {
        guard url.scheme == "milmil" else { return false }
        let host = url.host() ?? ""
        let parts = url.pathComponents.filter { $0 != "/" }
        switch host {
        case "anime":
            guard let id = parts.first.flatMap(Int.init) else { return false }
            select(.home)
            openAnime(id)
        case "watch":
            guard let id = parts.first.flatMap(Int.init) else { return false }
            let episode = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "ep" }?.value
            select(.home)
            pendingPlayback = PlaybackRequest(bangumiID: id, episodeID: episode, title: "")
            openWatch(bangumiID: id, episodeID: episode)
        default:
            guard let destination = Destination(rawValue: host) else { return false }
            select(destination)
        }
        return true
    }

    /// Set by `handle(url:)` for `watch` links; the shell consumes it.
    var pendingPlayback: PlaybackRequest?

    /// "找種子" from an anime page: Downloads opens its finder on this title.
    var torrentAnime: AnimeSummary?

    func findTorrents(for anime: AnimeSummary) {
        torrentAnime = anime
        select(.downloads)
    }
}
