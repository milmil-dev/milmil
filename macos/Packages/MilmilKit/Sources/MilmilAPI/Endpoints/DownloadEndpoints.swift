import Foundation

public extension APIClient {
    func downloads() async throws -> [Download] {
        let rows: [Download]? = try await get("/api/v1/downloads")
        return rows ?? []
    }

    /// Magnet / HTTP / torrent URL. 201 with the new row.
    func addDownload(url: String, name: String? = nil, saveDir: String? = nil) async throws -> Download {
        struct Body: Encodable {
            let url: String
            let name: String?
            let saveDir: String?
            enum CodingKeys: String, CodingKey {
                case url, name
                case saveDir = "save_dir"
            }
        }
        return try await post("/api/v1/downloads", body: Body(url: url, name: name, saveDir: saveDir))
    }

    func pauseDownload(gid: String) async throws {
        try await post("/api/v1/downloads/\(gid)/pause")
    }

    func resumeDownload(gid: String) async throws {
        try await post("/api/v1/downloads/\(gid)/resume")
    }

    func deleteDownload(gid: String, deleteFiles: Bool = false) async throws {
        try await delete("/api/v1/downloads/\(gid)", query: deleteFiles ? [URLQueryItem(name: "delete_files", value: "true")] : [])
    }

    /// Removes every download row (and optionally the files).
    func deleteAllDownloads(deleteFiles: Bool = false) async throws {
        try await delete("/api/v1/downloads", query: deleteFiles ? [URLQueryItem(name: "delete_files", value: "true")] : [])
    }
}
