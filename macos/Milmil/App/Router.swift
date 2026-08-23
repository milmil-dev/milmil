import Foundation
import Observation
import OSLog

/// Pushable screens. The sidebar picks a root (`Destination`); everything
/// else is a route on that tab's `NavigationStack`.
enum Route: Hashable {
    case anime(bangumiID: Int)
    case discoverCategory(title: String, query: BrowseRoute)
    case history
}

enum BrowseRoute: Hashable {
    case genre(String)
    case tag(String)
    case trending
}

@Observable
final class Router {
    var destination: Destination = .home
    var path: [Route] = []
    var paletteShown = false

    func push(_ route: Route) {
        path.append(route)
    }

    func openAnime(_ bangumiID: Int) {
        guard bangumiID > 0 else { return }
        push(.anime(bangumiID: bangumiID))
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
