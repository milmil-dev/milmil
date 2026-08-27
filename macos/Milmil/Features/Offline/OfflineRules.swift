import Foundation
import MilmilAPI

/// The smart rules over the offline store: keep the next N unwatched
/// episodes of every followed series, drop watched copies after a day, and
/// stay under the quota (oldest-watched first, pinned never). Runs on
/// activation, hourly, and when the server says a new episode is ready.
@MainActor
final class OfflineRules {
    private unowned let store: OfflineStore
    private var loop: Task<Void, Never>?
    private var pending: Task<Void, Never>?
    private(set) var running = false
    private(set) var lastRunAt: Date?

    init(store: OfflineStore) {
        self.store = store
    }

    func start() {
        guard loop == nil else { return }
        loop = Task { [weak self] in
            while !Task.isCancelled {
                await self?.run()
                try? await Task.sleep(for: .seconds(3600))
            }
        }
    }

    func stop() {
        loop?.cancel()
        loop = nil
        pending?.cancel()
        pending = nil
    }

    /// Debounced: several `anime.episode_ready` events in a row run once.
    func runSoon() {
        pending?.cancel()
        pending = Task { [weak self] in
            try? await Task.sleep(for: .seconds(5))
            guard !Task.isCancelled else { return }
            await self?.run()
        }
    }

    func run() async {
        guard !running, let client = store.currentClient() else { return }
        running = true
        defer { running = false; lastRunAt = Date() }
        let preferences = store.preferences
        var playableCache: [Int: PlayableEpisodesResponse] = [:]

        if preferences.autoKeep {
            let followed = await FollowedAiring.followedIDs(client: client)
            for bangumiID in followed {
                guard let playable = try? await client.playableEpisodes(bangumiID: bangumiID) else { continue }
                playableCache[bangumiID] = playable
                let wanted = Self.nextUnwatched(playable.episodes, count: preferences.autoKeepCount)
                let missing = wanted.filter { store.entry(fileID: $0.mediaFile?.id ?? "") == nil }
                guard !missing.isEmpty else { continue }
                let title = playable.episodes.first.flatMap { _ in
                    store.entries(bangumiID: bangumiID).first?.seriesTitle
                } ?? String(bangumiID)
                await store.keep(bangumiID: bangumiID, title: title, episodeIDs: Set(missing.map(\.episodeID)))
            }
        }

        if preferences.autoDeleteWatched {
            let cutoff = Date().addingTimeInterval(-OfflinePreferences.watchedGrace)
            for entry in store.entries where entry.state == .done && !entry.pinned {
                guard let played = entry.lastPlayedAt, played < cutoff else { continue }
                let playable: PlayableEpisodesResponse?
                if let cached = playableCache[entry.bangumiID] {
                    playable = cached
                } else {
                    playable = try? await client.playableEpisodes(bangumiID: entry.bangumiID)
                    playableCache[entry.bangumiID] = playable
                }
                let completed = playable?.episodes.first { $0.episodeID == entry.episodeID }?.progress?.completed ?? false
                if completed { store.remove(fileID: entry.fileID) }
            }
        }

        enforceQuota()
    }

    /// Drop finished, unpinned copies — watched ones first, then the oldest —
    /// until the store fits the quota.
    func enforceQuota() {
        let quota = store.preferences.quotaBytes
        guard store.usedBytes > quota else { return }
        let candidates = store.entries
            .filter { $0.state == .done && !$0.pinned }
            .sorted { lhs, rhs in
                let lhsPlayed = lhs.lastPlayedAt != nil, rhsPlayed = rhs.lastPlayedAt != nil
                if lhsPlayed != rhsPlayed { return lhsPlayed }
                return (lhs.lastPlayedAt ?? lhs.downloadedAt ?? .distantPast) < (rhs.lastPlayedAt ?? rhs.downloadedAt ?? .distantPast)
            }
        for entry in candidates {
            guard store.usedBytes > quota else { break }
            store.remove(fileID: entry.fileID)
        }
    }

    /// The first `count` episodes with a file that are not finished, in order.
    nonisolated static func nextUnwatched(_ episodes: [PlayableEpisode], count: Int) -> [PlayableEpisode] {
        Array(
            episodes
                .filter { $0.hasFile && !($0.progress?.completed ?? false) }
                .sorted { $0.sort < $1.sort }
                .prefix(max(0, count))
        )
    }
}
