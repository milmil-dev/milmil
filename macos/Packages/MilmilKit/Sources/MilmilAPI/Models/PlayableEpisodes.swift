import Foundation

/// `GET /anime/{bangumiId}/playable-episodes` — the one call a series screen
/// and the player need: every episode, what file (if any) backs it, and the
/// user's progress.
public struct PlayableEpisodesResponse: Decodable, Sendable, Hashable {
    public let animeID: String
    public let watchStatus: WatchStatus
    public let malID: Int?
    public let tmdbID: Int?
    public let anidbID: Int?
    public let userScore: Int?
    public let syncDisabled: Bool
    public let watchStatusOverride: String
    /// Mutable so the player can fold local progress in without a refetch.
    public var episodes: [PlayableEpisode]

    enum CodingKeys: String, CodingKey {
        case episodes
        case animeID = "anime_id"
        case watchStatus = "watch_status"
        case malID = "mal_id"
        case tmdbID = "tmdb_id"
        case anidbID = "anidb_id"
        case userScore = "user_score"
        case syncDisabled = "sync_disabled"
        case watchStatusOverride = "watch_status_override"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        animeID = try c.decodeIfPresent(String.self, forKey: .animeID) ?? ""
        watchStatus = WatchStatus(rawValue: try c.decodeIfPresent(String.self, forKey: .watchStatus) ?? "") ?? .none
        malID = try c.decodeIfPresent(Int.self, forKey: .malID)
        tmdbID = try c.decodeIfPresent(Int.self, forKey: .tmdbID)
        anidbID = try c.decodeIfPresent(Int.self, forKey: .anidbID)
        userScore = try c.decodeIfPresent(Int.self, forKey: .userScore)
        syncDisabled = try c.decode(LenientBool.self, forKey: .syncDisabled).wrappedValue
        watchStatusOverride = try c.decodeIfPresent(String.self, forKey: .watchStatusOverride) ?? ""
        episodes = try c.decodeIfPresent([PlayableEpisode].self, forKey: .episodes) ?? []
    }

    /// The episode to offer on "Play": in-progress first, then the first
    /// unwatched with a file, then the first with a file (web `resolveEpisode`).
    public var resumeCandidate: PlayableEpisode? {
        let playable = episodes.filter { $0.mediaFile != nil }.sorted { $0.sort < $1.sort }
        if let inProgress = playable.first(where: { ($0.progress?.positionSeconds ?? 0) > 0 && !($0.progress?.completed ?? false) }) {
            return inProgress
        }
        if let unwatched = playable.first(where: { !($0.progress?.completed ?? false) }) {
            return unwatched
        }
        return playable.first
    }
}

public struct PlayableEpisode: Decodable, Sendable, Hashable, Identifiable {
    public let episodeID: String
    /// 12.5 marks a special.
    public let sort: Double
    public let title: String?
    public let titleZh: String?
    public let airDate: String?
    public let synopsis: String?
    public let synopsisZh: String?
    public let image: URL?
    public let mediaFile: PlayableMediaFile?
    public let progress: PlayableProgress?

    public var id: String { episodeID }
    public var displayTitle: String? { titleZh.nonEmpty ?? title.nonEmpty }
    public var displaySynopsis: String? { synopsisZh.nonEmpty ?? synopsis.nonEmpty }
    public var hasFile: Bool { mediaFile != nil }

    /// "1", "12", "12.5".
    public var number: String {
        sort.rounded() == sort ? String(Int(sort)) : String(sort)
    }

    enum CodingKeys: String, CodingKey {
        case sort, title, synopsis, image, progress
        case episodeID = "episode_id"
        case titleZh = "title_zh"
        case airDate = "air_date"
        case synopsisZh = "synopsis_zh"
        case mediaFile = "media_file"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        episodeID = try c.decode(String.self, forKey: .episodeID)
        sort = try c.decodeIfPresent(Double.self, forKey: .sort) ?? 0
        title = try c.decodeIfPresent(String.self, forKey: .title).nonEmpty
        titleZh = try c.decodeIfPresent(String.self, forKey: .titleZh).nonEmpty
        airDate = try c.decodeIfPresent(String.self, forKey: .airDate).nonEmpty
        synopsis = try c.decodeIfPresent(String.self, forKey: .synopsis).nonEmpty
        synopsisZh = try c.decodeIfPresent(String.self, forKey: .synopsisZh).nonEmpty
        image = try c.decodeIfPresent(String.self, forKey: .image).httpURL
        mediaFile = try c.decodeIfPresent(PlayableMediaFile.self, forKey: .mediaFile)
        progress = try c.decodeIfPresent(PlayableProgress.self, forKey: .progress)
    }

    private init(copying other: PlayableEpisode, progress: PlayableProgress?) {
        episodeID = other.episodeID
        sort = other.sort
        title = other.title
        titleZh = other.titleZh
        airDate = other.airDate
        synopsis = other.synopsis
        synopsisZh = other.synopsisZh
        image = other.image
        mediaFile = other.mediaFile
        self.progress = progress
    }

    public func withProgress(_ progress: PlayableProgress?) -> PlayableEpisode {
        PlayableEpisode(copying: self, progress: progress)
    }
}

public struct PlayableMediaFile: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let filename: String
    public let sizeBytes: Int?
    public let width: Int?
    public let height: Int?
    public let videoCodec: String?
    public let audioCodec: String?

    enum CodingKeys: String, CodingKey {
        case id, filename, width, height
        case sizeBytes = "size_bytes"
        case videoCodec = "video_codec"
        case audioCodec = "audio_codec"
    }

    /// "1080p", "4K", "720p"… from the stored height.
    public var resolutionLabel: String? {
        guard let height else { return nil }
        switch height {
        case 2100...: return "4K"
        case 1000...: return "1080p"
        case 700...: return "720p"
        default: return "\(height)p"
        }
    }
}

public struct PlayableProgress: Decodable, Sendable, Hashable {
    public let positionSeconds: Int
    public let durationSeconds: Int
    public let completed: Bool

    enum CodingKeys: String, CodingKey {
        case completed
        case positionSeconds = "position_seconds"
        case durationSeconds = "duration_seconds"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        positionSeconds = try c.decodeIfPresent(Int.self, forKey: .positionSeconds) ?? 0
        durationSeconds = try c.decodeIfPresent(Int.self, forKey: .durationSeconds) ?? 0
        completed = try c.decode(LenientBool.self, forKey: .completed).wrappedValue
    }

    public init(positionSeconds: Int, durationSeconds: Int, completed: Bool) {
        self.positionSeconds = positionSeconds
        self.durationSeconds = durationSeconds
        self.completed = completed
    }

    public var fraction: Double {
        durationSeconds > 0 ? min(1, Double(positionSeconds) / Double(durationSeconds)) : 0
    }

    public var remainingSeconds: Int { max(0, durationSeconds - positionSeconds) }
}

struct ScoreUpdate: Encodable, Sendable {
    let score: Int?
}

public struct SyncFlagsUpdate: Encodable, Sendable {
    public let syncDisabled: Bool?
    public let watchStatusOverride: String?

    enum CodingKeys: String, CodingKey {
        case syncDisabled = "sync_disabled"
        case watchStatusOverride = "watch_status_override"
    }

    public init(syncDisabled: Bool? = nil, watchStatusOverride: String? = nil) {
        self.syncDisabled = syncDisabled
        self.watchStatusOverride = watchStatusOverride
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        if let syncDisabled { try c.encode(syncDisabled ? 1 : 0, forKey: .syncDisabled) }
        if let watchStatusOverride { try c.encode(watchStatusOverride, forKey: .watchStatusOverride) }
    }
}
