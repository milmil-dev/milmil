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
        return .system
    }

    public enum Category: String, Sendable, CaseIterable {
        case all, download, library, system
    }

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
