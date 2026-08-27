import Foundation

// Library maintenance: duplicates, missing episodes, batch rename, and the
// per-user audit log. Mirrors `web/src/lib/api/{duplicates,completeness,rename}.ts`.
public extension APIClient {
    // MARK: - Duplicates

    func libraryDuplicates(libraryID: String) async throws -> [DupSet] {
        let rows: [DupSet]? = try await get("/api/v1/libraries/\(libraryID)/duplicates")
        return rows ?? []
    }

    /// Deletes every non-preferred file of every duplicate set in the library.
    func cleanupLibraryDuplicates(libraryID: String) async throws -> DupCleanupResult {
        try await post("/api/v1/libraries/\(libraryID)/duplicates/cleanup", body: EmptyBody())
    }

    /// Marks one file as the copy that playback should use.
    func setPreferredMediaFile(episodeID: String, mediaFileID: String) async throws {
        struct Body: Encodable {
            let mediaFileID: String
            enum CodingKeys: String, CodingKey { case mediaFileID = "media_file_id" }
        }
        try await patch("/api/v1/episodes/\(episodeID)/preferred", body: Body(mediaFileID: mediaFileID))
    }

    func animeDuplicates(bangumiID: Int) async throws -> [DupSet] {
        let rows: [DupSet]? = try await get("/api/v1/anime/\(bangumiID)/duplicates")
        return rows ?? []
    }

    // MARK: - Missing episodes

    func libraryMissingSummary(libraryID: String) async throws -> [CompletenessReport] {
        let rows: [CompletenessReport]? = try await get("/api/v1/libraries/\(libraryID)/missing-summary")
        return rows ?? []
    }

    /// One series' completeness (the detail page's episode-status card).
    /// 404 when the series is not in the library.
    func animeMissing(bangumiID: Int) async throws -> CompletenessReport {
        try await get("/api/v1/anime/\(bangumiID)/missing")
    }

    /// Creates (or merges into) an auto-download rule covering the missing episodes.
    func createMissingAutoRule(bangumiID: Int, episodeNumbers: [Double]) async throws -> AutoRuleResult {
        struct Body: Encodable {
            let episodeNumbers: [Double]
            enum CodingKeys: String, CodingKey { case episodeNumbers = "episode_numbers" }
        }
        return try await post("/api/v1/anime/\(bangumiID)/missing/auto-rule", body: Body(episodeNumbers: episodeNumbers))
    }

    // MARK: - Rename

    func setRenameConfig(libraryID: String, template: String, auto: Bool) async throws {
        struct Body: Encodable {
            let template: String
            let auto: Bool
        }
        try await patch("/api/v1/libraries/\(libraryID)/rename-config", body: Body(template: template, auto: auto))
    }

    func renamePreview(libraryID: String, animeID: String? = nil) async throws -> [RenamePlan] {
        struct Response: Decodable { let plans: [RenamePlan]? }
        var query: [URLQueryItem] = []
        if let animeID { query.append(URLQueryItem(name: "anime_id", value: animeID)) }
        let response: Response = try await get("/api/v1/libraries/\(libraryID)/rename/preview", query: query)
        return response.plans ?? []
    }

    func renameApply(libraryID: String, plans: [RenamePlan]) async throws -> RenameApplyResult {
        struct Body: Encodable { let plans: [RenamePlan] }
        return try await post("/api/v1/libraries/\(libraryID)/rename/apply", body: Body(plans: plans))
    }

    func renameUndo(libraryID: String, batchID: String) async throws -> RenameUndoResult {
        struct Body: Encodable {
            let batchID: String
            enum CodingKeys: String, CodingKey { case batchID = "batch_id" }
        }
        return try await post("/api/v1/libraries/\(libraryID)/rename/undo", body: Body(batchID: batchID))
    }

    func renameHistory(libraryID: String) async throws -> [RenameBatch] {
        let rows: [RenameBatch]? = try await get("/api/v1/libraries/\(libraryID)/rename/history")
        return rows ?? []
    }

    // MARK: - Audit

    /// The caller's audit entries, newest first.
    func auditLog(action: String? = nil, limit: Int = 50, offset: Int = 0) async throws -> [AuditEntry] {
        struct Response: Decodable { let items: [AuditEntry]? }
        var query = [
            URLQueryItem(name: "limit", value: String(limit)),
            URLQueryItem(name: "offset", value: String(offset)),
        ]
        if let action { query.append(URLQueryItem(name: "action", value: action)) }
        let response: Response = try await get("/api/v1/audit", query: query)
        return response.items ?? []
    }

    /// Reverses one audit entry (`id`) or everything since a timestamp.
    func undoAudit(id: String? = nil, since: Date? = nil, dryRun: Bool = false) async throws -> AuditUndoResult {
        struct Body: Encodable {
            let id: String?
            let since: String?
            let dryRun: Bool
            enum CodingKeys: String, CodingKey {
                case id, since
                case dryRun = "dry_run"
            }
        }
        let since = since.map { ISO8601DateFormatter().string(from: $0) }
        return try await post("/api/v1/audit/undo", body: Body(id: id, since: since, dryRun: dryRun))
    }
}
