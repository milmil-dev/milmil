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

    init(bangumiID: Int, client: APIClient) {
        self.bangumiID = bangumiID
        self.client = client
    }

    var episodes: [PlayableEpisode] { playable.value??.episodes ?? [] }
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

    func load() async {
        async let detailTask: Void = loadDetail()
        async let playableTask: Void = loadPlayable()
        async let franchiseTask = try? client.franchise(bangumiID: bangumiID)
        async let rulesTask = try? client.downloadRules()
        async let maintenanceTask: Void = loadMaintenance()
        _ = await (detailTask, playableTask, maintenanceTask)
        franchise = await franchiseTask
        hasSubscription = await rulesTask?.contains { $0.bangumiID == bangumiID && $0.enabled } ?? false
        if episodes.isEmpty {
            discoverEpisodes = (try? await client.discoverEpisodes(bangumiID: bangumiID)) ?? []
        }
        comments = (try? await client.bangumiComments(bangumiID: bangumiID)) ?? []
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
        detail = await detail.reloaded { try await client.animeDetail(bangumiID: bangumiID) }
    }

    func loadPlayable() async {
        playable = playable.reloading
        playable = await playable.reloaded {
            do {
                let response = try await client.playableEpisodes(bangumiID: bangumiID)
                watchStatus = response.watchStatus
                userScore = response.userScore
                syncDisabled = response.syncDisabled
                return response
            } catch APIError.http(status: 404, _) {
                return nil // not in the library yet
            }
        }
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

    /// S1/S2/… pills — franchise-powered like the web, falling back to the
    /// PREQUEL/SEQUEL chain in `relations`.
    var seasonTabs: [SeasonTab] {
        if let seasons = franchise?.mainSeries, seasons.count > 1 {
            let anilistID = detail.value?.summary.anilistID
            return seasons.enumerated().map { index, season in
                SeasonTab(
                    label: "S\(index + 1)",
                    title: season.title,
                    bangumiID: season.bangumiID,
                    isCurrent: season.bangumiID == bangumiID || (anilistID != nil && season.anilistID == anilistID)
                )
            }
        }
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
