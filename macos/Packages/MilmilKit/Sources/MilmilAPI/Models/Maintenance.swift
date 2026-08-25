import Foundation

// MARK: - Library sources

/// `source_config` for remote libraries. Field names mirror the server's
/// `storage.RcloneConfig`; only the fields for the chosen `source_type`
/// matter, the rest stay nil and are omitted from the JSON.
public struct LibrarySourceConfig: Encodable, Sendable, Hashable {
    public var host: String?
    public var port: Int?
    public var share: String?
    public var username: String?
    public var password: String?
    public var domain: String?
    public var url: String?
    public var vendor: String?
    public var endpoint: String?
    public var bucket: String?
    public var region: String?
    public var accessKey: String?
    public var secretKey: String?
    public var remoteName: String?

    public init(
        host: String? = nil, port: Int? = nil, share: String? = nil,
        username: String? = nil, password: String? = nil, domain: String? = nil,
        url: String? = nil, vendor: String? = nil,
        endpoint: String? = nil, bucket: String? = nil, region: String? = nil,
        accessKey: String? = nil, secretKey: String? = nil, remoteName: String? = nil
    ) {
        self.host = host
        self.port = port
        self.share = share
        self.username = username
        self.password = password
        self.domain = domain
        self.url = url
        self.vendor = vendor
        self.endpoint = endpoint
        self.bucket = bucket
        self.region = region
        self.accessKey = accessKey
        self.secretKey = secretKey
        self.remoteName = remoteName
    }

    enum CodingKeys: String, CodingKey {
        case host, port, share, username, password, domain, url, vendor, endpoint, bucket, region
        case accessKey = "access_key"
        case secretKey = "secret_key"
        case remoteName = "remote_name"
    }
}

/// `POST /libraries/test-connection`.
public struct TestConnectionResult: Decodable, Sendable {
    public let ok: Bool
    public let error: String?

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        ok = (try? c.decode(LenientBool.self, forKey: .ok).wrappedValue) ?? false
        error = try c.decodeIfPresent(String.self, forKey: .error)
    }

    enum CodingKeys: String, CodingKey { case ok, error }
}

/// `POST /libraries/browse` rows — server-side directory listing.
public struct BrowseEntry: Decodable, Sendable, Hashable, Identifiable {
    public let name: String
    public let path: String
    public var id: String { path }
}

/// `GET /libraries/discover-network` rows.
public struct DiscoveredHost: Decodable, Sendable, Hashable, Identifiable {
    public let ip: String
    public let hostname: String
    public let shares: [String]
    public var id: String { ip }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        ip = try c.decode(String.self, forKey: .ip)
        hostname = try c.decodeIfPresent(String.self, forKey: .hostname) ?? ""
        shares = try c.decodeIfPresent([String].self, forKey: .shares) ?? []
    }

    enum CodingKeys: String, CodingKey { case ip, hostname, shares }
}

/// `GET /rclone/remotes` rows — pre-configured OAuth remotes.
public struct RcloneRemote: Decodable, Sendable, Hashable, Identifiable {
    public let name: String
    public let type: String
    public var id: String { name }
}

// MARK: - Duplicates

/// One file of a duplicate set (`GET /libraries/{id}/duplicates`).
public struct DupFileInfo: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let path: String
    public let filename: String
    public let sizeBytes: Int64
    public let resolution: Int
    public let subgroup: String

    enum CodingKeys: String, CodingKey {
        case id, path, filename, resolution, subgroup
        case sizeBytes = "size_bytes"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        path = try c.decodeIfPresent(String.self, forKey: .path) ?? ""
        filename = try c.decodeIfPresent(String.self, forKey: .filename) ?? ""
        sizeBytes = try c.decodeIfPresent(Int64.self, forKey: .sizeBytes) ?? 0
        resolution = try c.decodeIfPresent(Int.self, forKey: .resolution) ?? 0
        subgroup = try c.decodeIfPresent(String.self, forKey: .subgroup) ?? ""
    }
}

/// One episode with more than one media file.
public struct DupSet: Decodable, Sendable, Hashable, Identifiable {
    public let animeID: String
    public let animeTitle: String
    public let episodeID: String
    public let episodeNumber: Double
    public let preferredID: String
    public let manuallySet: Bool
    public let files: [DupFileInfo]
    public let wastedBytes: Int64

    public var id: String { episodeID }

    enum CodingKeys: String, CodingKey {
        case files
        case animeID = "anime_id"
        case animeTitle = "anime_title"
        case episodeID = "episode_id"
        case episodeNumber = "episode_number"
        case preferredID = "preferred_id"
        case manuallySet = "manually_set"
        case wastedBytes = "wasted_bytes"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        animeID = try c.decodeIfPresent(String.self, forKey: .animeID) ?? ""
        animeTitle = try c.decodeIfPresent(String.self, forKey: .animeTitle) ?? ""
        episodeID = try c.decode(String.self, forKey: .episodeID)
        episodeNumber = try c.decodeIfPresent(Double.self, forKey: .episodeNumber) ?? 0
        preferredID = try c.decodeIfPresent(String.self, forKey: .preferredID) ?? ""
        manuallySet = try c.decode(LenientBool.self, forKey: .manuallySet).wrappedValue
        files = try c.decodeIfPresent([DupFileInfo].self, forKey: .files) ?? []
        wastedBytes = try c.decodeIfPresent(Int64.self, forKey: .wastedBytes) ?? 0
    }
}

/// `POST /libraries/{id}/duplicates/cleanup`.
public struct DupCleanupResult: Decodable, Sendable {
    public let deleted: Int
    public let reclaimedBytes: Int64
    public let skipped: Int
    public let errors: [String]

    enum CodingKeys: String, CodingKey {
        case deleted, skipped, errors
        case reclaimedBytes = "reclaimed_bytes"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        deleted = try c.decodeIfPresent(Int.self, forKey: .deleted) ?? 0
        reclaimedBytes = try c.decodeIfPresent(Int64.self, forKey: .reclaimedBytes) ?? 0
        skipped = try c.decodeIfPresent(Int.self, forKey: .skipped) ?? 0
        errors = try c.decodeIfPresent([String].self, forKey: .errors) ?? []
    }
}

// MARK: - Missing episodes

/// `GET /libraries/{id}/missing-summary` rows / `GET /anime/{id}/missing`.
public struct CompletenessReport: Decodable, Sendable, Hashable, Identifiable {
    public let animeID: String
    public let bangumiID: Int
    public let title: String
    public let total: Int
    public let have: [Double]
    public let missing: [Double]
    public let airingPending: [Double]
    public let unknownTotal: Bool

    public var id: String { animeID }

    enum CodingKeys: String, CodingKey {
        case total, have, missing, title
        case animeID = "anime_id"
        case bangumiID = "bangumi_id"
        case airingPending = "airing_pending"
        case unknownTotal = "unknown_total"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        animeID = try c.decodeIfPresent(String.self, forKey: .animeID) ?? ""
        bangumiID = try c.decodeIfPresent(Int.self, forKey: .bangumiID) ?? 0
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
        total = try c.decodeIfPresent(Int.self, forKey: .total) ?? 0
        have = try c.decodeIfPresent([Double].self, forKey: .have) ?? []
        missing = try c.decodeIfPresent([Double].self, forKey: .missing) ?? []
        airingPending = try c.decodeIfPresent([Double].self, forKey: .airingPending) ?? []
        unknownTotal = try c.decode(LenientBool.self, forKey: .unknownTotal).wrappedValue
    }
}

/// `POST /anime/{id}/missing/auto-rule`.
public struct AutoRuleResult: Decodable, Sendable {
    public let ruleID: String
    public let episodeRange: String
    /// "created" | "merged"
    public let action: String

    enum CodingKeys: String, CodingKey {
        case action
        case ruleID = "rule_id"
        case episodeRange = "episode_range"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        ruleID = try c.decodeIfPresent(String.self, forKey: .ruleID) ?? ""
        episodeRange = try c.decodeIfPresent(String.self, forKey: .episodeRange) ?? ""
        action = try c.decodeIfPresent(String.self, forKey: .action) ?? ""
    }
}

// MARK: - Rename

/// One planned rename (`GET …/rename/preview`; POSTed back verbatim on apply).
public struct RenamePlan: Codable, Sendable, Hashable, Identifiable {
    /// `ok` | `skip_same_as_current` | `skip_collision` | `error`
    public let status: String
    public let mediaFileID: String
    public let oldPath: String
    public let newPath: String
    public let error: String?

    public var id: String { mediaFileID }
    public var isApplicable: Bool { status == "ok" }

    enum CodingKeys: String, CodingKey {
        case status, error
        case mediaFileID = "media_file_id"
        case oldPath = "old_path"
        case newPath = "new_path"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        status = try c.decodeIfPresent(String.self, forKey: .status) ?? "error"
        mediaFileID = try c.decode(String.self, forKey: .mediaFileID)
        oldPath = try c.decodeIfPresent(String.self, forKey: .oldPath) ?? ""
        newPath = try c.decodeIfPresent(String.self, forKey: .newPath) ?? ""
        error = try c.decodeIfPresent(String.self, forKey: .error)
    }
}

/// `GET …/rename/history` rows.
public struct RenameBatch: Decodable, Sendable, Hashable, Identifiable {
    public let batchID: String
    public let appliedAt: Date?
    public let rowCount: Int
    public let revertedCount: Int

    public var id: String { batchID }

    enum CodingKeys: String, CodingKey {
        case batchID = "batch_id"
        case appliedAt = "applied_at"
        case rowCount = "row_count"
        case revertedCount = "reverted_count"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        batchID = try c.decode(String.self, forKey: .batchID)
        appliedAt = try c.decodeIfPresent(String.self, forKey: .appliedAt).flatMap(MilmilDate.parse)
        rowCount = try c.decodeIfPresent(Int.self, forKey: .rowCount) ?? 0
        revertedCount = try c.decodeIfPresent(Int.self, forKey: .revertedCount) ?? 0
    }
}

/// `POST …/rename/apply`.
public struct RenameApplyResult: Decodable, Sendable {
    public let batchID: String
    public let applied: Int
    public let skipped: Int
    public let errors: [String]

    enum CodingKeys: String, CodingKey {
        case applied, skipped, errors
        case batchID = "batch_id"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        batchID = try c.decodeIfPresent(String.self, forKey: .batchID) ?? ""
        applied = try c.decodeIfPresent(Int.self, forKey: .applied) ?? 0
        skipped = try c.decodeIfPresent(Int.self, forKey: .skipped) ?? 0
        errors = try c.decodeIfPresent([String].self, forKey: .errors) ?? []
    }
}

/// `POST …/rename/undo`.
public struct RenameUndoResult: Decodable, Sendable {
    public let reverted: Int
    public let skipped: Int
    public let errors: [String]

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        reverted = try c.decodeIfPresent(Int.self, forKey: .reverted) ?? 0
        skipped = try c.decodeIfPresent(Int.self, forKey: .skipped) ?? 0
        errors = try c.decodeIfPresent([String].self, forKey: .errors) ?? []
    }

    enum CodingKeys: String, CodingKey { case reverted, skipped, errors }
}

// MARK: - Audit

/// `GET /audit` rows. The server serializes `sql.Null*` fields as
/// `{"String": …, "Valid": …}` objects, hence the lenient wrappers.
public struct AuditEntry: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let actionType: String
    public let targetType: String
    public let targetID: String
    public let agentLabel: String
    public let dryRun: Bool
    public let undoneAt: Date?
    public let createdAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case actionType = "action_type"
        case targetType = "target_type"
        case targetID = "target_id"
        case agentLabel = "agent_label"
        case dryRun = "dry_run"
        case undoneAt = "undone_at"
        case createdAt = "created_at"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        actionType = try c.decodeIfPresent(String.self, forKey: .actionType) ?? ""
        targetType = try c.decode(LenientString.self, forKey: .targetType).wrappedValue
        targetID = try c.decode(LenientString.self, forKey: .targetID).wrappedValue
        agentLabel = try c.decode(LenientString.self, forKey: .agentLabel).wrappedValue
        dryRun = try c.decode(LenientBool.self, forKey: .dryRun).wrappedValue
        undoneAt = try c.decode(LenientDate.self, forKey: .undoneAt).wrappedValue
        createdAt = try c.decodeIfPresent(String.self, forKey: .createdAt).flatMap(MilmilDate.parse)
    }

    public var isUndone: Bool { undoneAt != nil }
}

/// `POST /audit/undo`.
public struct AuditUndoResult: Decodable, Sendable {
    public struct Item: Decodable, Sendable, Hashable {
        public let auditID: String
        /// `reversed` | `skipped` | `failed`
        public let status: String
        public let reason: String?

        enum CodingKeys: String, CodingKey {
            case status, reason
            case auditID = "audit_id"
        }
    }

    public let items: [Item]

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        items = try c.decodeIfPresent([Item].self, forKey: .items) ?? []
    }

    enum CodingKeys: String, CodingKey { case items }
}
