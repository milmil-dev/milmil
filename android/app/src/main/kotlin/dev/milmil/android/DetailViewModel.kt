package dev.milmil.android

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.milmil.api.AnimeDetail
import dev.milmil.api.ApiClient
import dev.milmil.api.ApiError
import dev.milmil.api.BangumiComment
import dev.milmil.api.PlayableEpisode
import dev.milmil.api.PlayableEpisodes
import dev.milmil.api.animeDetail
import dev.milmil.api.bangumiComments
import dev.milmil.api.playableEpisodes
import dev.milmil.api.setScore
import dev.milmil.api.setWatchStatus
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * A series page. The header, the episode list and the comments come from three
 * different endpoints — the same split the web app has — and only the header
 * is worth blocking on, so a series with nothing scanned still renders.
 */
public data class DetailContent(
    val detail: AnimeDetail,
    val episodes: PlayableEpisodes?,
    val comments: List<BangumiComment> = emptyList(),
    val watchStatus: String = "",
    val userScore: Int? = null,
) {
    /** What the Play button opens, or null when nothing is on disk. */
    public val upNext: PlayableEpisode? get() = episodes?.upNext

    public val playableCount: Int get() = episodes?.episodes?.count { it.playable } ?: 0
}

public class DetailViewModel(private val client: ApiClient) : ViewModel() {
    private val _state = MutableStateFlow<Loadable<DetailContent>>(Loadable.Loading)
    public val state: StateFlow<Loadable<DetailContent>> = _state.asStateFlow()

    public fun load(bangumiId: Int) {
        _state.value = Loadable.Loading
        viewModelScope.launch {
            val episodesCall = async {
                // A series with nothing scanned answers 404 here while the
                // header is perfectly fine — one missing list must not blank
                // the whole page.
                runCatching { client.playableEpisodes(bangumiId) }.getOrNull()
            }
            val commentsCall = async {
                runCatching { client.bangumiComments(bangumiId) }.getOrDefault(emptyList())
            }
            _state.value = try {
                val detail = client.animeDetail(bangumiId)
                val episodes = episodesCall.await()
                Loadable.Ready(
                    DetailContent(
                        detail = detail,
                        episodes = episodes,
                        comments = commentsCall.await(),
                        watchStatus = episodes?.watchStatus.orEmpty(),
                        userScore = episodes?.userScore?.toInt()?.takeIf { it > 0 },
                    ),
                )
            } catch (error: ApiError) {
                Loadable.Failed(error.message ?: "載入失敗")
            }
        }
    }

    /** Re-read just the episode list, so a finished episode updates its bar. */
    public fun refreshEpisodes(bangumiId: Int) {
        val current = _state.value as? Loadable.Ready ?: return
        viewModelScope.launch {
            val episodes = runCatching { client.playableEpisodes(bangumiId) }.getOrNull() ?: return@launch
            _state.value = Loadable.Ready(current.value.copy(episodes = episodes))
        }
    }

    /**
     * 加入收藏 and the status menu. Applied locally first: the server round trip
     * is not worth a spinner on a two-tap action.
     */
    public fun setStatus(bangumiId: Int, status: String) {
        val current = _state.value as? Loadable.Ready ?: return
        _state.value = Loadable.Ready(current.value.copy(watchStatus = status))
        viewModelScope.launch { runCatching { client.setWatchStatus(bangumiId, status) } }
    }

    /** Your own score, 1…10, or null to clear it. */
    public fun setScore(bangumiId: Int, score: Int?) {
        val current = _state.value as? Loadable.Ready ?: return
        _state.value = Loadable.Ready(current.value.copy(userScore = score))
        viewModelScope.launch { runCatching { client.setScore(bangumiId, score) } }
    }
}

/** The watch statuses the server accepts, in the order the menu lists them. */
public enum class WatchStatus(public val key: String, public val label: String) {
    Watching("watching", "睇緊"),
    Planning("planning", "打算睇"),
    Completed("completed", "睇晒"),
    Paused("paused", "暫停"),
    Dropped("dropped", "棄坑"),
    None("none", "移出收藏"),
    ;

    public companion object {
        public fun label(key: String): String =
            entries.firstOrNull { it.key == key }?.label ?: "加入收藏"

        public fun collected(key: String): Boolean = key.isNotBlank() && key != "none"
    }
}
