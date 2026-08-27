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
import androidx.compose.material3.MaterialTheme
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
    private val pairing: PairViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        consume(intent)
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

    private fun consume(intent: Intent?) {
        val data = intent?.takeIf { it.action == Intent.ACTION_VIEW }?.data ?: return
        pairing.pair(data.toString())
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
        is PairState.Paired -> Home(state, modifier)
        else -> PairFlow(state = state, onScanned = onScanned, modifier = modifier)
    }
}

@Composable
private fun Home(paired: PairState.Paired, modifier: Modifier = Modifier) {
    val client = androidx.compose.runtime.remember(paired) { ApiClient(paired.url) { paired.token } }
    val model: HomeViewModel = viewModel(key = paired.url) { HomeViewModel(client) }
    LaunchedEffect(paired.url) {
        // The calendar keys on the English weekday, so it stays right whatever
        // language the server answers in.
        model.load(LocalDate.now().dayOfWeek.getDisplayName(TextStyle.FULL, Locale.ENGLISH))
    }
    val state by model.state.collectAsStateWithLifecycle()
    HomeScreen(state = state, modifier = modifier)
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
