import Foundation

public extension APIClient {
    func mediaInfo(fileID: String) async throws -> MediaInfo {
        try await get("/api/v1/media-files/\(fileID)/info")
    }

    func segments(fileID: String) async throws -> [SegmentMark] {
        try await get("/api/v1/media/\(fileID)/segments")
    }

    func subtitles(fileID: String) async throws -> [SubtitleFile] {
        try await get("/api/v1/subtitles/media/\(fileID)")
    }

    func startTranscode(fileID: String, codec: String = "h264", resolution: String = "1080p") async throws -> TranscodeStart {
        struct Body: Encodable { let codec: String; let resolution: String }
        return try await post("/api/v1/stream/\(fileID)/transcode", body: Body(codec: codec, resolution: resolution))
    }

    /// Polls the HLS master playlist: 202 + JSON while ffmpeg runs, 200 + m3u8 when ready.
    func transcodeState(token: String) async throws -> TranscodeState {
        let (status, data) = try await raw("GET", "/api/v1/stream/hls/\(token)/master.m3u8")
        switch status {
        case 200:
            return .ready
        case 202:
            let body = try? JSONDecoder().decode(TranscodeStatus.self, from: data)
            if body?.status == "error" { return .failed }
            return .pending(progress: body?.progress)
        default:
            return .failed
        }
    }

    // MARK: - URLs mpv opens itself

    /// `GET /stream/{id}/direct` — Bearer goes in mpv's `http-header-fields`.
    nonisolated func directStreamURL(fileID: String) -> URL {
        baseURL.appending(path: "api/v1/stream/\(fileID)/direct")
    }

    nonisolated func remuxStreamURL(fileID: String) -> URL {
        baseURL.appending(path: "api/v1/stream/\(fileID)/remux")
    }

    nonisolated func hlsURL(token: String) -> URL {
        baseURL.appending(path: "api/v1/stream/hls/\(token)/master.m3u8")
    }

    /// Thumbnail VTT; the sprite URLs inside are relative and unauthenticated
    /// (the server treats `?token=` on the sprite as the credential).
    nonisolated func thumbnailsURL(fileID: String, token: String?) -> URL? {
        guard let token else { return nil }
        var components = URLComponents(url: baseURL.appending(path: "api/v1/stream/\(fileID)/thumbnails"), resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "token", value: token)]
        return components?.url
    }

    nonisolated func spriteURL(fileID: String, token: String?) -> URL? {
        guard let token else { return nil }
        var components = URLComponents(url: baseURL.appending(path: "api/v1/stream/\(fileID)/sprite.jpg"), resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "token", value: token)]
        return components?.url
    }

    /// Sidecar subtitle as WebVTT, for mpv `sub-add`.
    nonisolated func subtitleContentURL(id: String, token: String?) -> URL? {
        guard let token else { return nil }
        var components = URLComponents(url: baseURL.appending(path: "api/v1/subtitles/\(id)/content"), resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "token", value: token)]
        return components?.url
    }
}
