package dev.milmil.android.player

import android.content.Context
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
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

    private val exo: ExoPlayer = ExoPlayer.Builder(context).build().apply {
        addListener(Listener())
        playWhenReady = true
    }

    /** Handed to the AndroidView that draws the video. */
    public val player: Player get() = exo

    private var ladder = StreamFallback()
    private var fileId: String? = null
    private var resumeSeconds = 0.0
    private var ticker: Job? = null
    private var opening: Job? = null

    override fun open(fileId: String, startAtSeconds: Double) {
        this.fileId = fileId
        this.resumeSeconds = startAtSeconds
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
        exo.setMediaItem(MediaItem.fromUri(url))
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
    }

    override fun selectStage(stage: StreamStage) {
        if (!ladder.select(stage)) return
        resumeSeconds = _state.value.positionSeconds
        scope.launch { openCurrentStage() }
    }

    override fun release() {
        ticker?.cancel()
        opening?.cancel()
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

        override fun onPlayerError(error: PlaybackException) {
            fallBack(error.errorCodeName)
        }
    }

    private companion object {
        const val TICK_MILLIS = 1000L
    }
}
