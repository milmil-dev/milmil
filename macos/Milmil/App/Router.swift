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
}
