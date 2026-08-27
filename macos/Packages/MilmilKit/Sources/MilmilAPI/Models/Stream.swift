import Foundation

/// `GET /media-files/{id}/info`. The `can_*` flags are browser logic; mpv
/// only cares about `library_online` and the codec names for display.
public struct MediaInfo: Decodable, Sendable, Hashable {
    public let id: String
    public let filename: String
    public let sizeBytes: Int64
    public let container: String
    public let videoCodec: String?
    public let audioCodec: String?
    public let width: Int?
    public let height: Int?
    public let durationSeconds: Int?
    public let canDirectPlay: Bool
    public let canRemux: Bool
    public let needsTranscode: Bool
    public let libraryOnline: Bool
    public let libraryType: String

    enum CodingKeys: String, CodingKey {
        case id, filename, container, width, height
        case sizeBytes = "size_bytes"
        case videoCodec = "video_codec"
        case audioCodec = "audio_codec"
        case durationSeconds = "duration_seconds"
        case canDirectPlay = "can_direct_play"
        case canRemux = "can_remux"
        case needsTranscode = "needs_transcode"
        case libraryOnline = "library_online"
        case libraryType = "library_type"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        filename = try c.decodeIfPresent(String.self, forKey: .filename) ?? ""
        sizeBytes = try c.decodeIfPresent(Int64.self, forKey: .sizeBytes) ?? 0
        container = try c.decodeIfPresent(String.self, forKey: .container) ?? ""
        videoCodec = try c.decodeIfPresent(String.self, forKey: .videoCodec).nonEmpty
        audioCodec = try c.decodeIfPresent(String.self, forKey: .audioCodec).nonEmpty
        width = try c.decodeIfPresent(Int.self, forKey: .width)
        height = try c.decodeIfPresent(Int.self, forKey: .height)
        durationSeconds = try c.decodeIfPresent(Int.self, forKey: .durationSeconds)
        canDirectPlay = (try? c.decode(LenientBool.self, forKey: .canDirectPlay).wrappedValue) ?? true
        canRemux = (try? c.decode(LenientBool.self, forKey: .canRemux).wrappedValue) ?? true
        needsTranscode = (try? c.decode(LenientBool.self, forKey: .needsTranscode).wrappedValue) ?? false
        libraryOnline = (try? c.decode(LenientBool.self, forKey: .libraryOnline).wrappedValue) ?? true
        // The server treats "" as local for legacy libraries.
        libraryType = (try c.decodeIfPresent(String.self, forKey: .libraryType)).nonEmpty ?? "local"
    }
}

/// `POST /stream/{id}/transcode` → 202.
public struct TranscodeStart: Decodable, Sendable, Hashable {
    public let token: String
    /// `pending` | `ready` | `error`
    public let status: String
}

/// `GET /stream/hls/{token}/master.m3u8` while not ready (202).
public struct TranscodeStatus: Decodable, Sendable, Hashable {
    public let status: String
    public let progress: Int?
}

public enum TranscodeState: Sendable, Hashable {
    case pending(progress: Int?)
    case ready
    case failed
}

/// `GET /media/{fileId}/segments` — OP/ED marks.
public struct SegmentMark: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    /// `op` | `ed` | `recap` | `preview`
    public let type: String
    public let startTime: Double
    public let endTime: Double
    public let source: String

    enum CodingKeys: String, CodingKey {
        case id, type, source
        case startTime = "start_time"
        case endTime = "end_time"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
        type = try c.decodeIfPresent(String.self, forKey: .type) ?? ""
        startTime = try c.decodeIfPresent(Double.self, forKey: .startTime) ?? 0
        endTime = try c.decodeIfPresent(Double.self, forKey: .endTime) ?? 0
        source = try c.decodeIfPresent(String.self, forKey: .source) ?? ""
    }

    public init(id: String, type: String, startTime: Double, endTime: Double, source: String = "manual") {
        self.id = id
        self.type = type
        self.startTime = startTime
        self.endTime = endTime
        self.source = source
    }

    public var label: String {
        switch type {
        case "op": "OP"
        case "ed": "ED"
        case "recap": "回顧"
        case "preview": "預告"
        default: type.uppercased()
        }
    }
}

/// `GET /subtitles/media/{fileId}` rows.
public struct SubtitleFile: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let mediaFileID: String
    public let path: String
    public let language: String
    public let format: String
    public let source: String

    enum CodingKeys: String, CodingKey {
        case id, path, language, format, source
        case mediaFileID = "media_file_id"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        mediaFileID = try c.decodeIfPresent(String.self, forKey: .mediaFileID) ?? ""
        path = try c.decodeIfPresent(String.self, forKey: .path) ?? ""
        language = try c.decodeIfPresent(String.self, forKey: .language) ?? ""
        format = try c.decodeIfPresent(String.self, forKey: .format) ?? ""
        source = try c.decodeIfPresent(String.self, forKey: .source) ?? ""
    }

    public var filename: String { (path as NSString).lastPathComponent }
}
