package dev.milmil.android.player

import dev.milmil.api.StreamStage
import kotlinx.coroutines.flow.StateFlow

/**
 * What a backend can actually do. Present from the first day on purpose: the
 * macOS client shipped a screenshot button that silently did nothing for every
 * user, because its FFmpeg build carried no still-image encoder and no layer
 * in the app could ask. A UI that reads this cannot offer a control the engine
 * will not honour.
 */
public enum class Capability {
    /** Styled ASS/SSA subtitles, not just the text. Media3 renders these poorly. */
    AssSubtitles,

    /** More than one audio track, selectable while playing. */
    MultiAudioTrack,

    /** A still frame of what is on screen. */
    Screenshot,

    /** Playback speeds other than 1×. */
    PlaybackSpeed,
}

/**
 * One selectable audio or subtitle track. `id` is opaque to the UI — the
 * engine decides what identifies a track, because libmpv and ExoPlayer do not
 * agree on that and the screens must not care.
 */
public data class TrackOption(
    val id: String,
    val label: String,
    val kind: TrackKind,
    val selected: Boolean,
)

public enum class TrackKind { Audio, Subtitle }

/** Where playback is, as coarse as the UI needs it to be. */
public enum class PlaybackStatus { Idle, Buffering, Playing, Paused, Ended, Failed }

public data class PlaybackState(
    val status: PlaybackStatus = PlaybackStatus.Idle,
    val positionSeconds: Double = 0.0,
    val durationSeconds: Double = 0.0,
    val bufferedSeconds: Double = 0.0,
    val stage: StreamStage = StreamStage.Direct,
    val speed: Float = 1f,
    val message: String? = null,
) {
    public val fraction: Float
        get() = if (durationSeconds > 0) (positionSeconds / durationSeconds).toFloat().coerceIn(0f, 1f) else 0f
}

/**
 * The seam Media3 sits behind. v1 is ExoPlayer because it is native, hardware
 * decoded and gets background playback for free; ASS subtitle styling is the
 * known cost. Swapping in libmpv later must not touch a single screen, so
 * nothing above this interface may name ExoPlayer.
 */
public interface PlaybackEngine {
    public val capabilities: Set<Capability>
    public val state: StateFlow<PlaybackState>

    /** Audio and subtitle tracks the current file offers, once it has opened. */
    public val tracks: StateFlow<List<TrackOption>>

    /**
     * Open a file, resuming at [startAtSeconds]. Walks the ladder on failure.
     * [title] and [subtitle] are what the lock screen shows.
     */
    public fun open(fileId: String, startAtSeconds: Double, title: String, subtitle: String)

    /**
     * The live position, for callers that redraw per frame. [state] only ticks
     * once a second, which is fine for a clock and far too coarse for danmaku.
     */
    public fun positionNow(): Double

    public fun play()
    public fun pause()
    public fun seekTo(seconds: Double)
    public fun setSpeed(speed: Float)

    /** Switch to one track; passing a subtitle id of null turns them off. */
    public fun selectTrack(kind: TrackKind, id: String?)

    /** Jump to a rung the user picked; later failures still fall from there. */
    public fun selectStage(stage: StreamStage)

    public fun release()
}
