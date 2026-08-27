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
import androidx.lifecycle.compose.collectAsStateWithLifecycle

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
                        PairScreen(state = state, modifier = Modifier.padding(padding))
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

@Composable
private fun PairScreen(state: PairState, modifier: Modifier = Modifier) {
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
