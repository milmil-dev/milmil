import Foundation

public extension APIClient {
    // MARK: Feeds

    func rssFeeds() async throws -> [RSSFeed] {
        let rows: [RSSFeed]? = try await get("/api/v1/rss-feeds")
        return rows ?? []
    }

    func createRSSFeed(name: String, url: String, type: String, enabled: Bool = true, fetchIntervalMinutes: Int = 30) async throws -> RSSFeed {
        try await post("/api/v1/rss-feeds", body: FeedBody(name: name, url: url, type: type, enabled: enabled, fetchIntervalMinutes: fetchIntervalMinutes))
    }

    func updateRSSFeed(_ feed: RSSFeed) async throws {
        try await put("/api/v1/rss-feeds/\(feed.id)", body: FeedBody(
            name: feed.name, url: feed.url, type: feed.type, enabled: feed.enabled, fetchIntervalMinutes: feed.fetchIntervalMinutes
        ))
    }

    func deleteRSSFeed(id: String) async throws {
        try await delete("/api/v1/rss-feeds/\(id)")
    }

    /// Fetches the feed now and runs its rules.
    func refreshRSSFeed(id: String) async throws {
        try await post("/api/v1/rss-feeds/\(id)/refresh")
    }

    /// What the feed currently lists; with `ruleID`, which entries that rule would take.
    func previewRSSFeed(id: String, ruleID: String? = nil) async throws -> RSSPreview {
        try await get("/api/v1/rss-feeds/\(id)/preview", query: ruleID.map { [URLQueryItem(name: "rule_id", value: $0)] } ?? [])
    }

    /// Preview a feed URL that is not saved yet.
    func previewRSSURL(_ url: String) async throws -> RSSPreview {
        struct Body: Encodable { let url: String }
        return try await post("/api/v1/rss-feeds/preview-url", body: Body(url: url))
    }

    // MARK: Rules

    func downloadRules() async throws -> [DownloadRule] {
        let rows: [DownloadRule]? = try await get("/api/v1/download-rules")
        return rows ?? []
    }

    func createDownloadRule(_ input: DownloadRuleInput) async throws -> DownloadRule {
        try await post("/api/v1/download-rules", body: input)
    }

    func updateDownloadRule(id: String, _ input: DownloadRuleInput) async throws {
        try await put("/api/v1/download-rules/\(id)", body: input)
    }

    func deleteDownloadRule(id: String) async throws {
        try await delete("/api/v1/download-rules/\(id)")
    }

    // MARK: Torrents

    func torrentProviders() async throws -> [String] {
        let rows: [String]? = try await get("/api/v1/torrent-search/providers")
        return rows ?? []
    }

    func searchTorrents(_ query: String, source: String? = nil) async throws -> [TorrentResult] {
        var items = [URLQueryItem(name: "q", value: query)]
        if let source, !source.isEmpty, source != "all" { items.append(URLQueryItem(name: "source", value: source)) }
        let rows: [TorrentResult]? = try await get("/api/v1/torrent-search", query: items)
        return rows ?? []
    }

    /// Torrents the server finds for a known title (its own name variants), optionally from one source.
    func animeTorrents(bangumiID: Int, source: String? = nil) async throws -> [TorrentResult] {
        struct Envelope: Decodable { let results: [TorrentResult]? }
        let query = source.flatMap { $0.isEmpty || $0 == "all" ? nil : [URLQueryItem(name: "source", value: $0)] } ?? []
        let envelope: Envelope = try await get("/api/v1/discover/anime/\(bangumiID)/torrents", query: query)
        return envelope.results ?? []
    }

    /// Adds a search hit to the downloader (same as `addDownload`, but the
    /// server names the task after the torrent title).
    func addTorrent(url: String, name: String) async throws {
        struct Body: Encodable { let url: String, name: String }
        try await post("/api/v1/torrent-search/add", body: Body(url: url, name: name))
    }

    func subscribe(_ input: SubscribeInput) async throws -> SubscribeResponse {
        try await post("/api/v1/subscribe", body: input)
    }
}

private struct FeedBody: Encodable {
    let name: String
    let url: String
    let type: String
    let enabled: Bool
    let fetchIntervalMinutes: Int

    enum CodingKeys: String, CodingKey {
        case name, url, type, enabled
        case fetchIntervalMinutes = "fetch_interval_minutes"
    }
}
