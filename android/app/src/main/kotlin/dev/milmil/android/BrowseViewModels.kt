package dev.milmil.android

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.milmil.api.ApiClient
import dev.milmil.api.ApiError
import dev.milmil.api.CalendarDay
import dev.milmil.api.CollectionEntry
import dev.milmil.api.DiscoverAnime
import dev.milmil.api.StatusCount
import dev.milmil.api.calendar
import dev.milmil.api.collection
import dev.milmil.api.search
import dev.milmil.api.statusCounts
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Every tab is loading, holding something, or explaining why it is not. */
public sealed interface Loadable<out T> {
    public data object Loading : Loadable<Nothing>
    public data class Ready<T>(val value: T) : Loadable<T>
    public data class Failed(val message: String) : Loadable<Nothing>
}

private suspend fun <T> load(block: suspend () -> T): Loadable<T> = try {
    Loadable.Ready(block())
} catch (error: ApiError) {
    Loadable.Failed(error.message ?: "載入失敗")
}

public class ScheduleViewModel(private val client: ApiClient) : ViewModel() {
    private val _state = MutableStateFlow<Loadable<List<CalendarDay>>>(Loadable.Loading)
    public val state: StateFlow<Loadable<List<CalendarDay>>> = _state.asStateFlow()

    public fun load() {
        viewModelScope.launch { _state.value = load { client.calendar() } }
    }
}

public class CollectionViewModel(private val client: ApiClient) : ViewModel() {
    private val _entries = MutableStateFlow<Loadable<List<CollectionEntry>>>(Loadable.Loading)
    public val entries: StateFlow<Loadable<List<CollectionEntry>>> = _entries.asStateFlow()
    private val _counts = MutableStateFlow<List<StatusCount>>(emptyList())
    public val counts: StateFlow<List<StatusCount>> = _counts.asStateFlow()

    public fun load() {
        viewModelScope.launch {
            val rows = async { load { client.collection(page = 1) } }
            val tallies = async { runCatching { client.statusCounts() }.getOrDefault(emptyList()) }
            _entries.value = rows.await()
            _counts.value = tallies.await()
        }
    }
}

public class SearchViewModel(private val client: ApiClient) : ViewModel() {
    private val _query = MutableStateFlow("")
    public val query: StateFlow<String> = _query.asStateFlow()
    private val _results = MutableStateFlow<Loadable<List<DiscoverAnime>>?>(null)
    public val results: StateFlow<Loadable<List<DiscoverAnime>>?> = _results.asStateFlow()
    private var pending: Job? = null

    /**
     * Debounced: the search endpoint fans out to upstream providers, so firing
     * on every keystroke would both lag and hammer them.
     */
    public fun type(text: String) {
        _query.value = text
        pending?.cancel()
        if (text.isBlank()) {
            _results.value = null
            return
        }
        pending = viewModelScope.launch {
            delay(350)
            _results.value = Loadable.Loading
            _results.value = load { client.search(text) }
        }
    }
}
