import Foundation

/// `/api/v1/rss-feeds` row. `type` is `mikan` / `nyaa` / `dmhy` / `custom`.
public struct RSSFeed: Codable, Sendable, Identifiable, Hashable {
    public let id: String
    public var name: String
    public var url: String
    public var type: String
    @LenientBool public var enabled: Bool
    public var fetchIntervalMinutes: Int
    @LenientDate public var lastFetchedAt: Date?
    @LenientDate public var createdAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, name, url, type, enabled
        case fetchIntervalMinutes = "fetch_interval_minutes"
        case lastFetchedAt = "last_fetched_at"
        case createdAt = "created_at"
    }

    public static let types = ["mikan", "nyaa", "dmhy", "custom"]
}

/// `/api/v1/download-rules` row. Matching happens server-side on every feed
/// refresh: `filterRegex` / `excludeRegex` on the title, then resolution,
/// sub-group list (comma separated), seeders, and — when `episodeFilter ==
/// "range"` — `episodeRange` ("1-12").
public struct DownloadRule: Codable, Sendable, Identifiable, Hashable {
    public let id: String
    public var name: String
    @LenientBool public var enabled: Bool
    public var rssFeedID: String
    public var filterRegex: String
    public var excludeRegex: String
    public var saveDir: String
    public var episodeOffset: Int
    public var resolutionFilter: String
    public var subgroupFilter: String
    public var minSeeders: Int
    public var matchMode: String
    public var episodeFilter: String
    public var episodeRange: String
    public var libraryID: String?
    public var bangumiID: Int?
    @LenientDate public var lastTriggeredAt: Date?
    @LenientDate public var createdAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, name, enabled
        case rssFeedID = "rss_feed_id"
        case filterRegex = "filter_regex"
        case excludeRegex = "exclude_regex"
        case saveDir = "save_dir"
        case episodeOffset = "episode_offset"
        case resolutionFilter = "resolution_filter"
        case subgroupFilter = "subgroup_filter"
        case minSeeders = "min_seeders"
        case matchMode = "match_mode"
        case episodeFilter = "episode_filter"
        case episodeRange = "episode_range"
        case libraryID = "library_id"
        case bangumiID = "bangumi_id"
        case lastTriggeredAt = "last_triggered_at"
        case createdAt = "created_at"
    }

    public static let matchModes = ["fuzzy", "exact"]
    public static let episodeFilters = ["all", "new", "range"]
    public static let resolutions = ["", "2160p", "1080p", "720p"]
}

/// Everything the server accepts on create / update of a rule (the web's
/// `RuleFormValues`). `enabled` goes out as the API's 0/1.
public struct DownloadRuleInput: Encodable, Sendable, Equatable {
    public var name = ""
    public var enabled = true
    public var rssFeedID = ""
    public var filterRegex = ""
    public var excludeRegex = ""
    public var saveDir = ""
    public var episodeOffset = 0
    public var resolutionFilter = ""
    public var subgroupFilter = ""
    public var minSeeders = 0
    public var matchMode = "fuzzy"
    public var episodeFilter = "all"
    public var episodeRange = ""
    public var libraryID = ""
    public var bangumiID: Int?

    public init() {}

    public init(_ rule: DownloadRule) {
        name = rule.name
        enabled = rule.enabled
        rssFeedID = rule.rssFeedID
        filterRegex = rule.filterRegex
        excludeRegex = rule.excludeRegex
        saveDir = rule.saveDir
        episodeOffset = rule.episodeOffset
        resolutionFilter = rule.resolutionFilter
        subgroupFilter = rule.subgroupFilter
        minSeeders = rule.minSeeders
        matchMode = rule.matchMode.isEmpty ? "fuzzy" : rule.matchMode
        episodeFilter = rule.episodeFilter.isEmpty ? "all" : rule.episodeFilter
        episodeRange = rule.episodeRange
        libraryID = rule.libraryID ?? ""
        bangumiID = rule.bangumiID
    }

    enum CodingKeys: String, CodingKey {
        case name, enabled
        case rssFeedID = "rss_feed_id"
        case filterRegex = "filter_regex"
        case excludeRegex = "exclude_regex"
        case saveDir = "save_dir"
        case episodeOffset = "episode_offset"
        case resolutionFilter = "resolution_filter"
        case subgroupFilter = "subgroup_filter"
        case minSeeders = "min_seeders"
        case matchMode = "match_mode"
        case episodeFilter = "episode_filter"
        case episodeRange = "episode_range"
        case libraryID = "library_id"
        case bangumiID = "bangumi_id"
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(name, forKey: .name)
        try c.encode(enabled ? 1 : 0, forKey: .enabled)
        try c.encode(rssFeedID, forKey: .rssFeedID)
        try c.encode(filterRegex, forKey: .filterRegex)
        try c.encode(excludeRegex, forKey: .excludeRegex)
        try c.encode(saveDir, forKey: .saveDir)
        try c.encode(episodeOffset, forKey: .episodeOffset)
        try c.encode(resolutionFilter, forKey: .resolutionFilter)
        try c.encode(subgroupFilter, forKey: .subgroupFilter)
        try c.encode(minSeeders, forKey: .minSeeders)
        try c.encode(matchMode, forKey: .matchMode)
        try c.encode(episodeFilter, forKey: .episodeFilter)
        try c.encode(episodeRange, forKey: .episodeRange)
        try c.encode(libraryID, forKey: .libraryID)
        try c.encodeIfPresent(bangumiID, forKey: .bangumiID)
    }
}

/// One feed entry as the preview endpoints return it; `alreadyDownloaded`
/// is matched against existing download rows.
public struct RSSPreviewItem: Codable, Sendable, Identifiable, Hashable {
    public let title: String
    public let link: String
    public let episode: String
    public let subgroup: String
    public let size: String
    public let publishDate: String
    @LenientBool public var alreadyDownloaded: Bool

    public var id: String { link.isEmpty ? title : link }

    enum CodingKeys: String, CodingKey {
        case title, link, episode, subgroup, size
        case publishDate = "publish_date"
        case alreadyDownloaded = "already_downloaded"
    }
}

public struct RSSPreview: Codable, Sendable {
    public let items: [RSSPreviewItem]
    public let total: Int
    public let matched: Int
}

/// A hit from `/torrent-search` or `/discover/anime/{id}/torrents`. The
/// server omits empty strings, so everything but the title is defaulted.
public struct TorrentResult: Codable, Sendable, Identifiable, Hashable {
    public let title: String
    public let magnet: String
    public let torrentURL: String
    public let size: String
    public let seeders: Int
    public let leechers: Int
    public let publishDate: Date?
    public let subGroup: String
    public let infoHash: String
    public let sourceSite: String

    /// What to hand the downloader: magnet first, `.torrent` URL otherwise.
    public var downloadURL: String { magnet.isEmpty ? torrentURL : magnet }
    public var id: String { infoHash.isEmpty ? downloadURL : infoHash }

    enum CodingKeys: String, CodingKey {
        case title, magnet, size, seeders, leechers
        case torrentURL = "torrent_url"
        case publishDate = "publish_date"
        case subGroup = "sub_group"
        case infoHash = "info_hash"
        case sourceSite = "source_site"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
        magnet = try c.decodeIfPresent(String.self, forKey: .magnet) ?? ""
        torrentURL = try c.decodeIfPresent(String.self, forKey: .torrentURL) ?? ""
        size = try c.decodeIfPresent(String.self, forKey: .size) ?? ""
        seeders = try c.decodeIfPresent(Int.self, forKey: .seeders) ?? 0
        leechers = try c.decodeIfPresent(Int.self, forKey: .leechers) ?? 0
        // Go's zero time ("0001-01-01T00:00:00Z") means unknown.
        publishDate = (try? c.decodeIfPresent(Date.self, forKey: .publishDate)).flatMap { $0.timeIntervalSince1970 > 0 ? $0 : nil }
        subGroup = try c.decodeIfPresent(String.self, forKey: .subGroup) ?? ""
        infoHash = try c.decodeIfPresent(String.self, forKey: .infoHash) ?? ""
        sourceSite = try c.decodeIfPresent(String.self, forKey: .sourceSite) ?? ""
    }

    public static let sources = ["nyaa", "dmhy", "mikan", "bangumi.moe", "acg.rip", "dandanplay"]
    /// Sources that also serve an RSS feed the server can subscribe to.
    public static let rssSources = ["mikan", "nyaa", "dmhy"]
}

/// `POST /subscribe`: creates a feed for `source` + a rule in one go.
public struct SubscribeInput: Encodable, Sendable, Equatable {
    public var animeName: String
    public var source: String
    public var query: String?
    public var mikanBangumiID: String?
    public var subGroup: String?
    public var resolution: String?
    public var libraryID: String?
    public var bangumiID: Int?

    public init(animeName: String, source: String, query: String? = nil, mikanBangumiID: String? = nil,
                subGroup: String? = nil, resolution: String? = nil, libraryID: String? = nil, bangumiID: Int? = nil) {
        self.animeName = animeName
        self.source = source
        self.query = query
        self.mikanBangumiID = mikanBangumiID
        self.subGroup = subGroup
        self.resolution = resolution
        self.libraryID = libraryID
        self.bangumiID = bangumiID
    }

    enum CodingKeys: String, CodingKey {
        case source, query, resolution
        case animeName = "anime_name"
        case mikanBangumiID = "mikan_bangumi_id"
        case subGroup = "sub_group"
        case libraryID = "library_id"
        case bangumiID = "bangumi_id"
    }
}

public struct SubscribeResponse: Codable, Sendable {
    public let feed: RSSFeed
    public let rule: DownloadRule
}
