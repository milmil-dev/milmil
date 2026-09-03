import AppKit
import Foundation
import MilmilAPI
import Observation
import OSLog
import SwiftUI

/// Pushable screens. The sidebar picks a root (`Destination`); everything
/// else is a route on that tab's `NavigationStack`.
enum Route: Hashable {
    case anime(bangumiID: Int)
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

/// Filters Search applies on arrival. Home's chips and rail "view all",
/// the detail pages' genre/tag chips and the palette all land here —
/// mirroring web, where each of those is a `/search` link with URL params.
struct SearchPrefill: Hashable {
    var query = ""
    /// AniList genre ids; strings so genres outside `Genre` (Historical…) work.
    var genres: Set<String> = []
    var tags: [String] = []
    var year: Int?
    var season: Season?
    var status: AiringStatus?
    var sort: BrowseQuery.Sort = .popularity
}

extension SearchPrefill {
    /// A Home catalog rail or chip expressed as Search filters. `format` (劇場版)
    /// has no Search filter, so that rail keeps only its sort — the same
    /// lossy mapping web's "view all" links use.
    init(route: BrowseRoute) {
        self.init()
        switch route {
        case .trending:
            sort = .trending
        case let .genre(genre):
            genres = [genre]
        case let .tag(tag):
            tags = [tag]
        case let .query(query):
            genres = Set((query.genre ?? "").split(separator: ",").map(String.init))
            sort = query.sort
            year = query.year
            season = query.season.flatMap(Season.init(rawValue:))
            status = query.status.flatMap(AiringStatus.init(rawValue:))
        }
    }
}

@Observable
final class Router {
    var destination: Destination = .home
    var path: [Route] = []
    var paletteShown = false
    /// Player fullscreen inside the main window: hide sidebar + toolbar.
    var immersive = false
    /// User-collapsed sidebar (the toolbar toggle / ⌃⌘S). Independent of
    /// `immersive`, which overrides it without clearing it.
    var sidebarCollapsed = false

    func push(_ route: Route) {
        // Deliberately unanimated: a pushed page arrives with its own staged
        // entrance (`appearStep`), and animating the stack as well makes the
        // incoming page's backdrop stretch while the container resizes.
        path.append(route)
    }

    /// macOS's NavigationStack does not animate a programmatic `path` change
    /// on its own, so going back used to swap the whole page in a single
    /// frame — no transition at all, then the banner catching up a beat
    /// later. `withAnimation` gives the pop the system's cross-slide, and the
    /// page beneath is already laid out, so nothing stretches on the way in.
    @discardableResult
    func pop() -> Route? {
        let animation: Animation? = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
            ? nil
            : .smooth(duration: 0.32)
        return withAnimation(animation) { path.popLast() }
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

    /// Set by `openSearch`; the Search page consumes it on arrival.
    var pendingSearch: SearchPrefill?

    /// Land on Search with these filters applied.
    func openSearch(_ prefill: SearchPrefill) {
        pendingSearch = prefill
        select(.search)
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

    /// `milmil://anime/<bangumiID>`, `milmil://watch/<bangumiID>?ep=<episodeID>&t=<seconds>`,
    /// `milmil://<tab>` (home, schedule, search, collection, history,
    /// libraries, downloads, notifications; `discover` aliases to home).
    /// Returns false when unrecognised.
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
            let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
            let episode = items.first { $0.name == "ep" }?.value
            let seconds = items.first { $0.name == "t" }?.value.flatMap(Double.init)
            select(.home)
            pendingPlayback = PlaybackRequest(bangumiID: id, episodeID: episode, title: "", startSeconds: seconds)
            openWatch(bangumiID: id, episodeID: episode)
        case "discover":
            // Discover merged into Home — keep deep links working.
            select(.home)
        default:
            guard let destination = Destination(rawValue: host) else { return false }
            select(destination)
        }
        return true
    }

    /// Set by `handle(url:)` for `watch` links; the shell consumes it.
    var pendingPlayback: PlaybackRequest?

    /// 檔案 ›「新增下載…」: Downloads opens its add sheet on arrival.
    var addDownloadRequested = false

    func requestAddDownload() {
        select(.downloads)
        addDownloadRequested = true
    }

    /// "找種子" from an anime page: Downloads opens its finder on this title.
    var torrentAnime: AnimeSummary?

    func findTorrents(for anime: AnimeSummary) {
        torrentAnime = anime
        select(.downloads)
    }
}
