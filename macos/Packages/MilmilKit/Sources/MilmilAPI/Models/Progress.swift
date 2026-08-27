import Foundation

/// `POST /progress`. The web client sends this every 10 s and on pause/end.
public struct ProgressSave: Encodable, Sendable, Hashable {
    public let mediaFileID: String
    public let episodeID: String
    public let positionSeconds: Int
    public let durationSeconds: Int
    public let completed: Bool

    enum CodingKeys: String, CodingKey {
        case completed
        case mediaFileID = "media_file_id"
        case episodeID = "episode_id"
        case positionSeconds = "position_seconds"
        case durationSeconds = "duration_seconds"
    }

    public init(mediaFileID: String, episodeID: String, positionSeconds: Int, durationSeconds: Int, completed: Bool) {
        self.mediaFileID = mediaFileID
        self.episodeID = episodeID
        self.positionSeconds = positionSeconds
        self.durationSeconds = durationSeconds
        self.completed = completed
    }
}

/// Rows from `GET /progress/recent` and `GET /progress/history`, enriched
/// with the series. Note `completed` is `0|1` from SQLite.
public struct ProgressEntry: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let episodeID: String
    public let mediaFileID: String?
    public let positionSeconds: Int
    public let durationSeconds: Int?
    public let completed: Bool
    public let lastWatchedAt: Date?
    public let animeID: String
    public let animeTitle: String
    public let animeTitleZh: String?
    public let animeCoverImage: URL?
    public let animeBangumiID: Int?
    public let episodeNumber: Double

    public var displayTitle: String { animeTitleZh.nonEmpty ?? animeTitle }

    /// 0…1, or nil when the duration is unknown.
    public var fraction: Double? {
        guard let durationSeconds, durationSeconds > 0 else { return nil }
        return min(1, max(0, Double(positionSeconds) / Double(durationSeconds)))
    }

    public var remainingSeconds: Int? {
        guard let durationSeconds else { return nil }
        return max(0, durationSeconds - positionSeconds)
    }

    enum CodingKeys: String, CodingKey {
        case id, completed
        case episodeID = "episode_id"
        case mediaFileID = "media_file_id"
        case positionSeconds = "position_seconds"
        case durationSeconds = "duration_seconds"
        case lastWatchedAt = "last_watched_at"
        case animeID = "anime_id"
        case animeTitle = "anime_title"
        case animeTitleZh = "anime_title_zh"
        case animeCoverImage = "anime_cover_image"
        case animeBangumiID = "anime_bangumi_id"
        case episodeNumber = "episode_number"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        episodeID = try c.decodeIfPresent(String.self, forKey: .episodeID) ?? ""
        mediaFileID = try c.decodeIfPresent(String.self, forKey: .mediaFileID).nonEmpty
        positionSeconds = try c.decodeIfPresent(Int.self, forKey: .positionSeconds) ?? 0
        durationSeconds = try c.decodeIfPresent(Int.self, forKey: .durationSeconds)
        completed = try c.decode(LenientBool.self, forKey: .completed).wrappedValue
        lastWatchedAt = try c.decodeIfPresent(String.self, forKey: .lastWatchedAt).flatMap(MilmilDate.parse)
        animeID = try c.decodeIfPresent(String.self, forKey: .animeID) ?? ""
        animeTitle = try c.decodeIfPresent(String.self, forKey: .animeTitle) ?? ""
        animeTitleZh = try c.decodeIfPresent(String.self, forKey: .animeTitleZh).nonEmpty
        animeCoverImage = try c.decodeIfPresent(String.self, forKey: .animeCoverImage).httpURL
        animeBangumiID = try c.decodeIfPresent(Int.self, forKey: .animeBangumiID)
        episodeNumber = try c.decodeIfPresent(Double.self, forKey: .episodeNumber) ?? 0
    }
}

/// `GET /progress/history` — cursor paginated on `last_watched_at`.
public struct HistoryPage: Decodable, Sendable {
    public let items: [ProgressEntry]
    public let nextBefore: String?

    enum CodingKeys: String, CodingKey {
        case items
        case nextBefore = "next_before"
    }
}

public enum HistoryFilter: String, Sendable, CaseIterable, Identifiable {
    public var id: String { rawValue }
    case all, inProgress = "in_progress", completed
}

struct BatchDeleteRequest: Encodable, Sendable {
    let ids: [String]
}
