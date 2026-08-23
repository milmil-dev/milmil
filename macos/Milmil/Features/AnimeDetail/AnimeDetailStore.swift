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
        _ = await (detailTask, playableTask)
        if episodes.isEmpty {
            discoverEpisodes = (try? await client.discoverEpisodes(bangumiID: bangumiID)) ?? []
        }
        comments = (try? await client.bangumiComments(bangumiID: bangumiID)) ?? []
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

    func clearActionError() {
        actionError = nil
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
