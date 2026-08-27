import Foundation
import MilmilAPI
import Observation

/// Series screen data: public metadata (`/discover/anime/{id}`) plus the
/// library-backed episode list when the series is known locally.
@Observable
final class AnimeDetailStore {
    let bangumiID: Int
    private(set) var detail: Loadable<AnimeDetail> = .idle
    private(set) var playable: Loadable<PlayableEpisodesResponse?> = .idle
    /// Bangumi's episode list, used when the series is not in the library.
    private(set) var discoverEpisodes: [DiscoverEpisode] = []
    private(set) var discoverLoading = false
    private(set) var comments: [BangumiComment] = []
    private(set) var watchStatus: WatchStatus = .none
    private(set) var userScore: Int?
    private(set) var actionError: String?
    /// Seasons and side stories from AniList's relation graph.
    private(set) var franchise: FranchiseResult?
    /// An enabled download rule targets this series.
    private(set) var hasSubscription = false
    /// Missing / not-yet-aired episodes; nil when the series is complete or unknown.
    private(set) var completeness: CompletenessReport?
    private(set) var duplicates: [DupSet] = []
    private(set) var syncDisabled = false
    /// Transient confirmation after 自動下載缺集.
    private(set) var autoRuleNotice: String?

    private let client: APIClient
    /// Per-server namespace for the disk cache; nil disables it.
    private let cacheScope: String?
    private let cache = PageCache.shared

    init(bangumiID: Int, client: APIClient, cacheScope: String? = nil) {
        self.bangumiID = bangumiID
        self.client = client
        self.cacheScope = cacheScope
    }

    var episodes: [PlayableEpisode] { playable.value??.episodes ?? [] }
    /// Bangumi's rows by episode number, to fill the stills and synopses the
    /// local DB usually lacks (the player inspector merges them the same way).
    var discoverBySort: [Double: DiscoverEpisode] {
        Dictionary(discoverEpisodes.map { ($0.sort, $0) }, uniquingKeysWith: { first, _ in first })
    }
    var isInLibrary: Bool { episodes.contains(where: \.hasFile) }

    /// The most useful primary action, mirroring the web's resume logic.
    enum PrimaryAction {
        case resume(PlayableEpisode, remaining: Int)
        case start(PlayableEpisode)
        case rewatch(PlayableEpisode)
        case none

        var title: String {
            switch self {
            case let .resume(episode, remaining): String(localized: "繼續 EP\(episode.number) · \(Formatters.remaining(remaining))")
            case let .start(episode): String(localized: "播放 EP\(episode.number)")
            case .rewatch: String(localized: "已看完 · 重看")
            case .none: String(localized: "沒有可播放的檔案")
            }
        }

        var episode: PlayableEpisode? {
            switch self {
            case let .resume(episode, _), let .start(episode), let .rewatch(episode): episode
            case .none: nil
            }
        }
    }

    var primaryAction: PrimaryAction {
        guard let response = playable.value ?? nil, let candidate = response.resumeCandidate else { return .none }
        if let progress = candidate.progress, progress.positionSeconds > 0, !progress.completed {
            return .resume(candidate, remaining: progress.remainingSeconds)
        }
        let playableEpisodes = response.episodes.filter(\.hasFile)
        if !playableEpisodes.isEmpty, playableEpisodes.allSatisfy({ $0.progress?.completed ?? false }) {
            return .rewatch(playableEpisodes[0])
        }
        return .start(candidate)
    }

    /// "1080p · HEVC · 多音軌" from the files on disk.
    var capabilityBadges: [String] {
        let files = episodes.compactMap(\.mediaFile)
        guard !files.isEmpty else { return [] }
        var badges: [String] = []
        if let best = files.compactMap(\.height).max(), let label = PlayableMediaFile.resolutionLabel(forHeight: best) { badges.append(label) }
        let codecs = Set(files.compactMap { $0.videoCodec?.uppercased() })
        if codecs.contains("HEVC") || codecs.contains("H265") { badges.append("HEVC") }
        badges.append(String(localized: "\(files.count) 集有檔案"))
        return badges
    }

    /// Paints whatever the disk cache has, then refreshes every section at
    /// once — the Bangumi episode list used to wait for the three calls
    /// before it, which is where most of the page's wait came from.
    func load() async {
        await restoreCached()
        async let detailTask: Void = loadDetail()
        async let playableTask: Void = loadPlayable()
        async let discoverTask: Void = loadDiscoverEpisodes()
        async let franchiseTask = try? client.franchise(bangumiID: bangumiID)
        async let rulesTask = try? client.downloadRules()
        async let commentsTask = try? client.bangumiComments(bangumiID: bangumiID)
        async let maintenanceTask: Void = loadMaintenance()
        _ = await (detailTask, playableTask, discoverTask, maintenanceTask)
        franchise = await franchiseTask
        hasSubscription = await rulesTask?.contains { $0.bangumiID == bangumiID && $0.enabled } ?? false
        comments = await commentsTask ?? []
    }

    // MARK: Disk cache

    private enum CacheKey: String { case detail, playable, discover }

    private func cacheKey(_ key: CacheKey) -> String { "anime-\(bangumiID)-\(key.rawValue)" }

    private func cached(_ key: CacheKey) async -> Data? {
        guard let cacheScope else { return nil }
        return await cache.read(cacheKey(key), scope: cacheScope)
    }

    private func store(_ data: Data?, for key: CacheKey) async {
        guard let cacheScope else { return }
        if let data {
            await cache.write(data, key: cacheKey(key), scope: cacheScope)
        } else {
            await cache.remove(cacheKey(key), scope: cacheScope)
        }
    }

    private func restoreCached() async {
        if detail.value == nil, let data = await cached(.detail), let value = try? await client.decode(AnimeDetail.self, from: data) {
            detail = .loaded(value)
        }
        if playable.value == nil, let data = await cached(.playable),
           let value = try? await client.decode(PlayableEpisodesResponse.self, from: data) {
            playable = .loaded(value)
            adopt(value)
        }
        if discoverEpisodes.isEmpty, let data = await cached(.discover), let value = try? await client.decode([DiscoverEpisode].self, from: data) {
            discoverEpisodes = value
        }
    }

    private func adopt(_ response: PlayableEpisodesResponse) {
        watchStatus = response.watchStatus
        userScore = response.userScore
        syncDisabled = response.syncDisabled
    }

    /// A failed refresh keeps a value that is already on screen (cached or
    /// from the last load) instead of replacing it with an error.
    private func keepingValue<T>(_ current: Loadable<T>, _ next: Loadable<T>) -> Loadable<T> {
        if case .failed = next, current.value != nil { return current }
        return next
    }

    func loadDiscoverEpisodes() async {
        discoverLoading = true
        defer { discoverLoading = false }
        guard let snapshot = try? await client.discoverEpisodesSnapshot(bangumiID: bangumiID) else { return }
        discoverEpisodes = snapshot.value
        await store(snapshot.data, for: .discover)
    }

    /// Missing-episode and duplicate-file reports; both 404 for series
    /// outside the library, which simply hides the cards.
    func loadMaintenance() async {
        async let missingTask = try? client.animeMissing(bangumiID: bangumiID)
        async let duplicatesTask = try? client.animeDuplicates(bangumiID: bangumiID)
        let report = await missingTask
        completeness = (report?.unknownTotal ?? true) ? nil : report
        duplicates = await duplicatesTask ?? []
    }

    func loadDetail() async {
        detail = detail.reloading
        let next = await detail.reloaded {
            let snapshot = try await client.animeDetailSnapshot(bangumiID: bangumiID)
            await store(snapshot.data, for: .detail)
            return snapshot.value
        }
        detail = keepingValue(detail, next)
    }

    func loadPlayable() async {
        playable = playable.reloading
        let next = await playable.reloaded {
            do {
                let snapshot = try await client.playableEpisodesSnapshot(bangumiID: bangumiID)
                adopt(snapshot.value)
                await store(snapshot.data, for: .playable)
                return snapshot.value
            } catch APIError.http(status: 404, _) {
                await store(nil, for: .playable)
                return nil // not in the library yet
            }
        }
        playable = keepingValue(playable, next)
    }

    func refreshMetadata() async {
        detail = detail.reloading
        detail = await detail.reloaded { try await client.animeDetail(bangumiID: bangumiID, refresh: true) }
    }

    func setWatchStatus(_ status: WatchStatus) async {
        let previous = watchStatus
        watchStatus = status
        do {
            try await client.setWatchStatus(bangumiID: bangumiID, status)
        } catch {
            watchStatus = previous
            actionError = error.localizedDescription
        }
    }

    func setScore(_ score: Int?) async {
        let previous = userScore
        userScore = score
        do {
            try await client.setScore(bangumiID: bangumiID, score)
        } catch {
            userScore = previous
            actionError = error.localizedDescription
        }
    }

    func markEpisode(_ episode: PlayableEpisode, watched: Bool) async {
        guard let file = episode.mediaFile else { return }
        let duration = episode.progress?.durationSeconds ?? 0
        let save = ProgressSave(
            mediaFileID: file.id,
            episodeID: episode.episodeID,
            positionSeconds: watched ? duration : 0,
            durationSeconds: duration,
            completed: watched
        )
        try? await client.saveProgress(save)
        await loadPlayable()
    }

    func toggleSyncDisabled() async {
        let previous = syncDisabled
        syncDisabled.toggle()
        do {
            try await client.setSyncFlags(bangumiID: bangumiID, SyncFlagsUpdate(syncDisabled: syncDisabled))
        } catch {
            syncDisabled = previous
            actionError = error.localizedDescription
        }
    }

    func createAutoRuleForMissing() async {
        guard let missing = completeness?.missing, !missing.isEmpty else { return }
        do {
            let result = try await client.createMissingAutoRule(bangumiID: bangumiID, episodeNumbers: missing)
            autoRuleNotice = result.action == "merged"
                ? String(localized: "已併入現有規則（\(result.episodeRange)）")
                : String(localized: "已建立自動下載規則（\(result.episodeRange)）")
            hasSubscription = true
        } catch {
            actionError = error.localizedDescription
        }
    }

    func setPreferredFile(episodeID: String, mediaFileID: String) async {
        do {
            try await client.setPreferredMediaFile(episodeID: episodeID, mediaFileID: mediaFileID)
            await loadMaintenance()
        } catch {
            actionError = error.localizedDescription
        }
    }

    func deleteDuplicateFile(id: String) async {
        do {
            try await client.deleteMediaFile(id: id)
            await loadMaintenance()
            await loadPlayable()
        } catch {
            actionError = error.localizedDescription
        }
    }

    /// A recommendation card may be AniList-only; ask the server for its
    /// Bangumi id before navigating. Nil when there is no match yet.
    func resolveBangumiID(for summary: AnimeSummary) async -> Int? {
        if summary.bangumiID > 0 { return summary.bangumiID }
        guard let anilistID = summary.anilistID, anilistID > 0 else { return nil }
        return try? await client.resolveAnilist(anilistID: anilistID)
    }

    struct SeasonTab: Identifiable, Hashable {
        let label: String
        let title: String
        let bangumiID: Int
        let isCurrent: Bool
        var id: String { "\(label)-\(bangumiID)" }
    }

    /// One S-number pill: a single entry, or the cours of a split season.
    struct SeasonGroup: Identifiable, Hashable {
        let season: Int
        let parts: [SeasonTab]
        var id: Int { season }
        var isCurrent: Bool { parts.contains { $0.isCurrent } }
    }

    /// S1/S2/… pills — franchise-powered like the web, falling back to the
    /// PREQUEL/SEQUEL chain in `relations`. The API stamps each main-series
    /// entry with `season`, folding split cours (無職転生 第2クール, 死滅回游
    /// 後編) into the entry before them, so consecutive entries with the same
    /// number become one group with a part tab per cour.
    var seasonGroups: [SeasonGroup] {
        if let seasons = franchise?.mainSeries, seasons.count > 1 {
            let anilistID = detail.value?.summary.anilistID
            let hasSeasons = seasons.contains { $0.season > 0 }
            var groups: [SeasonGroup] = []
            for (index, season) in seasons.enumerated() {
                let number = hasSeasons ? (season.season > 0 ? season.season : (groups.last?.season ?? 0) + 1) : index + 1
                let tab = SeasonTab(
                    label: season.part > 0 ? "\(season.part)" : "S\(number)",
                    title: season.title,
                    bangumiID: season.bangumiID,
                    isCurrent: season.bangumiID == bangumiID || (anilistID != nil && season.anilistID == anilistID)
                )
                if let last = groups.last, last.season == number {
                    groups[groups.count - 1] = SeasonGroup(season: number, parts: last.parts + [tab])
                } else {
                    groups.append(SeasonGroup(season: number, parts: [tab]))
                }
            }
            return groups
        }
        return relationSeasonChain.enumerated().map { SeasonGroup(season: $0 + 1, parts: [$1]) }
    }

    /// Bangumi-relations fallback when AniList has no franchise graph.
    private var relationSeasonChain: [SeasonTab] {
        guard let detail = detail.value else { return [] }
        let prequels = detail.relations.filter { $0.relationType.uppercased() == "PREQUEL" }
        let sequels = detail.relations.filter { $0.relationType.uppercased() == "SEQUEL" }
        guard !prequels.isEmpty || !sequels.isEmpty else { return [] }
        var chain: [SeasonTab] = []
        for prequel in prequels.reversed() {
            chain.append(SeasonTab(label: "S\(chain.count + 1)", title: prequel.anime.title, bangumiID: prequel.anime.bangumiID, isCurrent: false))
        }
        chain.append(SeasonTab(label: "S\(chain.count + 1)", title: detail.title, bangumiID: bangumiID, isCurrent: true))
        for sequel in sequels {
            chain.append(SeasonTab(label: "S\(chain.count + 1)", title: sequel.anime.title, bangumiID: sequel.anime.bangumiID, isCurrent: false))
        }
        return chain
    }

    func clearActionError() {
        actionError = nil
    }

    func clearAutoRuleNotice() {
        autoRuleNotice = nil
    }
}

extension PlayableMediaFile {
    static func resolutionLabel(forHeight height: Int) -> String? {
        switch height {
        case 2100...: "4K"
        case 1000...: "1080p"
        case 700...: "720p"
        case 1...: "\(height)p"
        default: nil
        }
    }
}
