import Foundation

// MARK: - Backend services

/// One row of `GET /system/services`: a backend service the client can
/// inspect and, when `controllable` / `runnable`, manage.
public struct BackendService: Decodable, Sendable, Hashable, Identifiable {
    public enum Kind: String, Sendable, Hashable {
        case api, worker, bot, daemon, unknown
    }

    public let id: String
    public let kind: Kind
    /// Server-side display name; clients localize known ids themselves.
    public let name: String
    public let enabled: Bool
    public let controllable: Bool
    public let runnable: Bool
    public let running: Bool
    public let intervalSeconds: Int?
    public let lastRunAt: Date?
    public let lastDurationMs: Int?
    public let lastError: String
    public let nextRunAt: Date?
    public let summary: String
    /// Service-specific fields (`jellyfin`: address / discovery / devices;
    /// `transcode_cache`: bytes; `downloader`: the status object).
    public let extra: [String: JSONValue]

    public var isWorker: Bool { id.hasPrefix("worker.") }
    public var hasFailure: Bool { !lastError.isEmpty }

    public func extraString(_ key: String) -> String? { extra[key]?.stringValue.nonEmpty }

    public func extraInt(_ key: String) -> Int? {
        switch extra[key] {
        case let .number(number): Int(number)
        case let .string(string): Int(string)
        default: nil
        }
    }

    public func extraBool(_ key: String) -> Bool? {
        switch extra[key] {
        case let .bool(bool): bool
        case let .number(number): number != 0
        default: nil
        }
    }

    enum CodingKeys: String, CodingKey {
        case id, kind, name, enabled, controllable, runnable, running, summary, extra
        case intervalSeconds = "interval_seconds"
        case lastRunAt = "last_run_at"
        case lastDurationMs = "last_duration_ms"
        case lastError = "last_error"
        case nextRunAt = "next_run_at"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        kind = Kind(rawValue: try c.decodeIfPresent(String.self, forKey: .kind) ?? "") ?? .unknown
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? id
        enabled = try c.decodeIfPresent(LenientBool.self, forKey: .enabled)?.wrappedValue ?? true
        controllable = try c.decodeIfPresent(LenientBool.self, forKey: .controllable)?.wrappedValue ?? false
        runnable = try c.decodeIfPresent(LenientBool.self, forKey: .runnable)?.wrappedValue ?? false
        running = try c.decodeIfPresent(LenientBool.self, forKey: .running)?.wrappedValue ?? false
        intervalSeconds = try c.decodeIfPresent(Int.self, forKey: .intervalSeconds)
        lastRunAt = try c.decodeIfPresent(String.self, forKey: .lastRunAt).flatMap(MilmilDate.parse)
        lastDurationMs = try c.decodeIfPresent(Int.self, forKey: .lastDurationMs)
        lastError = try c.decodeIfPresent(String.self, forKey: .lastError) ?? ""
        nextRunAt = try c.decodeIfPresent(String.self, forKey: .nextRunAt).flatMap(MilmilDate.parse)
        summary = try c.decodeIfPresent(String.self, forKey: .summary) ?? ""
        if case let .object(object)? = try c.decodeIfPresent(JSONValue.self, forKey: .extra) {
            extra = object
        } else {
            extra = [:]
        }
    }
}

/// `GET /system/services`.
public struct BackendServices: Decodable, Sendable {
    public let services: [BackendService]
    public let system: SystemStatus?

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        services = try c.decodeIfPresent([BackendService].self, forKey: .services) ?? []
        system = try c.decodeIfPresent(SystemStatus.self, forKey: .system)
    }

    enum CodingKeys: String, CodingKey { case services, system }
}

public struct SystemStatus: Decodable, Sendable, Hashable {
    public let version: String
    public let uptimeSeconds: Int
    public let startedAt: Date?

    enum CodingKeys: String, CodingKey {
        case version
        case uptimeSeconds = "uptime_seconds"
        case startedAt = "started_at"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        version = try c.decodeIfPresent(String.self, forKey: .version) ?? ""
        uptimeSeconds = try c.decodeIfPresent(Int.self, forKey: .uptimeSeconds) ?? 0
        startedAt = try c.decodeIfPresent(String.self, forKey: .startedAt).flatMap(MilmilDate.parse)
    }
}

/// `POST /system/services/{id}/run`.
public struct ServiceRunResult: Decodable, Sendable {
    public let started: Bool

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        started = try c.decodeIfPresent(LenientBool.self, forKey: .started)?.wrappedValue ?? true
    }

    enum CodingKeys: String, CodingKey { case started }
}

/// `GET /system/services/jellyfin/devices` — an external player that has
/// logged in through the Jellyfin-compatible API.
public struct JellyfinDevice: Decodable, Sendable, Hashable, Identifiable {
    public let deviceID: String
    public let client: String
    public let deviceName: String
    public let firstSeen: Date?
    public let lastSeen: Date?
    public let revoked: Bool

    public var id: String { deviceID }

    enum CodingKeys: String, CodingKey {
        case client, revoked
        case deviceID = "device_id"
        case deviceName = "device_name"
        case firstSeen = "first_seen"
        case lastSeen = "last_seen"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        deviceID = try c.decode(String.self, forKey: .deviceID)
        client = try c.decodeIfPresent(String.self, forKey: .client) ?? ""
        deviceName = try c.decodeIfPresent(String.self, forKey: .deviceName) ?? ""
        firstSeen = try c.decodeIfPresent(String.self, forKey: .firstSeen).flatMap(MilmilDate.parse)
        lastSeen = try c.decodeIfPresent(String.self, forKey: .lastSeen).flatMap(MilmilDate.parse)
        revoked = try c.decodeIfPresent(LenientBool.self, forKey: .revoked)?.wrappedValue ?? false
    }
}

/// `GET /system/update-check`.
public struct UpdateCheck: Decodable, Sendable, Hashable {
    public let current: String
    public let latest: String?
    public let hasUpdate: Bool
    public let releaseURL: URL?
    public let stale: Bool

    enum CodingKeys: String, CodingKey {
        case current, latest, stale
        case hasUpdate = "has_update"
        case releaseURL = "release_url"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        current = try c.decodeIfPresent(String.self, forKey: .current) ?? ""
        latest = try c.decodeIfPresent(String.self, forKey: .latest).nonEmpty
        hasUpdate = try c.decodeIfPresent(LenientBool.self, forKey: .hasUpdate)?.wrappedValue ?? false
        releaseURL = try c.decodeIfPresent(String.self, forKey: .releaseURL).httpURL
        stale = try c.decodeIfPresent(LenientBool.self, forKey: .stale)?.wrappedValue ?? false
    }
}
