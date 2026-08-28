package dev.milmil.android

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.milmil.api.AnimeDetail
import dev.milmil.api.ApiClient
import dev.milmil.api.ApiError
import dev.milmil.api.PlayableEpisode
import dev.milmil.api.PlayableEpisodes
import dev.milmil.api.animeDetail
import dev.milmil.api.playableEpisodes
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * A series page. The header and the episode list come from two different
 * endpoints — the same split the web app has — and the header is the one worth
 * showing early, so a series with no local files still renders.
 */
public data class DetailContent(
    val detail: AnimeDetail,
    val episodes: PlayableEpisodes?,
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
            _state.value = try {
                val detail = client.animeDetail(bangumiId)
                Loadable.Ready(DetailContent(detail, episodesCall.await()))
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
}
