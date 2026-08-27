import Foundation
import MilmilAPI

/// Where a kept episode stands on disk.
enum OfflineState: String, Codable, Sendable {
    case queued, downloading, paused, done, failed
}

/// A subtitle file saved next to the video (`<fileID>.<index>.<ext>`).
struct OfflineSidecar: Codable, Hashable, Sendable {
    var filename: String
    var language: String?
    var title: String?
}

/// One episode kept on this Mac. Keyed by the server's media file id, so a
/// file that moves or gets re-matched on the server keeps its copy.
struct OfflineEntry: Codable, Identifiable, Hashable, Sendable {
    var fileID: String
    var bangumiID: Int
    var seriesTitle: String
    var episodeID: String
    var episodeNumber: Double
    var episodeTitle: String?
    var container: String
    var sourceURL: URL
    var etag: String?
    /// Expected total; 0 until the server says.
    var sizeBytes: Int64
    var downloadedBytes: Int64 = 0
    var state: OfflineState = .queued
    var pinned = false
    var queuedAt = Date()
    var downloadedAt: Date?
    var lastPlayedAt: Date?
    var subtitles: [OfflineSidecar] = []
    var subtitleSources: [SidecarSource] = []
    var danmakuURL: URL?
    var hasDanmaku = false
    var error: String?
    /// `cancel(byProducingResumeData:)` output for a paused / interrupted task.
    var resumeData: Data?

    var id: String { fileID }
    var filename: String { "\(fileID).\(container)" }

    var fraction: Double {
        guard sizeBytes > 0 else { return state == .done ? 1 : 0 }
        return min(1, Double(downloadedBytes) / Double(sizeBytes))
    }

    /// "12" / "12.5".
    var number: String {
        episodeNumber.rounded() == episodeNumber ? String(Int(episodeNumber)) : String(episodeNumber)
    }

    /// A subtitle still to fetch once the video has landed.
    struct SidecarSource: Codable, Hashable, Sendable {
        var index: Int
        var url: URL
        var language: String?
        var title: String?
    }
}

struct OfflineIndex: Codable, Sendable {
    var entries: [OfflineEntry] = []
}

/// What `keep` needs to know about an episode; built from the server's
/// offline manifest or, on older servers, from the playable list.
struct OfflineRequest: Sendable {
    var bangumiID: Int
    var seriesTitle: String
    var episodeID: String
    var episodeNumber: Double
    var episodeTitle: String?
    var fileID: String
    var container: String
    var sourceURL: URL
    var sizeBytes: Int64
    var etag: String?
    var subtitles: [OfflineEntry.SidecarSource] = []
    var danmakuURL: URL?

    static func from(_ manifest: OfflineManifest) -> [OfflineRequest] {
        manifest.episodes.map { episode in
            OfflineRequest(
                bangumiID: manifest.bangumiID, seriesTitle: manifest.title, episodeID: episode.episodeID,
                episodeNumber: episode.number, episodeTitle: episode.title, fileID: episode.file.id,
                container: episode.file.container, sourceURL: episode.file.url, sizeBytes: episode.file.sizeBytes,
                etag: episode.file.etag,
                subtitles: episode.subtitles.map { .init(index: $0.index, url: $0.url, language: $0.language, title: $0.title) },
                danmakuURL: episode.danmakuURL
            )
        }
    }

    /// Older servers: the playable list plus the direct stream route (no
    /// sidecars — the server has no manifest to list them).
    static func from(_ episodes: [PlayableEpisode], bangumiID: Int, title: String, client: APIClient) -> [OfflineRequest] {
        episodes.compactMap { episode in
            guard let file = episode.mediaFile else { return nil }
            let ext = (file.filename as NSString).pathExtension
            return OfflineRequest(
                bangumiID: bangumiID, seriesTitle: title, episodeID: episode.episodeID, episodeNumber: episode.sort,
                episodeTitle: episode.displayTitle, fileID: file.id, container: ext.isEmpty ? "mkv" : ext.lowercased(),
                sourceURL: client.directStreamURL(fileID: file.id), sizeBytes: Int64(file.sizeBytes ?? 0), etag: nil
            )
        }
    }
}
