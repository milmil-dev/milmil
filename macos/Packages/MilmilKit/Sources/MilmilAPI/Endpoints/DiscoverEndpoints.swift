import Foundation

// Mirrors web/src/lib/api/discover.ts. All public (no token) except `/torrents`,
// which lands with the downloads work.
public extension APIClient {
    /// `GET /api/v1/discover/calendar` — seven days, JST air times.
    func calendar() async throws -> [CalendarDay] {
        try await get("/api/v1/discover/calendar")
    }

    /// `GET /api/v1/discover/trending?page=` — 1-based, provider-paged.
    func trending(page: Int = 1) async throws -> [AnimeSummary] {
        try await get("/api/v1/discover/trending", query: [URLQueryItem(name: "page", value: String(page))])
    }

    /// `GET /api/v1/discover/search?q=` — Bangumi/AniList full-text search.
    func searchAnime(_ query: String, adult: Bool = false) async throws -> [AnimeSummary] {
        var items = [URLQueryItem(name: "q", value: query)]
        if adult { items.append(URLQueryItem(name: "adult", value: "true")) }
        return try await get("/api/v1/discover/search", query: items)
    }

    func browse(_ query: BrowseQuery) async throws -> [AnimeSummary] {
        try await get("/api/v1/discover/browse", query: query.queryItems)
    }

    func browse(tag: String, sort: BrowseQuery.Sort = .popularity, page: Int = 1) async throws -> [AnimeSummary] {
        try await get("/api/v1/discover/browse/tag", query: [
            URLQueryItem(name: "tag", value: tag),
            URLQueryItem(name: "sort", value: sort.queryValue),
            URLQueryItem(name: "page", value: String(page)),
        ])
    }

    func hotTags(category: String? = nil) async throws -> [HotTag] {
        try await get("/api/v1/discover/tags/popular", query: category.map { [URLQueryItem(name: "category", value: $0)] } ?? [])
    }

    /// `id` is a Bangumi id, or `al-<anilistID>` for AniList-only entries.
    func animeDetail(_ id: String, refresh: Bool = false) async throws -> AnimeDetail {
        try await get("/api/v1/discover/anime/\(id)", query: refresh ? [URLQueryItem(name: "refresh", value: "true")] : [])
    }

    func animeDetail(bangumiID: Int, refresh: Bool = false) async throws -> AnimeDetail {
        try await animeDetail(String(bangumiID), refresh: refresh)
    }

    func discoverEpisodes(bangumiID: Int, refresh: Bool = false) async throws -> [DiscoverEpisode] {
        try await get("/api/v1/discover/anime/\(bangumiID)/episodes", query: refresh ? [URLQueryItem(name: "refresh", value: "true")] : [])
    }

    /// Detail / episode list with their raw bodies, for the series page's
    /// disk cache.
    func animeDetailSnapshot(bangumiID: Int) async throws -> Snapshot<AnimeDetail> {
        try await getSnapshot("/api/v1/discover/anime/\(bangumiID)")
    }

    func discoverEpisodesSnapshot(bangumiID: Int) async throws -> Snapshot<[DiscoverEpisode]> {
        try await getSnapshot("/api/v1/discover/anime/\(bangumiID)/episodes")
    }

    func bangumiComments(bangumiID: Int) async throws -> [BangumiComment] {
        try await get("/api/v1/discover/anime/\(bangumiID)/comments")
    }

    func franchise(bangumiID: Int) async throws -> FranchiseResult {
        try await get("/api/v1/discover/anime/\(bangumiID)/franchise")
    }

    /// `GET /api/v1/discover/resolve?anilist_id=` — the Bangumi id for an
    /// AniList-only entry, once one exists. 404 when there is no match yet.
    func resolveAnilist(anilistID: Int) async throws -> Int {
        struct Response: Decodable {
            let bangumiID: Int
            enum CodingKeys: String, CodingKey { case bangumiID = "bangumi_id" }
        }
        let response: Response = try await get("/api/v1/discover/resolve", query: [URLQueryItem(name: "anilist_id", value: String(anilistID))])
        return response.bangumiID
    }
}
