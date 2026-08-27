import Foundation

public extension APIClient {
    /// Files, sidecar subtitles and danmaku for keeping a series on disk.
    /// Servers before this route answer 404; callers fall back to
    /// `playableEpisodes` + `directStreamURL`.
    func offlineManifest(bangumiID: Int) async throws -> OfflineManifest {
        try await get("/api/v1/anime/\(bangumiID)/offline-manifest")
    }
}
