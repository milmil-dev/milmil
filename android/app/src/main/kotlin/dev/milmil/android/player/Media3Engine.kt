package dev.milmil.android.player

import android.content.Context
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import dev.milmil.api.ApiClient
import dev.milmil.api.StreamFallback
import dev.milmil.api.StreamStage
import dev.milmil.api.mediaInfo
import dev.milmil.api.startTranscode
import dev.milmil.api.streamUrl
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * ExoPlayer behind [PlaybackEngine]. The ladder logic lives here rather than in
 * the screen: a rung failing is a playback event, and the UI only ever needs to
 * know which rung it ended up on.
 */
@OptIn(UnstableApi::class)
public class Media3Engine(
    context: Context,
    private val client: ApiClient,
    private val scope: CoroutineScope,
) : PlaybackEngine {

    /**
     * No ASS: Media3 renders the text but drops the styling, which is the known
     * cost of shipping v1 on ExoPlayer. No screenshot either — claiming one
     * would repeat exactly the macOS mistake this interface exists to prevent.
     */
    override val capabilities: Set<Capability> =
        setOf(Capability.MultiAudioTrack, Capability.PlaybackSpeed)

    private val _state = MutableStateFlow(PlaybackState())
    override val state: StateFlow<PlaybackState> = _state.asStateFlow()

    private val _tracks = MutableStateFlow<List<TrackOption>>(emptyList())
    override val tracks: StateFlow<List<TrackOption>> = _tracks.asStateFlow()

    private val exo: ExoPlayer = ExoPlayer.Builder(context).build().apply {
        addListener(Listener())
        playWhenReady = true
    }

    /**
     * Lock-screen and notification controls. Media3 wires the transport
     * controls itself once the player is attached; without a session the
     * episode plays with nothing on the lock screen, which the macOS client
     * gets from Now Playing for free.
     */
    private val session: MediaSession = MediaSession.Builder(context, exo).build()

    /** Handed to the AndroidView that draws the video. */
    public val player: Player get() = exo

    private var ladder = StreamFallback()
    private var fileId: String? = null
    private var title: String = ""
    private var subtitle: String = ""
    private var resumeSeconds = 0.0
    private var ticker: Job? = null
    private var opening: Job? = null

    override fun open(fileId: String, startAtSeconds: Double, title: String, subtitle: String) {
        this.fileId = fileId
        this.resumeSeconds = startAtSeconds
        this.title = title
        this.subtitle = subtitle
        _state.value = PlaybackState(status = PlaybackStatus.Buffering)
        opening?.cancel()
        opening = scope.launch {
            // Ask first: a file the server already knows it cannot remux should
            // not cost the user a failed open to discover that.
            val info = runCatching { client.mediaInfo(fileId) }.getOrNull()
            ladder = StreamFallback(
                canRemux = info?.canRemux ?: true,
                canTranscode = true,
            )
            if (info?.canDirectPlay == false) ladder.advance()
            openCurrentStage()
        }
        startTicking()
    }

    private suspend fun openCurrentStage() {
        val id = fileId ?: return
        val stage = ladder.current
        val url = if (stage == StreamStage.Hls) {
            runCatching { client.startTranscode(id) }.getOrElse {
                fail("轉碼開唔到：${it.message ?: "未知錯誤"}")
                return
            }
        } else {
            client.streamUrl(id, stage)
        }
        _state.value = _state.value.copy(
            status = PlaybackStatus.Buffering,
            stage = stage,
            message = null,
        )
        exo.setMediaItem(
            MediaItem.Builder()
                .setUri(url)
                .setMediaMetadata(
                    MediaMetadata.Builder().setTitle(subtitle).setArtist(title).build(),
                )
                .build(),
        )
        exo.prepare()
        if (resumeSeconds > 0) exo.seekTo((resumeSeconds * 1000).toLong())
    }

    /** A rung failed: drop to the next one, or give up and say which. */
    private fun fallBack(reason: String) {
        val next = ladder.advance()
        if (next == null) {
            fail(reason)
            return
        }
        // Keep the position: falling down a rung should not restart the episode.
        resumeSeconds = _state.value.positionSeconds
        scope.launch { openCurrentStage() }
    }

    private fun fail(reason: String) {
        _state.value = _state.value.copy(status = PlaybackStatus.Failed, message = reason)
    }

    override fun positionNow(): Double = exo.currentPosition.coerceAtLeast(0) / 1000.0

    override fun play() {
        exo.play()
    }

    override fun pause() {
        exo.pause()
    }

    override fun seekTo(seconds: Double) {
        exo.seekTo((seconds * 1000).toLong())
    }

    override fun setSpeed(speed: Float) {
        exo.setPlaybackSpeed(speed)
        _state.value = _state.value.copy(speed = speed)
    }

    override fun selectTrack(kind: TrackKind, id: String?) {
        val type = if (kind == TrackKind.Audio) C.TRACK_TYPE_AUDIO else C.TRACK_TYPE_TEXT
        val builder = exo.trackSelectionParameters.buildUpon()
            .clearOverridesOfType(type)
            .setTrackTypeDisabled(type, id == null)
        val group = exo.currentTracks.groups
            .filter { it.type == type }
            .firstOrNull { trackId(it) == id }
        if (group != null) {
            builder.addOverride(TrackSelectionOverride(group.mediaTrackGroup, 0))
        }
        exo.trackSelectionParameters = builder.build()
        publishTracks()
    }

    /**
     * ExoPlayer identifies a group by object, which cannot survive a UI event.
     * The group's own id plus its type is stable for as long as the file is
     * open, which is exactly as long as the picker exists.
     */
    private fun trackId(group: Tracks.Group): String = "${group.type}:${group.mediaTrackGroup.id}"

    private fun publishTracks() {
        _tracks.value = exo.currentTracks.groups
            .filter { it.type == C.TRACK_TYPE_AUDIO || it.type == C.TRACK_TYPE_TEXT }
            .map { group ->
                val format = group.mediaTrackGroup.getFormat(0)
                TrackOption(
                    id = trackId(group),
                    label = trackLabel(format),
                    kind = if (group.type == C.TRACK_TYPE_AUDIO) TrackKind.Audio else TrackKind.Subtitle,
                    selected = group.isSelected,
                )
            }
    }

    /** A track with no label at all still has to read as something. */
    private fun trackLabel(format: Format): String {
        format.label?.takeIf { it.isNotBlank() }?.let { return it }
        val language = format.language?.takeIf { it.isNotBlank() && it != "und" }
        return language?.let { java.util.Locale.forLanguageTag(it).displayName } ?: "音軌"
    }

    override fun selectStage(stage: StreamStage) {
        if (!ladder.select(stage)) return
        resumeSeconds = _state.value.positionSeconds
        scope.launch { openCurrentStage() }
    }

    override fun release() {
        ticker?.cancel()
        opening?.cancel()
        session.release()
        exo.release()
    }

    /**
     * ExoPlayer reports position by polling, not by callback, so the UI needs a
     * clock. One second is what a progress bar and a time label can tell apart.
     */
    private fun startTicking() {
        ticker?.cancel()
        ticker = scope.launch {
            while (true) {
                _state.value = _state.value.copy(
                    positionSeconds = exo.currentPosition.coerceAtLeast(0) / 1000.0,
                    durationSeconds = exo.duration.takeIf { it > 0 }?.div(1000.0) ?: 0.0,
                    bufferedSeconds = exo.bufferedPosition.coerceAtLeast(0) / 1000.0,
                )
                delay(TICK_MILLIS)
            }
        }
    }

    private inner class Listener : Player.Listener {
        override fun onPlaybackStateChanged(playbackState: Int) {
            val status = when (playbackState) {
                Player.STATE_BUFFERING -> PlaybackStatus.Buffering
                Player.STATE_READY -> if (exo.isPlaying) PlaybackStatus.Playing else PlaybackStatus.Paused
                Player.STATE_ENDED -> PlaybackStatus.Ended
                else -> _state.value.status
            }
            _state.value = _state.value.copy(status = status)
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            if (_state.value.status == PlaybackStatus.Failed) return
            _state.value = _state.value.copy(
                status = if (isPlaying) PlaybackStatus.Playing else PlaybackStatus.Paused,
            )
        }

        override fun onTracksChanged(tracks: Tracks) {
            publishTracks()
        }

        override fun onPlayerError(error: PlaybackException) {
            fallBack(error.errorCodeName)
        }
    }

    private companion object {
        const val TICK_MILLIS = 1000L
    }
}
