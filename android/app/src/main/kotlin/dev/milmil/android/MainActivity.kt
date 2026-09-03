package dev.milmil.android

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
private fun Root(state: PairState, onScanned: (String) -> Unit, modifier: Modifier = Modifier) {
    when (state) {
        is PairState.Paired -> Shell(state, modifier)
        else -> PairFlow(state = state, onScanned = onScanned, modifier = modifier)
    }
}

/**
 * The signed-in shell: one client for the session, a Material 3 navigation bar,
 * and each tab loading the first time it is opened rather than all at once.
 */
@Composable
private fun Shell(paired: PairState.Paired, modifier: Modifier = Modifier) {
    val client = remember(paired) { ApiClient(paired.url) { paired.token } }
    var destination by rememberSaveable { mutableStateOf(Destination.Home) }

    Scaffold(
        modifier = modifier,
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
                Destination.Home -> HomeTab(client, paired.url)
                Destination.Schedule -> ScheduleTab(client, paired.url)
                Destination.Search -> SearchTab(client, paired.url)
                Destination.Collection -> CollectionTab(client, paired.url)
            }
        }
    }
}

@Composable
private fun HomeTab(client: ApiClient, key: String) {
    val model: HomeViewModel = viewModel(key = "home-$key") { HomeViewModel(client) }
    LaunchedEffect(key) {
        // The calendar keys on the English weekday, so it stays right whatever
        // language the server answers in. SHORT matches how the server spells
        // it ("Fri"); `today()` tolerates either length regardless.
        model.load(LocalDate.now().dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.ENGLISH))
    }
    val state by model.state.collectAsStateWithLifecycle()
    HomeScreen(state = state)
}

@Composable
private fun ScheduleTab(client: ApiClient, key: String) {
    val model: ScheduleViewModel = viewModel(key = "schedule-$key") { ScheduleViewModel(client) }
    LaunchedEffect(key) { model.load() }
    val state by model.state.collectAsStateWithLifecycle()
    ScheduleScreen(state = state)
}

@Composable
private fun SearchTab(client: ApiClient, key: String) {
    val model: SearchViewModel = viewModel(key = "search-$key") { SearchViewModel(client) }
    val query by model.query.collectAsStateWithLifecycle()
    val results by model.results.collectAsStateWithLifecycle()
    SearchScreen(query = query, results = results, onQuery = model::type)
}

@Composable
private fun CollectionTab(client: ApiClient, key: String) {
    val model: CollectionViewModel = viewModel(key = "collection-$key") { CollectionViewModel(client) }
    LaunchedEffect(key) { model.load() }
    val entries by model.entries.collectAsStateWithLifecycle()
    val counts by model.counts.collectAsStateWithLifecycle()
    CollectionScreen(entries = entries, counts = counts)
}

@OptIn(ExperimentalPermissionsApi::class)
@Composable
private fun PairFlow(state: PairState, onScanned: (String) -> Unit, modifier: Modifier = Modifier) {
    val camera = rememberPermissionState(CAMERA_PERMISSION)
    if (state is PairState.Waiting && camera.status.isGranted) {
        QrScanner(onPaired = onScanned, modifier = modifier)
        return
    }
    PairScreen(
        state = state,
        modifier = modifier,
        onGrantCamera = { camera.launchPermissionRequest() }.takeIf { state is PairState.Waiting && !camera.status.isGranted },
    )
}

@Composable
private fun PairScreen(
    state: PairState,
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
                }
            }
        }
    }
}
