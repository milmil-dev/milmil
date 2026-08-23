import Foundation
import MilmilAPI
import MilmilPlayer
import Observation

/// The main-actor snapshot SwiftUI reads. `PlayerController` folds mpv
/// events into it; timeline fields are throttled to ~10 Hz.
@Observable
final class PlayerState {
    enum Status: Equatable {
        case idle
        case loading(String)
        case playing
        case paused
        case buffering(percent: Int)
        case ended
        case failed(String)

        var isActive: Bool {
            switch self {
            case .playing, .paused, .buffering: true
            default: false
            }
        }
    }

    var status: Status = .idle
    var stage: StreamStage = .direct
    var mediaTitle = ""

    // Timeline
    var timePos: Double = 0
    var duration: Double = 0
    var cacheSeconds: Double = 0
    var isSeeking = false
    var clock = PlaybackClock()

    // Controls
    var paused = true
    var speed: Double = 1
    var volume: Double = 100
    var muted = false
    var subDelay: Double = 0
    var audioDelay: Double = 0
    var subtitlesVisible = true
    var abLoopA: Double?
    var abLoopB: Double?

    // Media
    var tracks: [MediaTrack] = []
    var chapters: [MediaChapter] = []
    var videoID: Int64?
    var audioID: Int64?
    var subtitleID: Int64?
    var secondarySubtitleID: Int64?
    var videoSize: CGSize = .zero
    var hwdec = ""
    var videoCodec = ""
    var audioCodec = ""
    var isHDR = false
    var fps: Double = 0
    var videoBitrate: Double = 0

    // Server-side extras
    var segments: [SegmentMark] = []
    var sidecarSubtitles: [SubtitleFile] = []
    var thumbnails: ThumbnailTrack?

    var remaining: Double { max(0, duration - timePos) }
    var fraction: Double { duration > 0 ? min(1, max(0, timePos / duration)) : 0 }
    var cacheFraction: Double { duration > 0 ? min(1, max(0, (timePos + cacheSeconds) / duration)) : 0 }

    var videoTracks: [MediaTrack] { tracks.filter { $0.kind == .video } }
    var audioTracks: [MediaTrack] { tracks.filter { $0.kind == .audio } }
    var subtitleTracks: [MediaTrack] { tracks.filter { $0.kind == .sub } }

    /// The segment (OP/ED) the playhead is currently inside, if any.
    var currentSegment: SegmentMark? {
        segments.first { timePos >= $0.startTime && timePos < $0.endTime }
    }

    var resolutionLabel: String {
        guard videoSize.height > 0 else { return "" }
        switch Int(videoSize.height) {
        case 2100...: return "4K"
        case 1000...: return "1080p"
        case 700...: return "720p"
        default: return "\(Int(videoSize.height))p"
        }
    }
}
