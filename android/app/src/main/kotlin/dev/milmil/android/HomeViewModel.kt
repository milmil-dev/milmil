package dev.milmil.android

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.milmil.api.ApiClient
import dev.milmil.api.ApiError
import dev.milmil.api.CalendarDay
import dev.milmil.api.DiscoverAnime
import dev.milmil.api.RecentProgress
import dev.milmil.api.recentProgress
import dev.milmil.api.calendar
import dev.milmil.api.trending
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

public sealed interface HomeState {
    public data object Loading : HomeState
    public data class Ready(
        val hero: List<DiscoverAnime>,
        val continueWatching: List<RecentProgress>,
        val today: List<DiscoverAnime>,
        val trending: List<DiscoverAnime>,
    ) : HomeState
    public data class Failed(val message: String) : HomeState
}

/**
 * The home shelves, from the same two endpoints the web app uses
 * (`discoverApi.trending`, `discoverApi.calendar`). Both are fetched at once —
 * the calendar is the slower of the two and neither depends on the other.
 */
public class HomeViewModel(private val client: ApiClient) : ViewModel() {
    private val _state = MutableStateFlow<HomeState>(HomeState.Loading)
    public val state: StateFlow<HomeState> = _state.asStateFlow()

    public fun load(todayEn: String) {
        _state.value = HomeState.Loading
        viewModelScope.launch {
            try {
                val trendingCall = async { client.trending(page = 1) }
                val calendarCall = async { client.calendar() }
                // 繼續睇 is the row a returning user opens the app for, and it
                // must not be able to fail the whole page.
                val progressCall = async { runCatching { client.recentProgress() }.getOrDefault(emptyList()) }
                val trending = trendingCall.await()
                val week = calendarCall.await()
                _state.value = HomeState.Ready(
                    // Five is what a pager can hold before it becomes a list.
                    hero = trending.filter { it.bannerImage.isNotBlank() }.take(5),
                    continueWatching = progressCall.await().filterNot { it.completed },
                    today = week.today(todayEn),
                    trending = trending,
                )
            } catch (error: ApiError) {
                _state.value = HomeState.Failed(error.message ?: "載入失敗")
            }
        }
    }
}

/**
 * The calendar carries every weekday; the shelf wants one. Matching on the
 * English name keeps this independent of the server's display language.
 *
 * The server abbreviates — `"Fri"`, not `"Friday"` — which an emulator run
 * caught: a full-name lookup silently matched nothing and the shelf just did
 * not appear. Comparing the first three letters accepts either spelling from
 * either side, so neither has to know what the other picked.
 */
internal fun List<CalendarDay>.today(todayEn: String): List<DiscoverAnime> {
    val wanted = todayEn.take(3).lowercase()
    return firstOrNull { it.weekdayEn.take(3).lowercase() == wanted }?.items.orEmpty()
}
