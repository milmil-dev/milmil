package dev.milmil.android

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.milmil.android.player.Media3Engine
import dev.milmil.android.player.PlaybackState
import dev.milmil.android.player.PlaybackStatus
import dev.milmil.api.ApiClient
import dev.milmil.api.DanmakuComment
import dev.milmil.api.PlayableEpisode
import dev.milmil.api.danmaku
import dev.milmil.api.saveProgress
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Owns the engine for the length of one watch session, and is the only thing
 * that writes progress back. The three clients share one watch history, so the
 * throttle here matches the macOS one: every 10s while playing, plus a final
 * write when the screen goes away.
 */
public class PlayerViewModel(
    context: Context,
    private val client: ApiClient,
) : ViewModel() {

    private val sampleDanmaku = DanmakuSample.file(context)

    public val engine: Media3Engine = Media3Engine(context.applicationContext, client, viewModelScope)
    public val state: StateFlow<PlaybackState> = engine.state

    /**
     * Set when a write fails. Swallowing it is how a whole watch session once
     * went unsaved without a single sign on screen — the server takes whole
     * seconds and answered 400 to every float we sent.
     */
    private val _saveFailed = MutableStateFlow(false)
    public val saveFailed: StateFlow<Boolean> = _saveFailed.asStateFlow()

    private val _danmaku = MutableStateFlow<List<DanmakuComment>>(emptyList())
    public val danmaku: StateFlow<List<DanmakuComment>> = _danmaku.asStateFlow()

    private val exiting = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var episode: PlayableEpisode? = null
    private var lastWritten = 0.0

    public fun play(episode: PlayableEpisode, title: String) {
        this.episode = episode
        lastWritten = 0.0
        val resumeAt = episode.progress?.takeIf { it.resumable }?.positionSeconds ?: 0.0
        val fileId = checkNotNull(episode.mediaFile).id
        engine.open(
            fileId = fileId,
            startAtSeconds = resumeAt,
            title = title,
            subtitle = "第 ${episode.sort} 集 · ${episode.displayTitle}",
        )
        loadDanmaku(fileId)
        startReporting()
    }

    /**
     * Danmaku for this file. A server with no DandanPlay credentials answers
     * "file not matched", which is not an error worth showing — the episode
     * still plays, just without comments.
     */
    private fun loadDanmaku(fileId: String) {
        _danmaku.value = emptyList()
        viewModelScope.launch {
            val comments = DanmakuSample.load(sampleDanmaku)
                ?: runCatching { client.danmaku(fileId) }.getOrDefault(emptyList())
            // The overlay binary-searches by time, so the list has to be sorted.
            _danmaku.value = comments.sortedBy { it.time }
        }
    }

    private fun startReporting() {
        viewModelScope.launch {
            while (true) {
                delay(REPORT_INTERVAL_MILLIS)
                val current = state.value
                // An episode that reaches the end has to be recorded there and
                // then: the user may well swipe the app away rather than press
                // back, and the final write would never run.
                if (current.status == PlaybackStatus.Ended) {
                    write(current, completed = true)
                    return@launch
                }
                if (current.status != PlaybackStatus.Playing) continue
                // Nothing moved (or the user is scrubbing back and forth over
                // the same second) — do not spend a request on it.
                if (kotlin.math.abs(current.positionSeconds - lastWritten) < 1.0) continue
                write(current, completed = false)
            }
        }
    }

    /**
     * The final write, on the way out of the screen. Deliberately not on
     * [viewModelScope]: leaving the screen clears the view model, which would
     * cancel the one write that matters most.
     */
    public fun commit() {
        val current = state.value
        if (current.positionSeconds <= 0) return
        val completed = current.status == PlaybackStatus.Ended || current.fraction >= COMPLETE_AT
        // Not cancelled afterwards: commit runs again when the user moves to
        // the next episode, and a scope cancelled on the first write would
        // silently drop every one after it.
        exiting.launch { write(current, completed = completed) }
    }

    private suspend fun write(current: PlaybackState, completed: Boolean) {
        val target = episode ?: return
        val file = target.mediaFile ?: return
        runCatching {
            client.saveProgress(
                mediaFileId = file.id,
                episodeId = target.episodeId,
                positionSeconds = current.positionSeconds,
                durationSeconds = current.durationSeconds,
                completed = completed,
            )
        }.onSuccess {
            lastWritten = current.positionSeconds
            _saveFailed.value = false
        }.onFailure {
            _saveFailed.value = true
        }
    }

    override fun onCleared() {
        super.onCleared()
        engine.release()
    }

    private companion object {
        const val REPORT_INTERVAL_MILLIS = 10_000L
        const val COMPLETE_AT = 0.92f
    }
}
