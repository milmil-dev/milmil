import Foundation

// Collection, progress, playable episodes, notifications, local search —
// mirrors web/src/lib/api/{collection,progress,anime,notifications}.ts.
public extension APIClient {
    // MARK: Collection

    func collection(status: WatchStatus? = nil, search: String? = nil, sortByName: Bool = false) async throws -> [CollectionItem] {
        var items: [URLQueryItem] = [URLQueryItem(name: "sort", value: sortByName ? "name" : "recent")]
        if let status, status != .none { items.append(URLQueryItem(name: "status", value: status.rawValue)) }
        if let search, !search.isEmpty { items.append(URLQueryItem(name: "search", value: search)) }
        return try await get("/api/v1/collection", query: items)
    }

    func recentCollection() async throws -> [CollectionItem] {
        try await get("/api/v1/collection/recent")
    }

    func collectionStatusCounts() async throws -> [WatchStatusCount] {
        try await get("/api/v1/collection/status-counts")
    }

    /// `PATCH /collection/{bangumiId}/status` — `.none` removes it from the list.
    func setWatchStatus(bangumiID: Int, _ status: WatchStatus) async throws {
        let _: EmptyResponse = try await patch("/api/v1/collection/\(bangumiID)/status", body: WatchStatusUpdate(status: status.rawValue))
    }

    // MARK: Progress

    func saveProgress(_ progress: ProgressSave) async throws {
        try await post("/api/v1/progress", body: progress)
    }

    /// "Continue watching".
    func recentProgress() async throws -> [ProgressEntry] {
        try await get("/api/v1/progress/recent")
    }

    func history(filter: HistoryFilter = .all, before: String? = nil, query: String? = nil, limit: Int = 40) async throws -> HistoryPage {
        var items = [URLQueryItem(name: "filter", value: filter.rawValue), URLQueryItem(name: "limit", value: String(limit))]
        if let before { items.append(URLQueryItem(name: "before", value: before)) }
        if let query, !query.isEmpty { items.append(URLQueryItem(name: "q", value: query)) }
        return try await get("/api/v1/progress/history", query: items)
    }

    func deleteProgress(id: String) async throws {
        try await delete("/api/v1/progress/\(id)")
    }

    /// Max 200 ids per call.
    func deleteProgress(ids: [String]) async throws {
        try await post("/api/v1/progress/batch-delete", body: BatchDeleteRequest(ids: ids))
    }

    func clearHistory() async throws {
        try await delete("/api/v1/progress")
    }

    // MARK: Anime (library-backed)

    func playableEpisodes(bangumiID: Int) async throws -> PlayableEpisodesResponse {
        try await get("/api/v1/anime/\(bangumiID)/playable-episodes")
    }

    /// 1–10, or nil to clear.
    func setScore(bangumiID: Int, _ score: Int?) async throws {
        let _: EmptyResponse = try await patch("/api/v1/anime/\(bangumiID)/score", body: ScoreUpdate(score: score))
    }

    func setSyncFlags(bangumiID: Int, _ flags: SyncFlagsUpdate) async throws {
        let _: EmptyResponse = try await patch("/api/v1/anime/\(bangumiID)/sync-flags", body: flags)
    }

    // MARK: Notifications

    func notifications(category: MilmilNotification.Category = .all, limit: Int = 50, offset: Int = 0) async throws -> [MilmilNotification] {
        var items = [URLQueryItem(name: "limit", value: String(limit)), URLQueryItem(name: "offset", value: String(offset))]
        if category != .all { items.append(URLQueryItem(name: "filter", value: category.rawValue)) }
        return try await get("/api/v1/notifications", query: items)
    }

    func unreadNotificationCount() async throws -> Int {
        let result: UnreadCount = try await get("/api/v1/notifications/unread-count")
        return result.count
    }

    func markNotificationRead(id: String) async throws {
        let _: EmptyResponse = try await patch("/api/v1/notifications/\(id)/read", body: EmptyBody())
    }

    func markAllNotificationsRead() async throws {
        try await post("/api/v1/notifications/mark-all-read")
    }

    func clearNotifications() async throws {
        try await delete("/api/v1/notifications")
    }

    // MARK: Local search

    /// Fuzzy search over series in the library (⌘K's local section).
    func searchLibrary(_ query: String, limit: Int = 10) async throws -> [LocalSearchHit] {
        let result: LocalSearchResponse = try await get("/api/v1/search/anime", query: [
            URLQueryItem(name: "q", value: query),
            URLQueryItem(name: "limit", value: String(limit)),
        ])
        return result.items
    }
}

/// For endpoints that answer with a small JSON object we don't need, or 204.
public struct EmptyResponse: Decodable, Sendable {
    public init() {}
    public init(from decoder: any Decoder) throws {}
}
