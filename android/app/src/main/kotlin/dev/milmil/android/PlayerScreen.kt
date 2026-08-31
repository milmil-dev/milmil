package dev.milmil.android

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import dev.milmil.api.PlayableEpisode
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
import androidx.compose.runtime.saveable.rememberSaveable
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
import dev.milmil.android.player.PictureInPictureOnLeave
import dev.milmil.android.player.Media3Engine
import dev.milmil.android.player.PlaybackState
import dev.milmil.android.player.DanmakuOverlay
import dev.milmil.android.player.DanmakuSettings
import dev.milmil.android.player.PlaybackStatus
import dev.milmil.android.player.TrackKind
import dev.milmil.android.player.TrackOption
import dev.milmil.api.DanmakuComment
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
    danmaku: List<DanmakuComment>,
    danmakuSettings: DanmakuSettings,
    saveFailed: Boolean,
    hasNext: Boolean,
    onNext: () -> Unit,
    onSelectTrack: (TrackKind, String?) -> Unit,
    onSpeed: (Float) -> Unit,
    episodes: List<PlayableEpisode>,
    playingId: String,
    onSelectEpisode: (PlayableEpisode) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    // Portrait is the default: you watch with the episode list under the
    // picture. Full screen is a choice, not the only way in.
    var fullscreen by rememberSaveable { mutableStateOf(false) }
    if (fullscreen) ImmersiveLandscape()
    PictureInPictureOnLeave(playing = state.status == PlaybackStatus.Playing)

    var chromeVisible by remember { mutableStateOf(true) }
    var scrubbing by remember { mutableStateOf<Float?>(null) }
    var sheet by remember { mutableStateOf<PlayerSheet?>(null) }
    // The switch in 設定 is the default; the OSC button is a per-episode override.
    var danmakuOn by rememberSaveable(danmakuSettings.enabled) { mutableStateOf(danmakuSettings.enabled) }

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

    if (!fullscreen) {
        PortraitPlayer(
            engine = engine,
            title = title,
            subtitle = subtitle,
            state = state,
            tracks = tracks,
            danmaku = danmaku,
            danmakuSettings = danmakuSettings,
            saveFailed = saveFailed,
            hasNext = hasNext,
            episodes = episodes,
            playingId = playingId,
            onSelectEpisode = onSelectEpisode,
            onNext = onNext,
            onSelectTrack = onSelectTrack,
            onSpeed = onSpeed,
            onFullscreen = { fullscreen = true },
            onBack = onBack,
            modifier = modifier,
        )
        return
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

        DanmakuOverlay(
            comments = danmaku,
            engine = engine,
            settings = danmakuSettings.copy(enabled = danmakuOn),
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
                danmakuOn = danmakuOn,
                danmakuCount = danmaku.size,
                onToggleDanmaku = { danmakuOn = !danmakuOn },
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
                onFullscreen = { fullscreen = false },
                fullscreen = true,
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

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun BottomBar(
    state: PlaybackState,
    tracks: List<TrackOption>,
    danmakuOn: Boolean,
    danmakuCount: Int,
    onToggleDanmaku: () -> Unit,
    onOpenSheet: (PlayerSheet) -> Unit,
    saveFailed: Boolean,
    hasNext: Boolean,
    onNext: () -> Unit,
    onSkip: (Double) -> Unit,
    onFullscreen: () -> Unit,
    fullscreen: Boolean,
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
        // Material 3's expressive slider draws a 16dp track and a 44dp thumb,
        // which is a lot of furniture across the bottom of a video. Both are
        // drawn at 60% here; the touch target is left alone, because a scrub
        // bar you cannot grab is worse than one that looks heavy.
        Slider(
            value = scrubbing ?: state.fraction,
            onValueChange = onScrub,
            onValueChangeFinished = {
                scrubbing?.let { onScrubbed(it * state.durationSeconds) }
            },
            track = { sliderState ->
                SliderDefaults.Track(
                    sliderState = sliderState,
                    colors = SliderDefaults.colors(
                        activeTrackColor = MaterialTheme.colorScheme.primary,
                        inactiveTrackColor = Color.White.copy(alpha = 0.3f),
                    ),
                    modifier = Modifier.height(SCRUB_TRACK_HEIGHT),
                )
            },
            thumb = {
                Box(
                    Modifier
                        .size(width = 4.dp, height = SCRUB_THUMB_HEIGHT)
                        .clip(RoundedCornerShape(50))
                        .background(MaterialTheme.colorScheme.primary),
                )
            },
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
            // Greyed rather than hidden when the episode has no comments: the
            // control disappearing reads as the feature being broken.
            IconButton(onClick = onToggleDanmaku, enabled = danmakuCount > 0) {
                Icon(
                    DanmakuOutlined,
                    contentDescription = if (danmakuOn) "關閉彈幕" else "開啟彈幕",
                    tint = when {
                        danmakuCount == 0 -> Color.White.copy(alpha = 0.35f)
                        danmakuOn -> MaterialTheme.colorScheme.primary
                        else -> Color.White
                    },
                )
            }
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
            IconButton(onClick = onFullscreen) {
                Icon(
                    if (fullscreen) ExitFullscreen else EnterFullscreen,
                    contentDescription = if (fullscreen) "退出全螢幕" else "全螢幕",
                    tint = Color.White,
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
/** 60% of Material 3's 16dp expressive track. */
private val SCRUB_TRACK_HEIGHT = 10.dp

/** 60% of its 44dp thumb. */
private val SCRUB_THUMB_HEIGHT = 26.dp

private const val SKIP_SECONDS = 10.0
private const val SKIP_SECONDS_LABEL = 10
private val SPEEDS = listOf(0.75f, 1f, 1.25f, 1.5f, 2f)

/**
 * 豎屏播放.
 *
 * The picture keeps its 16:9 box at the top and the episode list sits under it,
 * so picking the next episode does not mean leaving the player. Full screen is
 * one tap away; it is a mode, not the only way to watch.
 */
@Composable
private fun PortraitPlayer(
    engine: Media3Engine,
    title: String,
    subtitle: String,
    state: PlaybackState,
    tracks: List<TrackOption>,
    danmaku: List<DanmakuComment>,
    danmakuSettings: DanmakuSettings,
    saveFailed: Boolean,
    hasNext: Boolean,
    episodes: List<PlayableEpisode>,
    playingId: String,
    onSelectEpisode: (PlayableEpisode) -> Unit,
    onNext: () -> Unit,
    onSelectTrack: (TrackKind, String?) -> Unit,
    onSpeed: (Float) -> Unit,
    onFullscreen: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var chromeVisible by remember { mutableStateOf(true) }
    var scrubbing by remember { mutableStateOf<Float?>(null) }
    var sheet by remember { mutableStateOf<PlayerSheet?>(null) }
    var danmakuOn by rememberSaveable(danmakuSettings.enabled) { mutableStateOf(danmakuSettings.enabled) }

    LaunchedEffect(chromeVisible, state.status, sheet) {
        if (chromeVisible && sheet == null && state.status == PlaybackStatus.Playing) {
            delay(CHROME_TIMEOUT_MILLIS)
            chromeVisible = false
        }
    }

    Column(modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Box(
            Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
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

            DanmakuOverlay(
                comments = danmaku,
                engine = engine,
                settings = danmakuSettings.copy(enabled = danmakuOn),
                modifier = Modifier.fillMaxSize(),
            )

            if (state.status == PlaybackStatus.Buffering) {
                CircularProgressIndicator(
                    color = Color.White,
                    modifier = Modifier.align(Alignment.Center).size(36.dp),
                )
            }

            if (chromeVisible) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.Black.copy(alpha = 0.4f))
                        .padding(horizontal = 4.dp, vertical = 4.dp),
                ) {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "返回",
                            tint = Color.White,
                        )
                    }
                    Text(
                        subtitle,
                        style = MaterialTheme.typography.labelMedium,
                        color = Color.White,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }

                BottomBar(
                    state = state,
                    tracks = tracks,
                    danmakuOn = danmakuOn,
                    danmakuCount = danmaku.size,
                    onToggleDanmaku = { danmakuOn = !danmakuOn },
                    onOpenSheet = { sheet = it },
                    saveFailed = saveFailed,
                    hasNext = hasNext,
                    onNext = onNext,
                    onSkip = { engine.seekTo((state.positionSeconds + it).coerceAtLeast(0.0)) },
                    onFullscreen = onFullscreen,
                    fullscreen = false,
                    scrubbing = scrubbing,
                    onScrub = { scrubbing = it },
                    onScrubbed = { seconds ->
                        engine.seekTo(seconds)
                        scrubbing = null
                    },
                    onToggle = {
                        if (state.status == PlaybackStatus.Playing) engine.pause() else engine.play()
                    },
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

        Text(
            title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(horizontal = Tokens.Space.Margin, vertical = 12.dp),
        )

        LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
            items(episodes, key = { it.episodeId }) { episode ->
                Box(Modifier.padding(horizontal = Tokens.Space.Margin, vertical = 4.dp)) {
                    PlaylistRow(
                        episode = episode,
                        playing = episode.episodeId == playingId,
                        onClick = { onSelectEpisode(episode) },
                    )
                }
            }
        }
    }
}

/** One episode in the under-the-player list, with the current one marked. */
@Composable
private fun PlaylistRow(episode: PlayableEpisode, playing: Boolean, onClick: () -> Unit) {
    CardRow(onClick = onClick.takeIf { episode.playable }) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(
                Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(
                        when {
                            playing -> Tokens.Accent
                            episode.playable -> Tokens.Accent.copy(alpha = 0.16f)
                            else -> Color.White.copy(alpha = 0.06f)
                        },
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "${episode.sort}",
                    style = MaterialTheme.typography.labelLarge,
                    color = when {
                        playing -> Color.Black
                        episode.playable -> Tokens.Accent
                        else -> MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
            }
            Column(Modifier.weight(1f)) {
                Text(
                    episode.displayTitle,
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (episode.playable) MaterialTheme.colorScheme.onSurface
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    if (playing) "播放緊" else if (episode.playable) episode.airDate.orEmpty() else "未有檔案",
                    style = MaterialTheme.typography.labelSmall,
                    color = if (playing) Tokens.Accent else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
