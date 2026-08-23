import Foundation

public extension APIClient {
    func libraries() async throws -> [Library] {
        let rows: [Library]? = try await get("/api/v1/libraries")
        return rows ?? []
    }

    func createLibrary(name: String, path: String, sourceType: String = "local", scanIntervalMinutes: Int = 60) async throws -> Library {
        struct Body: Encodable {
            let name: String
            let path: String
            let sourceType: String
            let scanIntervalMinutes: Int
            enum CodingKeys: String, CodingKey {
                case name, path
                case sourceType = "source_type"
                case scanIntervalMinutes = "scan_interval_minutes"
            }
        }
        return try await post("/api/v1/libraries", body: Body(name: name, path: path, sourceType: sourceType, scanIntervalMinutes: scanIntervalMinutes))
    }

    func deleteLibrary(id: String) async throws {
        try await delete("/api/v1/libraries/\(id)")
    }

    /// 202; progress arrives over the realtime stream as `scan:*` events.
    func scanLibrary(id: String) async throws {
        try await post("/api/v1/libraries/\(id)/scan")
    }

    func mediaFiles(
        libraryID: String, filter: MediaFileFilter = .all, query: String? = nil, page: Int = 1, perPage: Int = 50,
        sortBy: String = "filename", ascending: Bool = true
    ) async throws -> MediaFilesPage {
        var items = [
            URLQueryItem(name: "status", value: filter.rawValue),
            URLQueryItem(name: "page", value: String(page)),
            URLQueryItem(name: "per_page", value: String(perPage)),
            URLQueryItem(name: "sort_by", value: sortBy),
            URLQueryItem(name: "sort_order", value: ascending ? "asc" : "desc"),
        ]
        if let query, !query.isEmpty { items.append(URLQueryItem(name: "q", value: query)) }
        return try await get("/api/v1/libraries/\(libraryID)/media-files", query: items)
    }

    /// Manual match to a Bangumi subject + episode (both Bangumi ids).
    func matchMediaFile(id: String, bangumiID: Int, episodeID: Int) async throws {
        struct Body: Encodable {
            let bangumiID: Int
            let episodeID: Int
            enum CodingKeys: String, CodingKey {
                case bangumiID = "bangumi_id"
                case episodeID = "episode_id"
            }
        }
        try await put("/api/v1/media-files/\(id)/match", body: Body(bangumiID: bangumiID, episodeID: episodeID))
    }

    func unmatchMediaFile(id: String) async throws {
        try await delete("/api/v1/media-files/\(id)/match")
    }

    func deleteMediaFile(id: String) async throws {
        try await delete("/api/v1/media-files/\(id)")
    }
}
