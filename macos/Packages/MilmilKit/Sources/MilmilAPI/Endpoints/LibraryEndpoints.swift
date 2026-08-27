import Foundation

public extension APIClient {
    func libraries() async throws -> [Library] {
        let rows: [Library]? = try await get("/api/v1/libraries")
        return rows ?? []
    }

    func createLibrary(
        name: String, path: String, sourceType: String = "local",
        sourceConfig: LibrarySourceConfig? = nil, scanIntervalMinutes: Int = 60
    ) async throws -> Library {
        struct Body: Encodable {
            let name: String
            let path: String
            let sourceType: String
            let sourceConfig: LibrarySourceConfig?
            let scanIntervalMinutes: Int
            enum CodingKeys: String, CodingKey {
                case name, path
                case sourceType = "source_type"
                case sourceConfig = "source_config"
                case scanIntervalMinutes = "scan_interval_minutes"
            }
        }
        return try await post("/api/v1/libraries", body: Body(
            name: name, path: path, sourceType: sourceType, sourceConfig: sourceConfig, scanIntervalMinutes: scanIntervalMinutes
        ))
    }

    func updateLibrary(
        id: String, name: String, path: String, enabled: Bool,
        sourceType: String, sourceConfig: LibrarySourceConfig? = nil, scanIntervalMinutes: Int = 60
    ) async throws -> Library {
        struct Body: Encodable {
            let name: String
            let path: String
            let enabled: Bool
            let scanIntervalMinutes: Int
            let sourceType: String
            let sourceConfig: LibrarySourceConfig?
            enum CodingKeys: String, CodingKey {
                case name, path, enabled
                case scanIntervalMinutes = "scan_interval_minutes"
                case sourceType = "source_type"
                case sourceConfig = "source_config"
            }
        }
        return try await put("/api/v1/libraries/\(id)", body: Body(
            name: name, path: path, enabled: enabled, scanIntervalMinutes: scanIntervalMinutes,
            sourceType: sourceType, sourceConfig: sourceConfig
        ))
    }

    /// Validates a source's credentials server-side without creating anything.
    func testLibraryConnection(sourceType: String, sourceConfig: LibrarySourceConfig, path: String) async throws -> TestConnectionResult {
        try await post("/api/v1/libraries/test-connection", body: SourceProbe(sourceType: sourceType, sourceConfig: sourceConfig, path: path))
    }

    /// Lists the directories at `path` as seen by the server through `sourceType`.
    func browseLibrarySource(sourceType: String, sourceConfig: LibrarySourceConfig, path: String) async throws -> [BrowseEntry] {
        struct Response: Decodable { let directories: [BrowseEntry]? }
        let response: Response = try await post("/api/v1/libraries/browse", body: SourceProbe(sourceType: sourceType, sourceConfig: sourceConfig, path: path))
        return response.directories ?? []
    }

    /// Scans the server's LAN for SMB hosts/shares.
    func discoverNetwork() async throws -> [DiscoveredHost] {
        struct Response: Decodable { let hosts: [DiscoveredHost]? }
        let response: Response = try await get("/api/v1/libraries/discover-network")
        return response.hosts ?? []
    }

    /// Pre-configured rclone remotes for the OAuth backends (gdrive/onedrive/dropbox).
    func rcloneRemotes() async throws -> [RcloneRemote] {
        struct Response: Decodable { let remotes: [RcloneRemote]? }
        let response: Response = try await get("/api/v1/rclone/remotes")
        return response.remotes ?? []
    }

    func deleteLibrary(id: String) async throws {
        try await delete("/api/v1/libraries/\(id)")
    }

    /// 202; progress arrives over the realtime stream as `scan:*` events.
    func libraryCapacity(id: String) async throws -> LibraryCapacity {
        try await get("/api/v1/libraries/\(id)/capacity")
    }

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

/// Shared body for `test-connection` and `browse`.
private struct SourceProbe: Encodable {
    let sourceType: String
    let sourceConfig: LibrarySourceConfig
    let path: String
    enum CodingKeys: String, CodingKey {
        case path
        case sourceType = "source_type"
        case sourceConfig = "source_config"
    }
}
