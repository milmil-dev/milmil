import Foundation
import MilmilAPI

/// One frame from `/ws`: `{"type": "<string>", "data": <any>}`. The server
/// only pushes; it never expects replies. Treat events as invalidation
/// hints — the per-client buffer drops frames silently when it fills.
public struct ServerEvent: Sendable, Hashable {
    public let type: String
    /// Raw JSON of `data` (nil when absent or `null`).
    public let data: Data?

    public init(type: String, data: Data?) {
        self.type = type
        self.data = data
    }

    public func decode<T: Decodable>(_: T.Type = T.self) throws -> T {
        guard let data else { throw APIError.decoding("event \(type) has no data") }
        return try MilmilJSON.makeDecoder().decode(T.self, from: data)
    }

    /// Parses a text frame. Returns nil for frames that are not an envelope.
    public static func parse(_ text: String) -> ServerEvent? {
        guard let raw = text.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: raw) as? [String: Any],
              let type = object["type"] as? String else { return nil }
        var payload: Data?
        if let value = object["data"], !(value is NSNull), JSONSerialization.isValidJSONObject(value) || value is String || value is NSNumber {
            payload = try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed])
        }
        return ServerEvent(type: type, data: payload)
    }

    // Synthetic connection-state events, emitted by the client itself.
    public static let connectedType = "$connected"
    public static let disconnectedType = "$disconnected"
    public var isSynthetic: Bool { type.hasPrefix("$") }
}

/// The server's event names (exhaustive as of api 0.1.17).
public enum ServerEventType {
    public static let scanStarted = "scan:started"
    public static let scanProgress = "scan:progress"
    public static let scanHash = "scan:hash"
    public static let scanCompleted = "scan:completed"
    public static let scanError = "scan:error"
    public static let matchStarted = "match:started"
    public static let matchProgress = "match:progress"
    public static let matchCompleted = "match:completed"
    public static let downloadAdded = "download:added"
    public static let downloadProgress = "download:progress"
    public static let downloadCompleted = "download.completed"
    public static let transcodeReady = "transcode:ready"
    public static let transcodeError = "transcode:error"
    public static let notificationNew = "notification:new"
    public static let anidbRefreshed = "anidb:refreshed"
    public static let syncPulled = "sync:pulled"
    public static let syncNeedsReauth = "sync:needs_reauth"
    public static let updateAvailable = "system:update-available"
}

/// `scanner.ProgressEvent` — payload of every `scan:*` / `match:*` event.
public struct ScanProgress: Decodable, Sendable, Hashable {
    public let type: String?
    public let libraryID: String
    public let libraryName: String?
    public let filesFound: Int
    public let filesHashed: Int
    public let filesMatched: Int
    public let filesTotal: Int
    public let currentFile: String?
    public let error: String?

    enum CodingKeys: String, CodingKey {
        case type, error
        case libraryID = "library_id"
        case libraryName = "library_name"
        case filesFound = "files_found"
        case filesHashed = "files_hashed"
        case filesMatched = "files_matched"
        case filesTotal = "files_total"
        case currentFile = "current_file"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        type = try c.decodeIfPresent(String.self, forKey: .type)
        libraryID = try c.decodeIfPresent(String.self, forKey: .libraryID) ?? ""
        libraryName = try c.decodeIfPresent(String.self, forKey: .libraryName)
        filesFound = try c.decodeIfPresent(Int.self, forKey: .filesFound) ?? 0
        filesHashed = try c.decodeIfPresent(Int.self, forKey: .filesHashed) ?? 0
        filesMatched = try c.decodeIfPresent(Int.self, forKey: .filesMatched) ?? 0
        filesTotal = try c.decodeIfPresent(Int.self, forKey: .filesTotal) ?? 0
        currentFile = try c.decodeIfPresent(String.self, forKey: .currentFile)
        error = try c.decodeIfPresent(String.self, forKey: .error)
    }
}

/// `transcode:ready` / `transcode:error`.
public struct TranscodeEvent: Decodable, Sendable, Hashable {
    public let token: String
    public let fileID: String

    enum CodingKeys: String, CodingKey {
        case token
        case fileID = "file_id"
    }
}

/// `system:update-available`.
public struct UpdateAvailable: Decodable, Sendable, Hashable {
    public let latest: String
    public let releaseURL: URL?
    public let publishedAt: String?

    enum CodingKeys: String, CodingKey {
        case latest
        case releaseURL = "release_url"
        case publishedAt = "published_at"
    }
}
