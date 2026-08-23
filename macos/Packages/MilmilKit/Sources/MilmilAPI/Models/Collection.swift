import Foundation

/// The user's list status for a series. Raw values are the API's.
public enum WatchStatus: String, Codable, Sendable, CaseIterable, Hashable {
    case none, watching, planning, completed, paused, dropped

    public var isInCollection: Bool { self != .none }
}

/// `GET /collection` rows — the user's list, from the local `anime` table.
public struct CollectionItem: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let bangumiID: Int?
    public let title: String
    public let titleZh: String?
    public let titleEN: String?
    public let coverImage: URL?
    public let totalEpisodes: Int?
    /// Airing status string from metadata.
    public let status: String
    public let watchStatus: WatchStatus
    public let watchStatusUpdatedAt: Date?
    @LenientStringArray public var genres: [String]
    public let year: Int?
    public let season: String?
    public let airDate: String?
    public let userScore: Int?
    public let score: Double
    public let localFileCount: Int

    public var displayTitle: String { titleZh.nonEmpty ?? title }

    enum CodingKeys: String, CodingKey {
        case id, title, status, genres, year, season, score
        case bangumiID = "bangumi_id"
        case titleZh = "title_zh"
        case titleEN = "title_en"
        case coverImage = "cover_image_url"
        case totalEpisodes = "total_episodes"
        case watchStatus = "watch_status"
        case watchStatusUpdatedAt = "watch_status_updated_at"
        case airDate = "air_date"
        case userScore = "user_score"
        case localFileCount = "local_file_count"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        bangumiID = try c.decodeIfPresent(Int.self, forKey: .bangumiID)
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
        titleZh = try c.decodeIfPresent(String.self, forKey: .titleZh).nonEmpty
        titleEN = try c.decodeIfPresent(String.self, forKey: .titleEN).nonEmpty
        coverImage = try c.decodeIfPresent(String.self, forKey: .coverImage).httpURL
        totalEpisodes = try c.decodeIfPresent(Int.self, forKey: .totalEpisodes)
        status = try c.decodeIfPresent(String.self, forKey: .status) ?? ""
        watchStatus = WatchStatus(rawValue: try c.decodeIfPresent(String.self, forKey: .watchStatus) ?? "") ?? .none
        watchStatusUpdatedAt = try c.decodeIfPresent(String.self, forKey: .watchStatusUpdatedAt).flatMap(MilmilDate.parse)
        _genres = try c.decode(LenientStringArray.self, forKey: .genres)
        year = try c.decodeIfPresent(Int.self, forKey: .year)
        season = try c.decodeIfPresent(String.self, forKey: .season).nonEmpty
        airDate = try c.decodeIfPresent(String.self, forKey: .airDate).nonEmpty
        userScore = try c.decodeIfPresent(Int.self, forKey: .userScore)
        score = try c.decodeIfPresent(Double.self, forKey: .score) ?? 0
        localFileCount = try c.decodeIfPresent(Int.self, forKey: .localFileCount) ?? 0
    }
}

/// `GET /collection/status-counts`.
public struct WatchStatusCount: Decodable, Sendable, Hashable {
    public let watchStatus: WatchStatus
    public let count: Int

    enum CodingKeys: String, CodingKey {
        case count
        case watchStatus = "watch_status"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        watchStatus = WatchStatus(rawValue: try c.decodeIfPresent(String.self, forKey: .watchStatus) ?? "") ?? .none
        count = try c.decodeIfPresent(Int.self, forKey: .count) ?? 0
    }
}

struct WatchStatusUpdate: Encodable, Sendable {
    let status: String
}
