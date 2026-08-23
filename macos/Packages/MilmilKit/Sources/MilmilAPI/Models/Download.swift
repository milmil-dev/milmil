import Foundation

/// `GET /downloads` rows (aria2-backed).
public struct Download: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let gid: String
    public let url: String
    public let name: String
    /// `active` | `waiting` | `paused` | `complete` | `error` | `removed`
    public let status: String
    public let totalBytes: Int64
    public let completedBytes: Int64
    public let speedBytes: Int64
    public let saveDir: String
    public let ruleID: String?
    public let createdAt: Date?
    public let updatedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, gid, url, name, status
        case totalBytes = "total_bytes"
        case completedBytes = "completed_bytes"
        case speedBytes = "speed_bytes"
        case saveDir = "save_dir"
        case ruleID = "rule_id"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
        gid = try c.decodeIfPresent(String.self, forKey: .gid) ?? ""
        url = try c.decodeIfPresent(String.self, forKey: .url) ?? ""
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
        status = try c.decodeIfPresent(String.self, forKey: .status) ?? "waiting"
        totalBytes = try c.decodeIfPresent(Int64.self, forKey: .totalBytes) ?? 0
        completedBytes = try c.decodeIfPresent(Int64.self, forKey: .completedBytes) ?? 0
        speedBytes = try c.decodeIfPresent(Int64.self, forKey: .speedBytes) ?? 0
        saveDir = try c.decodeIfPresent(String.self, forKey: .saveDir) ?? ""
        ruleID = try c.decodeIfPresent(String.self, forKey: .ruleID).nonEmpty
        createdAt = try c.decodeIfPresent(String.self, forKey: .createdAt).flatMap(MilmilDate.parse)
        updatedAt = try c.decodeIfPresent(String.self, forKey: .updatedAt).flatMap(MilmilDate.parse)
    }

    public var fraction: Double { totalBytes > 0 ? min(1, Double(completedBytes) / Double(totalBytes)) : 0 }
    public var isActive: Bool { status == "active" || status == "waiting" }
    public var isDone: Bool { status == "complete" }
    public var isPaused: Bool { status == "paused" }
    public var isError: Bool { status == "error" }
    public var displayName: String { name.isEmpty ? (url.count > 60 ? String(url.prefix(60)) + "…" : url) : name }
}
