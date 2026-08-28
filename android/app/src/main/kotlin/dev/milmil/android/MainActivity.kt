package dev.milmil.android

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.IconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import dev.milmil.android.player.DanmakuSettings
import dev.milmil.api.ApiClient
import java.time.LocalDate
import java.time.format.TextStyle
import java.util.Locale

/**
 * One activity, Compose throughout. A `milmil://pair` link can arrive either
 * as the launch intent or while the app is already open, so both paths feed
 * the same view model.
 */
public class MainActivity : ComponentActivity() {
    private val pairing: PairViewModel by viewModels {
        object : androidx.lifecycle.ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T =
                PairViewModel(SessionStore(applicationContext)) as T
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        // A pairing link beats a stored one; otherwise pick up where we left off.
        if (!consume(intent)) pairing.restore()
        setContent {
            MilmilTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    Scaffold { padding ->
                        val state by pairing.state.collectAsStateWithLifecycle()
                        Root(
                            state = state,
                            onScanned = pairing::pair,
                            onUnpair = pairing::unpair,
                            onRetry = pairing::restore,
                            modifier = Modifier.padding(padding),
                        )
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        consume(intent)
    }

    private fun consume(intent: Intent?): Boolean {
        val data = intent?.takeIf { it.action == Intent.ACTION_VIEW }?.data ?: return false
        pairing.pair(data.toString())
        return true
    }
}

/**
 * The whole flow so far: scan a code, or arrive by deep link, then land on
 * the shelves. Pairing is the only gate — once it holds, the home screen
 * fetches with the token the link carried.
 */
@Composable
private fun Root(
    state: PairState,
    onScanned: (String) -> Unit,
    onUnpair: () -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    when (state) {
        is PairState.Paired -> Shell(state, onUnpair = onUnpair, modifier = modifier)
        else -> PairFlow(
            state = state,
            onScanned = onScanned,
            onRetry = onRetry,
            modifier = modifier,
        )
    }
}

/**
 * Where the shell is. The five tabs are the design's information architecture;
 * everything else pushes over them, which keeps the navigation bar to the five
 * things a phone actually browses rather than the nine the sidebar carries on
 * a desktop.
 */
private sealed interface Route {
    data object Tabs : Route
    data class Detail(val bangumiId: Int) : Route
    data class Watch(val bangumiId: Int, val episodeId: String) : Route
    data class Torrents(val bangumiId: Int, val title: String) : Route
    data object More : Route
    data object History : Route
    data object Libraries : Route
    data object Downloads : Route
    data object Notifications : Route
    data object Settings : Route
}

/**
 * The signed-in shell: one client for the session, a Material 3 navigation bar,
 * and each tab loading the first time it is opened rather than all at once.
 * A series page pushes over the tabs, and the player over that — the design's
 * rule that a detail page is a push and never a modal.
 */
@Composable
private fun Shell(
    paired: PairState.Paired,
    onUnpair: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val client = remember(paired) { ApiClient(paired.url) { paired.token } }
    var route by remember { mutableStateOf<Route>(Route.Tabs) }
    // Hoisted so a change in 設定 reaches the player without a round trip
    // through the server, the way the web store does it.
    var danmaku by remember { mutableStateOf(DanmakuSettings()) }
    val notifications: NotificationsViewModel =
        viewModel(key = "notifications-${paired.url}") { NotificationsViewModel(client) }
    LaunchedEffect(paired.url) { notifications.refreshBadge() }
    val unread by notifications.unread.collectAsStateWithLifecycle()

    val back = { route = Route.Tabs }

    when (val current = route) {
        is Route.Detail -> {
            DetailRoute(
                client = client,
                bangumiId = current.bangumiId,
                onBack = back,
                onPlay = { episode -> route = Route.Watch(current.bangumiId, episode.episodeId) },
                onFindTorrents = { title -> route = Route.Torrents(current.bangumiId, title) },
                modifier = modifier,
            )
            return
        }
        is Route.Watch -> {
            WatchRoute(
                client = client,
                bangumiId = current.bangumiId,
                episodeId = current.episodeId,
                danmaku = danmaku,
                onBack = { route = Route.Detail(current.bangumiId) },
                modifier = modifier,
            )
            return
        }
        is Route.Torrents -> {
            val model: TorrentsViewModel =
                viewModel(key = "torrents-${current.bangumiId}") { TorrentsViewModel(client) }
            LaunchedEffect(current.bangumiId) { model.load(current.bangumiId) }
            val rows by model.rows.collectAsStateWithLifecycle()
            val started by model.started.collectAsStateWithLifecycle()
            Pushed("找種子 · ${current.title}", onBack = { route = Route.Detail(current.bangumiId) }, modifier = modifier) {
                TorrentsScreen(rows, started, onDownload = { model.download(it, current.bangumiId) })
            }
            return
        }
        Route.More -> {
            Pushed("更多", onBack = back, modifier = modifier) {
                MoreScreen(unread = unread, onOpen = { route = it })
            }
            return
        }
        Route.History -> {
            val model: HistoryViewModel = viewModel(key = "history-${paired.url}") { HistoryViewModel(client) }
            LaunchedEffect(paired.url) { model.load() }
            val rows by model.rows.collectAsStateWithLifecycle()
            Pushed("歷史", onBack = { route = Route.More }, modifier = modifier) {
                HistoryScreen(rows, onOpen = { route = Route.Detail(it) }, onForget = model::forget)
            }
            return
        }
        Route.Libraries -> {
            val model: LibrariesViewModel = viewModel(key = "libraries-${paired.url}") { LibrariesViewModel(client) }
            LaunchedEffect(paired.url) { model.load() }
            val rows by model.rows.collectAsStateWithLifecycle()
            val scanning by model.scanning.collectAsStateWithLifecycle()
            Pushed("媒體庫", onBack = { route = Route.More }, modifier = modifier) {
                LibrariesScreen(rows, scanning, onScan = model::scan)
            }
            return
        }
        Route.Downloads -> {
            val model: DownloadsViewModel = viewModel(key = "downloads-${paired.url}") { DownloadsViewModel(client) }
            LaunchedEffect(paired.url) { model.load() }
            val rows by model.rows.collectAsStateWithLifecycle()
            Pushed("下載", onBack = { route = Route.More }, modifier = modifier) {
                DownloadsScreen(rows, onToggle = model::toggle)
            }
            return
        }
        Route.Notifications -> {
            LaunchedEffect(paired.url) { notifications.load() }
            val rows by notifications.rows.collectAsStateWithLifecycle()
            Pushed("通知", onBack = { route = Route.More }, modifier = modifier) {
                NotificationsScreen(rows, onMarkAllRead = notifications::markAllRead)
            }
            return
        }
        Route.Settings -> {
            Pushed("設定", onBack = { route = Route.More }, modifier = modifier) {
                SettingsScreen(
                    username = paired.username,
                    serverName = paired.name,
                    serverUrl = paired.url,
                    version = paired.version,
                    avatarUrl = paired.avatarUrl?.let { absoluteAvatar(paired.url, it) },
                    danmaku = danmaku,
                    onDanmaku = { danmaku = it },
                    onUnpair = onUnpair,
                )
            }
            return
        }
        Route.Tabs -> Unit
    }

    Tabs(
        client = client,
        paired = paired,
        unread = unread,
        onOpen = { route = Route.Detail(it) },
        onMore = { route = Route.More },
        modifier = modifier,
    )
}

/** An avatar path is relative to the server, like every other media URL. */
private fun absoluteAvatar(baseUrl: String, path: String): String =
    if (path.startsWith("http")) path else baseUrl.trimEnd('/') + "/" + path.trimStart('/')

/** A pushed page: a back arrow, a title, and the screen under it. */
@Composable
private fun Pushed(
    title: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    BackHandler(onBack = onBack)
    Scaffold(
        modifier = modifier,
        topBar = {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth().padding(end = 16.dp),
            ) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
                }
                Text(
                    title,
                    style = MaterialTheme.typography.titleLarge,
                    maxLines = 1,
                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                )
            }
        },
    ) { padding -> Box(Modifier.padding(padding)) { content() } }
}

/**
 * The nine-item desktop sidebar, minus the five that are tabs. A list rather
 * than more tabs: these are places you visit occasionally, not places you
 * switch between while browsing.
 */
@Composable
private fun MoreScreen(unread: Int, onOpen: (Route) -> Unit) {
    Column(Modifier.fillMaxWidth()) {
        MoreRow("歷史") { onOpen(Route.History) }
        MoreRow("媒體庫") { onOpen(Route.Libraries) }
        MoreRow("下載") { onOpen(Route.Downloads) }
        MoreRow("通知", badge = unread) { onOpen(Route.Notifications) }
        MoreRow("設定") { onOpen(Route.Settings) }
    }
}

@Composable
private fun MoreRow(label: String, badge: Int = 0, onClick: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 18.dp),
    ) {
        Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        if (badge > 0) {
            Badge { Text("$badge") }
        }
    }
}

/**
 * The series page. Its episode list is re-read on the way back from the player
 * so a part-watched episode shows its bar without a manual refresh.
 */
@Composable
private fun DetailRoute(
    client: ApiClient,
    bangumiId: Int,
    onBack: () -> Unit,
    onPlay: (dev.milmil.api.PlayableEpisode) -> Unit,
    onFindTorrents: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val model: DetailViewModel = viewModel(key = "detail-$bangumiId") { DetailViewModel(client) }
    LaunchedEffect(bangumiId) { model.load(bangumiId) }
    val state by model.state.collectAsStateWithLifecycle()
    BackHandler(onBack = onBack)
    DetailScreen(
        state = state,
        onBack = onBack,
        onPlay = onPlay,
        onFindTorrents = onFindTorrents,
        modifier = modifier,
    )
}

/**
 * The player. The episode is looked up from the list rather than passed as an
 * object, so the resume position is whatever the server last recorded — which
 * may be from another client entirely.
 */
@Composable
private fun WatchRoute(
    client: ApiClient,
    bangumiId: Int,
    episodeId: String,
    danmaku: DanmakuSettings,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val detail: DetailViewModel = viewModel(key = "detail-$bangumiId") { DetailViewModel(client) }
    val model: PlayerViewModel = viewModel(key = "player-$episodeId") { PlayerViewModel(context, client) }
    val content by detail.state.collectAsStateWithLifecycle()
    val all = (content as? Loadable.Ready)?.value?.episodes?.episodes.orEmpty()
    var playingId by rememberSaveable(episodeId) { mutableStateOf(episodeId) }
    val episode = all.firstOrNull { it.episodeId == playingId }
    // The next one with a file on the server, not simply the next row: an
    // episode that is only listed cannot be played into.
    val next = all
        .dropWhile { it.episodeId != playingId }
        .drop(1)
        .firstOrNull { it.playable }

    LaunchedEffect(playingId, episode?.episodeId) { episode?.let(model::play) }

    val leave = {
        model.commit()
        detail.refreshEpisodes(bangumiId)
        onBack()
    }
    BackHandler(onBack = leave)

    val state by model.state.collectAsStateWithLifecycle()
    val tracks by model.engine.tracks.collectAsStateWithLifecycle()
    val danmakuComments by model.danmaku.collectAsStateWithLifecycle()
    val saveFailed by model.saveFailed.collectAsStateWithLifecycle()
    PlayerScreen(
        engine = model.engine,
        title = (content as? Loadable.Ready)?.value?.detail?.displayTitle.orEmpty(),
        subtitle = episode?.let { "第 ${it.sort} 集 · ${it.displayTitle}" }.orEmpty(),
        state = state,
        tracks = tracks,
        danmaku = danmakuComments,
        danmakuSettings = danmaku,
        saveFailed = saveFailed,
        hasNext = next != null,
        onNext = {
            // Write where we got to before the position becomes the next
            // episode's, then switch without leaving the screen.
            model.commit()
            next?.let { playingId = it.episodeId }
        },
        onSelectTrack = model.engine::selectTrack,
        onSpeed = model.engine::setSpeed,
        onBack = leave,
        modifier = modifier,
    )
}

@Composable
private fun Tabs(
    client: ApiClient,
    paired: PairState.Paired,
    unread: Int,
    onOpen: (Int) -> Unit,
    onMore: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var destination by rememberSaveable { mutableStateOf(Destination.Home) }

    Scaffold(
        modifier = modifier,
        topBar = {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp),
            ) {
                Text(destination.label, style = MaterialTheme.typography.titleLarge)
                Box(Modifier.weight(1f))
                IconButton(onClick = onMore) {
                    // The badge rides the entry point rather than a bell of its
                    // own: one affordance, and the count is still visible from
                    // any tab.
                    if (unread > 0) {
                        BadgedBox(badge = { Badge { Text("$unread") } }) {
                            Icon(MoreVertical, contentDescription = "更多")
                        }
                    } else {
                        Icon(MoreVertical, contentDescription = "更多")
                    }
                }
            }
        },
        bottomBar = {
            NavigationBar {
                Destination.entries.forEach { item ->
                    val selected = item == destination
                    NavigationBarItem(
                        selected = selected,
                        onClick = { destination = item },
                        icon = {
                            Icon(
                                imageVector = if (selected) item.selected else item.unselected,
                                contentDescription = item.label,
                            )
                        },
                        label = { Text(item.label) },
                    )
                }
            }
        },
    ) { padding ->
        Box(Modifier.padding(padding)) {
            when (destination) {
                Destination.Home -> HomeTab(client, paired.url, onOpen)
                Destination.Schedule -> ScheduleTab(client, paired.url, onOpen)
                Destination.Discover -> DiscoverTab(client, paired.url, onOpen)
                Destination.Search -> SearchTab(client, paired.url, onOpen)
                Destination.Collection -> CollectionTab(client, paired.url, onOpen)
            }
        }
    }
}

@Composable
private fun HomeTab(client: ApiClient, key: String, onOpen: (Int) -> Unit) {
    val model: HomeViewModel = viewModel(key = "home-$key") { HomeViewModel(client) }
    LaunchedEffect(key) {
        // The calendar keys on the English weekday, so it stays right whatever
        // language the server answers in. SHORT matches how the server spells
        // it ("Fri"); `today()` tolerates either length regardless.
        model.load(LocalDate.now().dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.ENGLISH))
    }
    val state by model.state.collectAsStateWithLifecycle()
    HomeScreen(state = state, onOpen = onOpen)
}

@Composable
private fun ScheduleTab(client: ApiClient, key: String, onOpen: (Int) -> Unit) {
    val model: ScheduleViewModel = viewModel(key = "schedule-$key") { ScheduleViewModel(client) }
    LaunchedEffect(key) { model.load() }
    val state by model.state.collectAsStateWithLifecycle()
    ScheduleScreen(state = state, onOpen = onOpen)
}

@Composable
private fun DiscoverTab(client: ApiClient, key: String, onOpen: (Int) -> Unit) {
    val model: DiscoverViewModel = viewModel(key = "discover-$key") { DiscoverViewModel(client) }
    LaunchedEffect(key) { model.load() }
    val state by model.state.collectAsStateWithLifecycle()
    DiscoverScreen(state = state, onOpen = onOpen)
}

@Composable
private fun SearchTab(client: ApiClient, key: String, onOpen: (Int) -> Unit) {
    val model: SearchViewModel = viewModel(key = "search-$key") { SearchViewModel(client) }
    val query by model.query.collectAsStateWithLifecycle()
    val results by model.results.collectAsStateWithLifecycle()
    SearchScreen(query = query, results = results, onQuery = model::type, onOpen = onOpen)
}

@Composable
private fun CollectionTab(client: ApiClient, key: String, onOpen: (Int) -> Unit) {
    val model: CollectionViewModel = viewModel(key = "collection-$key") { CollectionViewModel(client) }
    LaunchedEffect(key) { model.load() }
    val entries by model.entries.collectAsStateWithLifecycle()
    val counts by model.counts.collectAsStateWithLifecycle()
    CollectionScreen(entries = entries, counts = counts, onOpen = onOpen)
}

@OptIn(ExperimentalPermissionsApi::class)
@Composable
private fun PairFlow(
    state: PairState,
    onScanned: (String) -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val camera = rememberPermissionState(CAMERA_PERMISSION)
    if (state is PairState.Waiting && camera.status.isGranted) {
        QrScanner(onPaired = onScanned, modifier = modifier)
        return
    }
    PairScreen(
        state = state,
        onRetry = onRetry,
        modifier = modifier,
        onGrantCamera = { camera.launchPermissionRequest() }.takeIf { state is PairState.Waiting && !camera.status.isGranted },
    )
}

@Composable
private fun PairScreen(
    state: PairState,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
    onGrantCamera: (() -> Unit)? = null,
) {
    Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.padding(32.dp),
        ) {
            when (state) {
                PairState.Waiting -> {
                    Text("配對裝置", style = MaterialTheme.typography.headlineSmall)
                    Text(
                        "喺 Web 版打開設定 › 配對裝置，掃描畫面上嘅 QR 碼。",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )
                    onGrantCamera?.let { grant ->
                        Button(onClick = grant) { Text("開啟相機掃碼") }
                    }
                }
                is PairState.Connecting -> {
                    CircularProgressIndicator(
                        modifier = Modifier.size(36.dp),
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Text("連線緊 ${state.name}…", style = MaterialTheme.typography.bodyLarge)
                }
                is PairState.Paired -> {
                    Text("已配對", style = MaterialTheme.typography.headlineSmall)
                    Text(
                        "${state.name} · ${state.username} · v${state.version}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                is PairState.Failed -> {
                    Text("配對失敗", style = MaterialTheme.typography.headlineSmall)
                    Text(
                        state.message,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )
                    // A dead end otherwise: the stored pairing is gone from
                    // state but the scanner is two taps away, not zero.
                    Button(onClick = onRetry) { Text("再試一次") }
                }
            }
        }
    }
}
