package dev.milmil.android

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.milmil.api.ApiClient
import dev.milmil.api.ApiError
import dev.milmil.api.AppNotification
import dev.milmil.api.Download
import dev.milmil.api.Library
import dev.milmil.api.RecentProgress
import dev.milmil.api.TorrentResult
import dev.milmil.api.animeTorrents
import dev.milmil.api.deleteProgress
import dev.milmil.api.downloads
import dev.milmil.api.history
import dev.milmil.api.libraries
import dev.milmil.api.markAllNotificationsRead
import dev.milmil.api.notifications
import dev.milmil.api.pauseDownload
import dev.milmil.api.resumeDownload
import dev.milmil.api.scanLibrary
import dev.milmil.api.startDownload
import dev.milmil.api.unreadNotifications
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

private suspend fun <T> loaded(block: suspend () -> T): Loadable<T> = try {
    Loadable.Ready(block())
} catch (error: ApiError) {
    Loadable.Failed(error.message ?: "載入失敗")
}

/** 歷史 — the same rows the web history page lists, newest first. */
public class HistoryViewModel(private val client: ApiClient) : ViewModel() {
    private val _rows = MutableStateFlow<Loadable<List<RecentProgress>>>(Loadable.Loading)
    public val rows: StateFlow<Loadable<List<RecentProgress>>> = _rows.asStateFlow()

    public fun load() {
        viewModelScope.launch { _rows.value = loaded { client.history(limit = 50).items } }
    }

    /** Forget one episode. The list updates locally so the row goes at once. */
    public fun forget(id: String) {
        val current = (_rows.value as? Loadable.Ready)?.value ?: return
        _rows.value = Loadable.Ready(current.filterNot { it.episodeId == id })
        viewModelScope.launch { runCatching { client.deleteProgress(id) } }
    }
}

/** 媒體庫 — read-only plus a scan, which is what a phone is for. */
public class LibrariesViewModel(private val client: ApiClient) : ViewModel() {
    private val _rows = MutableStateFlow<Loadable<List<Library>>>(Loadable.Loading)
    public val rows: StateFlow<Loadable<List<Library>>> = _rows.asStateFlow()

    private val _scanning = MutableStateFlow<Set<String>>(emptySet())
    public val scanning: StateFlow<Set<String>> = _scanning.asStateFlow()

    public fun load() {
        viewModelScope.launch { _rows.value = loaded { client.libraries() } }
    }

    public fun scan(id: String) {
        _scanning.value = _scanning.value + id
        viewModelScope.launch {
            runCatching { client.scanLibrary(id) }
            // The scan itself runs on the server and reports by notification;
            // all this can honestly say is that the request was accepted.
            _scanning.value = _scanning.value - id
            load()
        }
    }
}

/** 下載 — the list, with pause and resume. */
public class DownloadsViewModel(private val client: ApiClient) : ViewModel() {
    private val _rows = MutableStateFlow<Loadable<List<Download>>>(Loadable.Loading)
    public val rows: StateFlow<Loadable<List<Download>>> = _rows.asStateFlow()

    public fun load() {
        viewModelScope.launch { _rows.value = loaded { client.downloads() } }
    }

    public fun toggle(download: Download) {
        viewModelScope.launch {
            runCatching {
                if (download.active) client.pauseDownload(download.gid)
                else client.resumeDownload(download.gid)
            }
            load()
        }
    }
}

/** 通知 — and the badge the navigation bar shows. */
public class NotificationsViewModel(private val client: ApiClient) : ViewModel() {
    private val _rows = MutableStateFlow<Loadable<List<AppNotification>>>(Loadable.Loading)
    public val rows: StateFlow<Loadable<List<AppNotification>>> = _rows.asStateFlow()

    private val _unread = MutableStateFlow(0)
    public val unread: StateFlow<Int> = _unread.asStateFlow()

    public fun load() {
        viewModelScope.launch { _rows.value = loaded { client.notifications() } }
        refreshBadge()
    }

    public fun refreshBadge() {
        viewModelScope.launch { _unread.value = runCatching { client.unreadNotifications() }.getOrDefault(0) }
    }

    public fun markAllRead() {
        val current = (_rows.value as? Loadable.Ready)?.value
        if (current != null) _rows.value = Loadable.Ready(current.map { it.copy(read = true) })
        _unread.value = 0
        viewModelScope.launch {
            runCatching { client.markAllNotificationsRead() }
            refreshBadge()
        }
    }
}

/** 找種子 for a series with nothing on disk. */
public class TorrentsViewModel(private val client: ApiClient) : ViewModel() {
    private val _rows = MutableStateFlow<Loadable<List<TorrentResult>>>(Loadable.Loading)
    public val rows: StateFlow<Loadable<List<TorrentResult>>> = _rows.asStateFlow()

    private val _started = MutableStateFlow<Set<String>>(emptySet())
    public val started: StateFlow<Set<String>> = _started.asStateFlow()

    public fun load(bangumiId: Int) {
        viewModelScope.launch { _rows.value = loaded { client.animeTorrents(bangumiId) } }
    }

    public fun download(torrent: TorrentResult, bangumiId: Int) {
        _started.value = _started.value + torrent.magnet
        viewModelScope.launch { runCatching { client.startDownload(torrent.magnet, bangumiId) } }
    }
}
