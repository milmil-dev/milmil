import Foundation

/// `GET /notifications` rows. `type` is `download.completed`,
/// `library.scan_complete`, `system.error`, …; `read` is `0|1`.
public struct MilmilNotification: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let type: String
    public let title: String
    public let message: String
    public let severity: Severity
    /// Mutable so clients can apply optimistic "mark read" updates.
    public var read: Bool
    /// Raw JSON payload, when the server attached one.
    public let metadata: String?
    public let createdAt: Date?

    public enum Severity: String, Sendable, Hashable {
        case info, success, error
    }

    public var category: Category {
        if type.hasPrefix("download") { return .download }
        if type.hasPrefix("library") || type.hasPrefix("scan") || type.hasPrefix("match") { return .library }
        if type.hasPrefix("anime") { return .anime }
        return .system
    }

    public enum Category: String, Sendable, CaseIterable, Identifiable {
        public var id: String { rawValue }
        case all, download, library, system, anime
    }

    // MARK: Metadata

    /// `metadata` parsed as an object; empty when absent or malformed.
    public var payload: [String: JSONValue] {
        guard let metadata, let data = metadata.data(using: .utf8),
              let value = try? JSONDecoder().decode(JSONValue.self, from: data),
              case let .object(object) = value else { return [:] }
        return object
    }

    /// `bangumi_id` — set on airing reminders, enriched download events and
    /// `anime.episode_ready`.
    public var bangumiID: Int? {
        switch payload["bangumi_id"] {
        case let .number(number): number > 0 ? Int(number) : nil
        case let .string(string): Int(string).flatMap { $0 > 0 ? $0 : nil }
        default: nil
        }
    }

    /// "5", "12.5" — `episode` (downloads) or `episode_number` (airing).
    public var episodeLabel: String? {
        for key in ["episode", "episode_number"] {
            switch payload[key] {
            case let .string(string) where !string.isEmpty:
                return string.drop { $0 == "0" }.isEmpty ? string : String(string.drop { $0 == "0" })
            case let .number(number) where number > 0:
                return number.rounded() == number ? String(Int(number)) : String(number)
            default: continue
            }
        }
        return nil
    }

    public var episodeID: String? { payload["episode_id"]?.stringValue.nonEmpty }
    public var mediaFileID: String? { payload["media_file_id"]?.stringValue.nonEmpty }
    public var animeName: String? { payload["anime_name"]?.stringValue.nonEmpty }
    public var coverImage: URL? { payload["cover_image"]?.stringValue.httpURL }

    enum CodingKeys: String, CodingKey {
        case id, type, title, message, severity, read, metadata
        case createdAt = "created_at"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        type = try c.decodeIfPresent(String.self, forKey: .type) ?? ""
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
        message = try c.decodeIfPresent(String.self, forKey: .message) ?? ""
        severity = Severity(rawValue: try c.decodeIfPresent(String.self, forKey: .severity) ?? "") ?? .info
        read = try c.decode(LenientBool.self, forKey: .read).wrappedValue
        metadata = try Self.decodeMetadata(from: c)
        createdAt = try c.decodeIfPresent(String.self, forKey: .createdAt).flatMap(MilmilDate.parse)
    }

    /// The store type is `sql.NullString`, which Go encodes as
    /// `{"String": "...", "Valid": true}` unless a handler flattens it.
    private static func decodeMetadata(from c: KeyedDecodingContainer<CodingKeys>) throws -> String? {
        if let string = try? c.decodeIfPresent(String.self, forKey: .metadata) { return string.nonEmpty }
        struct NullString: Decodable {
            let String: String
            let Valid: Bool
        }
        if let null = try? c.decodeIfPresent(NullString.self, forKey: .metadata) {
            return null.Valid ? null.String.nonEmpty : nil
        }
        return nil
    }
}

public struct UnreadCount: Decodable, Sendable {
    public let count: Int
}
