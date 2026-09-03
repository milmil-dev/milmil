import Foundation
import MilmilAPI
import Observation

/// Home page data: personal rails + the catalog formerly on Discover.
@Observable
final class HomeStore {
    struct Rail: Identifiable {
        let id: String
        let title: String
        let route: BrowseRoute
        var items: Loadable<[AnimeSummary]> = .idle
    }

    private(set) var continueWatching: Loadable<[ProgressEntry]> = .idle
    private(set) var today: Loadable<CalendarDay?> = .idle
    private(set) var rails: [Rail]
    private(set) var tags: Loadable<[HotTag]> = .idle
    private(set) var memoryItems: Loadable<[AnimeSummary]> = .idle

    private let client: APIClient

    /// Web's genre-spotlight pool (mirrors `SPOTLIGHT_GENRES` on Home).
    private static let spotlightPool = Genre.allCases.filter { ![.mecha, .mahouShoujo, .ecchi].contains($0) }

    init(client: APIClient) {
        self.client = client
        let now = Season.current()
        let prev = now.season.previous
        let spotlight = Self.spotlightPool.randomElement() ?? .fantasy
        rails = [
            Rail(id: "trending", title: String(localized: "現在熱門"), route: .trending),
            Rail(id: "season", title: String(localized: "本季最佳"), route: .query(BrowseQuery(sort: .score, year: now.year, season: now.season.rawValue))),
            Rail(
                id: "lastSeason", title: String(localized: "上季最佳"),
                route: .query(BrowseQuery(sort: .score, year: now.year + prev.delta, season: prev.season.rawValue))
            ),
            Rail(id: "recent", title: String(localized: "近期開播"), route: .query(BrowseQuery(sort: .date, year: now.year))),
            Rail(id: "movies", title: String(localized: "熱門劇場版"), route: .query(BrowseQuery(sort: .trending, format: "MOVIE"))),
            Rail(
                id: "spotlight", title: String(localized: "類型精選・\(spotlight.label)"),
                route: .query(BrowseQuery(genre: spotlight.rawValue, sort: .score))
            ),
            Rail(id: "upcoming", title: String(localized: "即將播出"), route: .query(BrowseQuery(sort: .popularity, status: AiringStatus.notYetReleased.rawValue))),
        ]
    }

    var heroItems: [AnimeSummary] {
        Array(rails.first(where: { $0.id == "trending" })?.items.value?.prefix(7) ?? [])
    }

    var trending: Loadable<[AnimeSummary]> {
        rails.first(where: { $0.id == "trending" })?.items ?? .idle
    }

    func load() async {
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await self.loadContinueWatching() }
            group.addTask { await self.loadToday() }
            group.addTask { await self.loadTags() }
            for index in rails.indices {
                group.addTask { await self.loadRail(index) }
            }
        }
    }

    func loadContinueWatching() async {
        continueWatching = continueWatching.reloading
        continueWatching = await continueWatching.reloaded {
            try await client.recentProgress().filter { !$0.completed }
        }
    }

    func loadToday() async {
        today = today.reloading
        today = await today.reloaded {
            let days = try await client.calendar()
            let key = Formatters.todayWeekdayJST
            return days.first { $0.weekdayEN == key }
        }
    }

    func loadTrending() async {
        guard let index = rails.firstIndex(where: { $0.id == "trending" }) else { return }
        await loadRail(index)
    }

    func loadMemories(offset: Int) async {
        let target = Season.yearsAgo(offset)
        memoryItems = .loading
        do {
            memoryItems = .loaded(
                try await client.browse(BrowseQuery(sort: .popularity, year: target.year, season: target.season.rawValue))
            )
        } catch is CancellationError {
            // `.task(id:)` cancelled this fetch in favour of another era.
        } catch {
            if Task.isCancelled { return }
            memoryItems = .failed(error.localizedDescription)
        }
    }

    private func loadRail(_ index: Int) async {
        let route = rails[index].route
        rails[index].items = rails[index].items.reloading
        rails[index].items = await rails[index].items.reloaded { try await client.browse(route: route, page: 1) }
    }

    private func loadTags() async {
        tags = tags.reloading
        tags = await tags.reloaded { try await client.hotTags() }
    }

    func remove(_ entry: ProgressEntry) async {
        if case let .loaded(list) = continueWatching {
            continueWatching = .loaded(list.filter { $0.id != entry.id })
        }
        try? await client.deleteProgress(id: entry.id)
    }

    func markWatched(_ entry: ProgressEntry) async {
        if case let .loaded(list) = continueWatching {
            continueWatching = .loaded(list.filter { $0.id != entry.id })
        }
        guard let mediaFileID = entry.mediaFileID, let duration = entry.durationSeconds else { return }
        let done = ProgressSave(mediaFileID: mediaFileID, episodeID: entry.episodeID, positionSeconds: duration, durationSeconds: duration, completed: true)
        try? await client.saveProgress(done)
    }
}

extension APIClient {
    func browse(route: BrowseRoute, page: Int) async throws -> [AnimeSummary] {
        switch route {
        case .trending: try await trending(page: page)
        case let .genre(genre): try await browse(BrowseQuery(genre: genre, page: page))
        case let .tag(tag): try await browse(tag: tag, page: page)
        case let .query(query):
            try await browse({
                var q = query
                q.page = page
                return q
            }())
        }
    }
}
