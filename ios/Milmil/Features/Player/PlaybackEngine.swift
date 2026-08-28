import AVFoundation
import Combine
import MilmilAPI
import SwiftUI

/// What a backend can actually do. Present from the first day on purpose: the
/// macOS client shipped a screenshot button that silently did nothing for every
/// user, because its FFmpeg build carried no still-image encoder and no layer in
/// the app could ask.
enum Capability: Hashable {
    /// Styled ASS/SSA subtitles, not just the text.
    case assSubtitles
    case multiAudioTrack
    case screenshot
    case playbackSpeed
}

enum PlaybackStatus { case idle, buffering, playing, paused, ended, failed }

struct PlaybackState {
    var status: PlaybackStatus = .idle
    var position: Double = 0
    var duration: Double = 0
    var stage: StreamStage = .direct
    var speed: Float = 1
    var message: String?

    var fraction: Double { duration > 0 ? min(1, max(0, position / duration)) : 0 }
}

/// The seam an engine sits behind.
///
/// v1 is AVPlayer: native, hardware decoded, and it gets background audio and
/// picture-in-picture for free. `MilmilPlayer` cannot be reused yet because its
/// render layer is a `CAOpenGLLayer`, which is macOS-only — splitting that is
/// the work that would let libmpv land here, and it must not require touching
/// a single screen when it does.
@MainActor
protocol PlaybackEngine: AnyObject {
    var capabilities: Set<Capability> { get }
    var state: PlaybackState { get }

    /// The live position. `state` ticks once a second, which is fine for a
    /// clock and far too coarse for danmaku.
    func positionNow() -> Double

    func open(fileID: String, startAt: Double)
    func play()
    func pause()
    func seek(to seconds: Double)
    func setSpeed(_ speed: Float)
    func select(stage: StreamStage)
    func stop()
}
