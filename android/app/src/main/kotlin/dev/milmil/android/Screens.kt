package dev.milmil.android

import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
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
import dev.milmil.api.CalendarDay
import dev.milmil.api.CollectionEntry
import dev.milmil.api.DiscoverAnime
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

/** Loading / failure shell shared by every tab, so no tab invents its own. */
@Composable
private fun <T> Loaded(
    state: Loadable<T>,
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
        is Loadable.Ready -> content(state.value)
    }
}

/**
 * 時間表.
 *
 * Not a stack of poster shelves — that is the home page, and it says nothing a
 * schedule is for. The web page groups a day by air time and puts a weekday
 * strip on top; this is that, at phone width: you pick a day, and read down it
 * in the order the episodes actually go out.
 */
@Composable
public fun ScheduleScreen(
    state: Loadable<List<CalendarDay>>,
    onOpen: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    var selected by remember { mutableStateOf<String?>(null) }
    Loaded(state, modifier) { week ->
        val today = LocalDate.now().dayOfWeek
        val wanted = selected ?: today.key()
        val day = week.firstOrNull { it.weekdayEn.key() == wanted } ?: week.firstOrNull()

        Column(Modifier.fillMaxSize()) {
            DayStrip(week, wanted, today) { selected = it }
            if (day == null || day.items.isEmpty()) {
                Box(Modifier.fillMaxSize(), Alignment.Center) {
                    Text("呢日冇新番", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            } else {
                Timeline(day, onOpen)
            }
        }
    }
}

/**
 * Seven pills: the weekday, the date it falls on, and a dot under today.
 * Scrollable because seven at a comfortable touch size do not fit a phone, and
 * a cramped week is worse than a scrolled one.
 */
@Composable
private fun DayStrip(
    week: List<CalendarDay>,
    selectedKey: String,
    today: DayOfWeek,
    onSelect: (String) -> Unit,
) {
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        contentPadding = PaddingValues(horizontal = Tokens.Space.Margin, vertical = 8.dp),
    ) {
        items(week, key = { it.weekdayEn }) { day ->
            val key = day.weekdayEn.key()
            val isToday = key == today.key()
            val isSelected = key == selectedKey
            Column(
                Modifier
                    .width(52.dp)
                    .height(62.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(
                        if (isSelected) Tokens.Accent.copy(alpha = 0.16f) else Color.Transparent,
                    )
                    .pressable({ onSelect(key) }),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    day.weekday.removePrefix("星期"),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = if (isSelected) Tokens.Accent else MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    dateFor(key),
                    style = MaterialTheme.typography.labelSmall,
                    color = if (isSelected) MaterialTheme.colorScheme.onSurface
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Box(
                    Modifier
                        .padding(top = 3.dp)
                        .size(4.dp)
                        .clip(RoundedCornerShape(50))
                        .background(if (isToday) Tokens.Accent else Color.Transparent),
                )
            }
        }
    }
}

@Composable
private fun Timeline(day: CalendarDay, onOpen: (Int) -> Unit) {
    LazyColumn(contentPadding = PaddingValues(bottom = 110.dp)) {
        groupByTime(day.items).forEach { (time, animes) ->
            item(key = "time-$time") {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = Tokens.Space.Margin)
                        .padding(top = 18.dp, bottom = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    // A title the server has no time for sorts first but must
                    // not claim to air at midnight.
                    Text(
                        if (time == "00:00") "時間未定" else time,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = Tokens.Accent,
                    )
                    Box(
                        Modifier
                            .weight(1f)
                            .height(1.dp)
                            .background(Color.White.copy(alpha = 0.08f)),
                    )
                }
            }
            items(animes, key = { it.bangumiId }) { anime ->
                Box(Modifier.padding(horizontal = Tokens.Space.Margin, vertical = 4.dp)) {
                    ScheduleRow(anime) { onOpen(anime.bangumiId) }
                }
            }
        }
    }
}

@Composable
private fun ScheduleRow(anime: DiscoverAnime, onClick: () -> Unit) {
    CardRow(onClick = onClick) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Poster(anime.displayTitle, anime.coverImage, width = 54.dp)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text(
                    anime.displayTitle,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (anime.nextEpisode > 0) {
                        Text(
                            "第 ${anime.nextEpisode} 集",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.SemiBold,
                            color = Tokens.Accent,
                            modifier = Modifier
                                .clip(RoundedCornerShape(50))
                                .background(Tokens.Accent.copy(alpha = 0.18f))
                                .padding(horizontal = 7.dp, vertical = 2.dp),
                        )
                    }
                    if (anime.score > 0) {
                        Text(
                            "★ ${"%.1f".format(anime.score)}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/**
 * Sorted by air time and grouped, the way the web timeline builds it. A title
 * with no time sorts to `00:00` rather than disappearing.
 */
private fun groupByTime(items: List<DiscoverAnime>): List<Pair<String, List<DiscoverAnime>>> {
    val groups = mutableListOf<Pair<String, MutableList<DiscoverAnime>>>()
    items.sortedBy { it.airTime.ifBlank { "00:00" } }.forEach { anime ->
        val time = anime.airTime.ifBlank { "00:00" }
        if (groups.lastOrNull()?.first == time) {
            groups.last().second += anime
        } else {
            groups += time to mutableListOf(anime)
        }
    }
    return groups.map { it.first to it.second.toList() }
}

/**
 * The server spells a weekday "Fri" in one place and "Friday" in another;
 * comparing the two directly selected the wrong day on the iOS client, so both
 * sides normalise to the first three letters.
 */
private fun String.key(): String = take(3).lowercase()

private fun DayOfWeek.key(): String =
    getDisplayName(TextStyle.SHORT, Locale.ENGLISH).take(3).lowercase()

/** The date that weekday falls on this week, so "三" has something under it. */
private fun dateFor(weekdayKey: String): String {
    val order = listOf("mon", "tue", "wed", "thu", "fri", "sat", "sun")
    val target = order.indexOf(weekdayKey)
    val today = order.indexOf(LocalDate.now().dayOfWeek.key())
    if (target < 0 || today < 0) return ""
    return LocalDate.now().plusDays((target - today).toLong())
        .format(DateTimeFormatter.ofPattern("M/d"))
}

@Composable
public fun DiscoverScreen(
    state: Loadable<List<DiscoverAnime>>,
    onOpen: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    Loaded(state, modifier) { items ->
        LazyVerticalGrid(
            columns = GridCells.Adaptive(104.dp),
            contentPadding = PaddingValues(
                start = Tokens.Space.Margin,
                end = Tokens.Space.Margin,
                bottom = 110.dp,
            ),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            items(items, key = { it.bangumiId }) { anime ->
                PosterCard(
                    title = anime.displayTitle,
                    url = anime.coverImage,
                    onClick = { onOpen(anime.bangumiId) },
                    width = 104.dp,
                    score = anime.score,
                )
            }
        }
    }
}

@Composable
public fun SearchScreen(
    query: String,
    results: Loadable<List<DiscoverAnime>>?,
    onQuery: (String) -> Unit,
    onOpen: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxSize()) {
        TextField(
            value = query,
            onValueChange = onQuery,
            placeholder = { Text("搜尋動畫") },
            singleLine = true,
            shape = RoundedCornerShape(28.dp),
            colors = TextFieldDefaults.colors(
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent,
            ),
            modifier = Modifier
                .fillMaxWidth()
                .padding(Tokens.Space.Margin)
                .height(56.dp),
        )
        when {
            results == null -> Box(Modifier.fillMaxSize(), Alignment.Center) {
                Text("輸入片名開始搜尋", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            else -> Loaded(results) { items ->
                if (items.isEmpty()) {
                    Box(Modifier.fillMaxSize(), Alignment.Center) {
                        Text("搵唔到", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                } else {
                    LazyColumn(contentPadding = PaddingValues(bottom = 110.dp)) {
                        items(items, key = { it.bangumiId }) { anime ->
                            Box(Modifier.padding(horizontal = Tokens.Space.Margin, vertical = 4.dp)) {
                                ScheduleRow(anime) { onOpen(anime.bangumiId) }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
public fun CollectionScreen(
    entries: Loadable<List<CollectionEntry>>,
    counts: List<dev.milmil.api.StatusCount>,
    onOpen: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxSize()) {
        if (counts.isNotEmpty()) {
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                contentPadding = PaddingValues(horizontal = Tokens.Space.Margin, vertical = 8.dp),
            ) {
                items(counts, key = { it.status }) { tally ->
                    Text(
                        "${WatchStatus.label(tally.status)} ${tally.count}",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier
                            .clip(RoundedCornerShape(50))
                            .background(Color.White.copy(alpha = 0.08f))
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                    )
                }
            }
        }
        Loaded(entries) { rows ->
            if (rows.isEmpty()) {
                Box(Modifier.fillMaxSize(), Alignment.Center) {
                    Text("收藏係空嘅", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            } else {
                LazyColumn(contentPadding = PaddingValues(bottom = 110.dp)) {
                    items(rows, key = { it.id }) { row ->
                        Box(Modifier.padding(horizontal = Tokens.Space.Margin, vertical = 4.dp)) {
                            CollectionRow(row) { onOpen(row.bangumiId) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CollectionRow(row: CollectionEntry, onClick: () -> Unit) {
    val fraction = if (row.totalEpisodes > 0) {
        row.localFileCount.toFloat() / row.totalEpisodes
    } else {
        0f
    }
    CardRow(onClick = onClick) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Poster(row.displayTitle, row.coverImageUrl, width = 54.dp, progress = fraction)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    row.displayTitle,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    "${row.localFileCount} / ${row.totalEpisodes} 集喺伺服器",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
