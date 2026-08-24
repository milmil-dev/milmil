import Foundation

/// `GET /libraries` rows (SQLite 0/1 for `enabled`, counts joined in).
public struct Library: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let name: String
    public let path: String
    public let enabled: Bool
    public let scanIntervalMinutes: Int
    public let lastScannedAt: Date?
    /// `local` | `smb` | `sftp` | `webdav` | `s3` | `rclone`
    public let sourceType: String
    public let fileCount: Int
    public let matchedCount: Int
    public let unmatchedCount: Int
    public let totalSizeBytes: Int64
    public let renameTemplate: String
    public let renameAuto: Bool

    enum CodingKeys: String, CodingKey {
        case id, name, path, enabled
        case scanIntervalMinutes = "scan_interval_minutes"
        case lastScannedAt = "last_scanned_at"
        case sourceType = "source_type"
        case fileCount = "file_count"
        case matchedCount = "matched_count"
        case unmatchedCount = "unmatched_count"
        case totalSizeBytes = "total_size_bytes"
        case renameTemplate = "rename_template"
        case renameAuto = "rename_auto"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
        path = try c.decodeIfPresent(String.self, forKey: .path) ?? ""
        enabled = (try? c.decode(LenientBool.self, forKey: .enabled).wrappedValue) ?? true
        scanIntervalMinutes = try c.decodeIfPresent(Int.self, forKey: .scanIntervalMinutes) ?? 60
        lastScannedAt = try c.decodeIfPresent(String.self, forKey: .lastScannedAt).flatMap(MilmilDate.parse)
        sourceType = (try c.decodeIfPresent(String.self, forKey: .sourceType)).nonEmpty ?? "local"
        fileCount = try c.decodeIfPresent(Int.self, forKey: .fileCount) ?? 0
        matchedCount = try c.decodeIfPresent(Int.self, forKey: .matchedCount) ?? 0
        unmatchedCount = try c.decodeIfPresent(Int.self, forKey: .unmatchedCount) ?? 0
        totalSizeBytes = try c.decodeIfPresent(Int64.self, forKey: .totalSizeBytes) ?? 0
        renameTemplate = try c.decode(LenientString.self, forKey: .renameTemplate).wrappedValue
        renameAuto = try c.decode(LenientBool.self, forKey: .renameAuto).wrappedValue
    }

    public var isLocal: Bool { sourceType == "local" }
}

/// `GET /libraries/{id}/media-files` rows.
public struct MediaFileRow: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let libraryID: String
    public let path: String
    public let filename: String
    public let sizeBytes: Int64
    /// `auto` | `manual` | `unmatched`
    public let matchStatus: String
    public let matchedAnimeTitle: String
    public let matchedEpisodeSort: Double
    public let matchedBangumiID: Int
    public let subtitleCount: Int
    public let createdAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, path, filename
        case libraryID = "library_id"
        case sizeBytes = "size_bytes"
        case matchStatus = "match_status"
        case matchedAnimeTitle = "matched_anime_title"
        case matchedEpisodeSort = "matched_episode_sort"
        case matchedBangumiID = "matched_bangumi_id"
        case subtitleCount = "subtitle_count"
        case createdAt = "created_at"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        libraryID = try c.decodeIfPresent(String.self, forKey: .libraryID) ?? ""
        path = try c.decodeIfPresent(String.self, forKey: .path) ?? ""
        filename = try c.decodeIfPresent(String.self, forKey: .filename) ?? ""
        sizeBytes = try c.decodeIfPresent(Int64.self, forKey: .sizeBytes) ?? 0
        matchStatus = try c.decodeIfPresent(String.self, forKey: .matchStatus) ?? "unmatched"
        matchedAnimeTitle = try c.decodeIfPresent(String.self, forKey: .matchedAnimeTitle) ?? ""
        matchedEpisodeSort = try c.decodeIfPresent(Double.self, forKey: .matchedEpisodeSort) ?? 0
        matchedBangumiID = try c.decodeIfPresent(Int.self, forKey: .matchedBangumiID) ?? 0
        subtitleCount = try c.decodeIfPresent(Int.self, forKey: .subtitleCount) ?? 0
        createdAt = try c.decodeIfPresent(String.self, forKey: .createdAt).flatMap(MilmilDate.parse)
    }

    public var isMatched: Bool { matchStatus != "unmatched" }
}

public struct MediaFilesPage: Decodable, Sendable {
    public let items: [MediaFileRow]
    public let page: Int
    public let perPage: Int
    public let total: Int

    enum CodingKeys: String, CodingKey {
        case items, page, total
        case perPage = "per_page"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        items = try c.decodeIfPresent([MediaFileRow].self, forKey: .items) ?? []
        page = try c.decodeIfPresent(Int.self, forKey: .page) ?? 1
        perPage = try c.decodeIfPresent(Int.self, forKey: .perPage) ?? 50
        total = try c.decodeIfPresent(Int.self, forKey: .total) ?? items.count
    }
}

public enum MediaFileFilter: String, Sendable, CaseIterable {
    case all, matched, unmatched
}
