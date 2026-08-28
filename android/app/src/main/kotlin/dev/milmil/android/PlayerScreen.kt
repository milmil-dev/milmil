package dev.milmil.android

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.ui.PlayerView
import dev.milmil.android.player.ImmersiveLandscape
import dev.milmil.android.player.Media3Engine
import dev.milmil.android.player.PlaybackState
import dev.milmil.android.player.PlaybackStatus
import dev.milmil.android.player.TrackKind
import dev.milmil.android.player.TrackOption
import kotlinx.coroutines.delay

/**
 * The watch screen. The OSC hides itself while playing and comes back on a
 * tap — the convention every phone player follows, and the reason the video
 * surface owns the whole screen rather than sitting in a letterboxed card.
 */
@Composable
public fun PlayerScreen(
    engine: Media3Engine,
    title: String,
    subtitle: String,
    state: PlaybackState,
    tracks: List<TrackOption>,
    saveFailed: Boolean,
    hasNext: Boolean,
    onNext: () -> Unit,
    onSelectTrack: (TrackKind, String?) -> Unit,
    onSpeed: (Float) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    ImmersiveLandscape()

    var chromeVisible by remember { mutableStateOf(true) }
    var scrubbing by remember { mutableStateOf<Float?>(null) }
    var sheet by remember { mutableStateOf<PlayerSheet?>(null) }

    // Hide only while it is actually playing: a paused or failed player that
    // hides its controls looks like a frozen app.
    LaunchedEffect(chromeVisible, state.status, sheet) {
        // A picker is open over the controls it came from; hiding them under it
        // leaves the choices floating on the video with nothing to explain them.
        if (chromeVisible && sheet == null && state.status == PlaybackStatus.Playing) {
            delay(CHROME_TIMEOUT_MILLIS)
            chromeVisible = false
        }
    }

    Box(
        modifier
            .fillMaxSize()
            .background(Color.Black)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
            ) { chromeVisible = !chromeVisible },
    ) {
        AndroidView(
            factory = { context ->
                PlayerView(context).apply {
                    player = engine.player
                    useController = false
                }
            },
            modifier = Modifier.fillMaxSize(),
        )

        if (state.status == PlaybackStatus.Buffering) {
            CircularProgressIndicator(
                color = Color.White,
                modifier = Modifier.align(Alignment.Center).size(44.dp),
            )
        }

        if (state.status == PlaybackStatus.Failed) {
            Column(
                Modifier.align(Alignment.Center).padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text("播唔到", style = MaterialTheme.typography.titleMedium, color = Color.White)
                Text(
                    state.message ?: "串流階梯行到底都開唔到",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.7f),
                )
            }
        }

        if (chromeVisible) {
            TopBar(title = title, subtitle = subtitle, onBack = onBack)
            BottomBar(
                state = state,
                tracks = tracks,
                onOpenSheet = { sheet = it },
                saveFailed = saveFailed,
                hasNext = hasNext,
                onNext = onNext,
                onSkip = { engine.seekTo((state.positionSeconds + it).coerceAtLeast(0.0)) },
                scrubbing = scrubbing,
                onScrub = { scrubbing = it },
                onScrubbed = { seconds ->
                    engine.seekTo(seconds)
                    scrubbing = null
                },
                onToggle = { if (state.status == PlaybackStatus.Playing) engine.pause() else engine.play() },
                modifier = Modifier.align(Alignment.BottomCenter),
            )
        }

        sheet?.let { open ->
            OptionSheet(
                sheet = open,
                tracks = tracks,
                speed = state.speed,
                onSelectTrack = { kind, id ->
                    onSelectTrack(kind, id)
                    sheet = null
                },
                onSpeed = {
                    onSpeed(it)
                    sheet = null
                },
                onDismiss = { sheet = null },
            )
        }
    }
}

/** Which picker is open. Null is the common case: nothing over the picture. */
private enum class PlayerSheet { Subtitles, Audio, Speed }

/**
 * One list of choices over the video. A bottom sheet would be the Material
 * answer on a portrait screen, but the player is landscape and a sheet there
 * covers the picture edge to edge — this sits in the corner the control came
 * from and leaves the frame visible.
 */
@Composable
private fun OptionSheet(
    sheet: PlayerSheet,
    tracks: List<TrackOption>,
    speed: Float,
    onSelectTrack: (TrackKind, String?) -> Unit,
    onSpeed: (Float) -> Unit,
    onDismiss: () -> Unit,
) {
    Box(
        Modifier
            .fillMaxSize()
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onDismiss,
            ),
    ) {
        Column(
            Modifier
                .align(Alignment.BottomStart)
                .safeDrawingPadding()
                // Clears the whole bottom bar, scrub track included.
                .padding(start = 12.dp, bottom = 112.dp)
                // Intrinsic, not fillMaxWidth: the rows fill the panel, and
                // without this they filled the screen instead.
                .width(IntrinsicSize.Max)
                .widthIn(min = 180.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(Color.Black.copy(alpha = 0.88f))
                .padding(vertical = 6.dp),
        ) {
            when (sheet) {
                PlayerSheet.Speed -> SPEEDS.forEach { option ->
                    SheetRow("${option}×", selected = speed == option) { onSpeed(option) }
                }
                PlayerSheet.Subtitles -> {
                    val subtitles = tracks.filter { it.kind == TrackKind.Subtitle }
                    SheetRow("關閉", selected = subtitles.none { it.selected }) {
                        onSelectTrack(TrackKind.Subtitle, null)
                    }
                    subtitles.forEach { track ->
                        SheetRow(track.label, track.selected) { onSelectTrack(TrackKind.Subtitle, track.id) }
                    }
                    if (subtitles.isEmpty()) SheetRow("冇字幕軌", selected = false, enabled = false) {}
                }
                PlayerSheet.Audio -> {
                    val audio = tracks.filter { it.kind == TrackKind.Audio }
                    audio.forEach { track ->
                        SheetRow(track.label, track.selected) { onSelectTrack(TrackKind.Audio, track.id) }
                    }
                    if (audio.isEmpty()) SheetRow("冇音軌", selected = false, enabled = false) {}
                }
            }
        }
    }
}

@Composable
private fun SheetRow(
    label: String,
    selected: Boolean,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    Text(
        label,
        style = MaterialTheme.typography.bodyMedium,
        color = when {
            !enabled -> Color.White.copy(alpha = 0.4f)
            selected -> MaterialTheme.colorScheme.primary
            else -> Color.White
        },
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 11.dp),
    )
}

@Composable
private fun TopBar(title: String, subtitle: String, onBack: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.Black.copy(alpha = 0.45f))
            .safeDrawingPadding()
            .padding(horizontal = 4.dp, vertical = 8.dp),
    ) {
        IconButton(onClick = onBack) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回", tint = Color.White)
        }
        Column(Modifier.padding(start = 4.dp)) {
            Text(
                title,
                style = MaterialTheme.typography.titleSmall,
                color = Color.White,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.7f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun BottomBar(
    state: PlaybackState,
    tracks: List<TrackOption>,
    onOpenSheet: (PlayerSheet) -> Unit,
    saveFailed: Boolean,
    hasNext: Boolean,
    onNext: () -> Unit,
    onSkip: (Double) -> Unit,
    scrubbing: Float?,
    onScrub: (Float) -> Unit,
    onScrubbed: (Double) -> Unit,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier
            .fillMaxWidth()
            .background(Color.Black.copy(alpha = 0.45f))
            .safeDrawingPadding()
            .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        Slider(
            value = scrubbing ?: state.fraction,
            onValueChange = onScrub,
            onValueChangeFinished = {
                scrubbing?.let { onScrubbed(it * state.durationSeconds) }
            },
            colors = SliderDefaults.colors(
                thumbColor = MaterialTheme.colorScheme.primary,
                activeTrackColor = MaterialTheme.colorScheme.primary,
                inactiveTrackColor = Color.White.copy(alpha = 0.3f),
            ),
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            SkipButton(RewindArc, "倒退 10 秒") { onSkip(-SKIP_SECONDS) }
            IconButton(onClick = onToggle) {
                Icon(
                    imageVector = if (state.status == PlaybackStatus.Playing) PauseFilled else Icons.Filled.PlayArrow,
                    contentDescription = if (state.status == PlaybackStatus.Playing) "暫停" else "播放",
                    tint = Color.White,
                )
            }
            SkipButton(ForwardArc, "快進 10 秒") { onSkip(SKIP_SECONDS) }
            if (hasNext) {
                IconButton(onClick = onNext) {
                    Icon(SkipNextFilled, contentDescription = "下一集", tint = Color.White)
                }
            }
            Text(
                "${clock((scrubbing?.let { it * state.durationSeconds } ?: state.positionSeconds))} / ${clock(state.durationSeconds)}",
                style = MaterialTheme.typography.labelMedium,
                color = Color.White,
                modifier = Modifier.padding(start = 4.dp),
            )
            Box(Modifier.weight(1f))
            IconButton(onClick = { onOpenSheet(PlayerSheet.Subtitles) }) {
                Icon(SubtitlesOutlined, contentDescription = "字幕", tint = Color.White)
            }
            IconButton(onClick = { onOpenSheet(PlayerSheet.Audio) }) {
                Icon(AudioTrackOutlined, contentDescription = "音軌", tint = Color.White)
            }
            TextButton(onClick = { onOpenSheet(PlayerSheet.Speed) }) {
                Text("${state.speed}×", style = MaterialTheme.typography.labelLarge, color = Color.White)
            }
            if (saveFailed) {
                // A watch position the server rejected is worth saying out
                // loud: silently losing it is what this replaced.
                Text(
                    "進度未儲存",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(end = 8.dp),
                )
            }
            // Which rung of the ladder the picture is coming from, the same
            // fact the macOS OSC shows.
            Text(
                state.stage.label,
                style = MaterialTheme.typography.labelSmall,
                color = Color.White,
                fontWeight = FontWeight.Medium,
                modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .background(Color.White.copy(alpha = 0.15f))
                    .padding(horizontal = 8.dp, vertical = 4.dp),
            )
        }
    }
}

/** The ring with its seconds inside, the way Material draws a skip control. */
@Composable
private fun SkipButton(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    IconButton(onClick = onClick) {
        Box(contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = label, tint = Color.White)
            Text(
                "$SKIP_SECONDS_LABEL",
                style = MaterialTheme.typography.labelSmall,
                fontSize = 9.sp,
                color = Color.White,
                modifier = Modifier.padding(top = 3.dp),
            )
        }
    }
}

/** `h:mm:ss` past an hour, `m:ss` under it — what a phone player shows. */
private fun clock(seconds: Double): String {
    if (seconds <= 0 || seconds.isNaN()) return "0:00"
    val total = seconds.toInt()
    val hours = total / 3600
    val minutes = (total % 3600) / 60
    val secs = total % 60
    return if (hours > 0) {
        "%d:%02d:%02d".format(hours, minutes, secs)
    } else {
        "%d:%02d".format(minutes, secs)
    }
}

private const val CHROME_TIMEOUT_MILLIS = 3500L
private const val SKIP_SECONDS = 10.0
private const val SKIP_SECONDS_LABEL = 10
private val SPEEDS = listOf(0.75f, 1f, 1.25f, 1.5f, 2f)
