import Foundation
import MilmilAPI
import Observation

/// Home page data: hero + trending (one call), continue watching, today.
@Observable
final class HomeStore {
    private(set) var trending: Loadable<[AnimeSummary]> = .idle
    private(set) var continueWatching: Loadable<[ProgressEntry]> = .idle
    private(set) var today: Loadable<CalendarDay?> = .idle

    private let client: APIClient

    init(client: APIClient) {
        self.client = client
    }

    var heroItems: [AnimeSummary] { Array((trending.value ?? []).prefix(7)) }

    func load() async {
        async let trendingTask: Void = loadTrending()
        async let continueTask: Void = loadContinueWatching()
        async let todayTask: Void = loadToday()
        _ = await (trendingTask, continueTask, todayTask)
    }

    func loadTrending() async {
        trending = trending.reloading
        trending = await trending.reloaded { try await client.trending(page: 1) }
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
