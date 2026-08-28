package dev.milmil.android

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import dev.milmil.api.AppNotification
import dev.milmil.api.Download
import dev.milmil.api.Library
import dev.milmil.api.RecentProgress
import dev.milmil.api.TorrentResult

/** The same loading / failed / empty shell every management screen uses. */
@Composable
private fun <T> Rows(
    state: Loadable<List<T>>,
    empty: String,
    modifier: Modifier = Modifier,
    content: @Composable (T) -> Unit,
) {
    when (state) {
        Loadable.Loading -> Box(modifier.fillMaxSize(), Alignment.Center) {
            CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
        }
        is Loadable.Failed -> Box(modifier.fillMaxSize(), Alignment.Center) {
            Text(state.message, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        is Loadable.Ready -> if (state.value.isEmpty()) {
            Box(modifier.fillMaxSize(), Alignment.Center) {
                Text(empty, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
                items(state.value.size) { index -> content(state.value[index]) }
            }
        }
    }
}

@Composable
public fun HistoryScreen(
    rows: Loadable<List<RecentProgress>>,
    onOpen: (Int) -> Unit,
    onForget: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Rows(rows, empty = "仲未睇過嘢", modifier = modifier) { row ->
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            modifier = Modifier
                .fillMaxWidth()
                .clickable(enabled = row.bangumiId != null) { row.bangumiId?.let(onOpen) }
                .padding(horizontal = 16.dp, vertical = 10.dp),
        ) {
            AsyncImage(
                model = row.coverImage,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.size(52.dp, 74.dp).clip(RoundedCornerShape(8.dp)),
            )
            Column(Modifier.weight(1f)) {
                Text(
                    row.displayTitle,
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    "第 ${row.episodeNumber} 集 · ${row.watchLabel}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 2.dp),
                )
                val total = row.durationSeconds ?: 0.0
                if (total > 0) {
                    LinearProgressIndicator(
                        progress = { (row.positionSeconds / total).toFloat().coerceIn(0f, 1f) },
                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp).height(3.dp),
                    )
                }
            }
            TextButton(onClick = { onForget(row.episodeId) }) { Text("移除") }
        }
    }
}

@Composable
public fun LibrariesScreen(
    rows: Loadable<List<Library>>,
    scanning: Set<String>,
    onScan: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Rows(rows, empty = "未加過媒體庫", modifier = modifier) { library ->
        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(library.name, style = MaterialTheme.typography.titleMedium)
                    Text(
                        library.path,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                TextButton(
                    onClick = { onScan(library.id) },
                    enabled = library.id !in scanning,
                ) { Text(if (library.id in scanning) "掃描中…" else "掃描") }
            }
            Text(
                "${library.fileCount} 個檔案 · 配對咗 ${library.matchedCount} · ${formatBytes(library.totalSizeBytes)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 6.dp),
            )
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
    }
}

@Composable
public fun DownloadsScreen(
    rows: Loadable<List<Download>>,
    onToggle: (Download) -> Unit,
    modifier: Modifier = Modifier,
) {
    Rows(rows, empty = "冇下載緊嘢", modifier = modifier) { download ->
        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
            Text(
                download.displayName,
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            LinearProgressIndicator(
                progress = { download.fraction },
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            )
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
                Text(
                    "${formatBytes(download.completedBytes)} / ${formatBytes(download.totalBytes)}" +
                        if (download.active) " · ${formatBytes(download.speedBytes)}/s" else "",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Box(Modifier.weight(1f))
                TextButton(onClick = { onToggle(download) }) {
                    Text(if (download.active) "暫停" else "繼續")
                }
            }
        }
    }
}

@Composable
public fun NotificationsScreen(
    rows: Loadable<List<AppNotification>>,
    onMarkAllRead: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), horizontalArrangement = Arrangement.End) {
            TextButton(onClick = onMarkAllRead) { Text("全部標為已讀") }
        }
        Rows(rows, empty = "冇通知") { item ->
            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            ) {
                // An unread dot rather than a background wash: the row stays
                // legible and the state is still obvious at a glance.
                Box(
                    Modifier
                        .padding(top = 6.dp)
                        .size(8.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .then(
                            if (item.read) Modifier
                            else Modifier.background(MaterialTheme.colorScheme.primary),
                        ),
                )
                Column(Modifier.weight(1f)) {
                    Text(item.title, style = MaterialTheme.typography.titleSmall)
                    if (item.message.isNotBlank()) {
                        Text(
                            item.message,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                // Twelve rows reading "Library Scan Complete" are indistinguishable
                // without this; the web list has carried a time all along.
                Text(
                    relativeTime(item.createdAt),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
        }
    }
}

@Composable
public fun TorrentsScreen(
    rows: Loadable<List<TorrentResult>>,
    started: Set<String>,
    onDownload: (TorrentResult) -> Unit,
    modifier: Modifier = Modifier,
) {
    Rows(rows, empty = "搵唔到種子", modifier = modifier) { torrent ->
        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
            Text(
                torrent.title,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 6.dp)) {
                Text(
                    listOfNotNull(
                        torrent.size.takeIf { it.isNotBlank() },
                        "↑ ${torrent.seeders}",
                        torrent.subGroup.takeIf { it.isNotBlank() },
                        torrent.sourceSite.takeIf { it.isNotBlank() },
                    ).joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Box(Modifier.weight(1f))
                TextButton(
                    onClick = { onDownload(torrent) },
                    enabled = torrent.magnet !in started,
                ) { Text(if (torrent.magnet in started) "已加入" else "下載") }
            }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
    }
}

/** Sizes the way a file browser shows them, not as raw bytes. */
internal fun formatBytes(bytes: Long): String {
    if (bytes <= 0) return "0 B"
    val units = listOf("B", "KB", "MB", "GB", "TB")
    var value = bytes.toDouble()
    var unit = 0
    while (value >= 1024 && unit < units.lastIndex) {
        value /= 1024
        unit += 1
    }
    return if (unit == 0) "${value.toInt()} ${units[unit]}" else "%.1f %s".format(value, units[unit])
}

/** "3 分鐘前" rather than a timestamp, matching how the web list reads. */
internal fun relativeTime(instant: java.time.Instant?): String {
    if (instant == null) return ""
    val seconds = java.time.Duration.between(instant, java.time.Instant.now()).seconds
    return when {
        seconds < 60 -> "啱啱"
        seconds < 3600 -> "${seconds / 60} 分鐘前"
        seconds < 86_400 -> "${seconds / 3600} 小時前"
        seconds < 2_592_000 -> "${seconds / 86_400} 日前"
        else -> java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd")
            .withZone(java.time.ZoneId.systemDefault())
            .format(instant)
    }
}
