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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import dev.milmil.api.DiscoverAnime
import dev.milmil.api.RecentProgress

/**
 * The shelves: a hero pager, 繼續睇, then the rows. Material 3 shape scale
 * throughout, and everything a user can touch responds to the touch.
 */
@Composable
public fun HomeScreen(
    state: HomeState,
    onOpen: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    when (state) {
        HomeState.Loading -> Column(
            modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(Tokens.Space.Section),
        ) {
            Skeleton(Modifier.fillMaxWidth().height(400.dp), radius = 0.dp)
            ShelfSkeleton()
            ShelfSkeleton()
        }
        is HomeState.Failed -> Box(modifier.fillMaxSize(), Alignment.Center) {
            Text(state.message, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        is HomeState.Ready -> LazyColumn(
            modifier = modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(Tokens.Space.Section),
            contentPadding = PaddingValues(bottom = 110.dp),
        ) {
            if (state.hero.isNotEmpty()) item { Hero(state.hero, onOpen) }
            if (state.continueWatching.isNotEmpty()) {
                item { ContinueRow(state.continueWatching, onOpen) }
            }
            if (state.today.isNotEmpty()) item { Shelf("今日時間表", state.today, onOpen) }
            if (state.trending.isNotEmpty()) item { Shelf("熱門", state.trending, onOpen) }
        }
    }
}

/**
 * A pager rather than one fixed title: the page has to have something to say
 * every time it opens.
 */
@Composable
private fun Hero(items: List<DiscoverAnime>, onOpen: (Int) -> Unit) {
    val pager = rememberPagerState { items.size }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        HorizontalPager(state = pager, modifier = Modifier.height(400.dp)) { page ->
            HeroCard(items[page], onOpen)
        }
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Center,
        ) {
            repeat(items.size) { dot ->
                Box(
                    Modifier
                        .padding(horizontal = 3.dp)
                        .height(6.dp)
                        .width(if (dot == pager.currentPage) 16.dp else 6.dp)
                        .clip(RoundedCornerShape(50))
                        .background(
                            if (dot == pager.currentPage) Color.White.copy(alpha = 0.9f)
                            else Color.White.copy(alpha = 0.22f),
                        ),
                )
            }
        }
    }
}

@Composable
private fun HeroCard(anime: DiscoverAnime, onOpen: (Int) -> Unit) {
    Box(Modifier.fillMaxWidth().height(400.dp)) {
        AsyncImage(
            model = anime.bannerImage.ifBlank { anime.coverImage },
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize().background(Tokens.artworkGradient(anime.displayTitle)),
        )
        // Two scrims, not one: a wash under the status bar so the clock
        // survives bright art, and a deep one at the foot that carries the
        // image into the page.
        Box(
            Modifier.fillMaxSize().background(
                Brush.verticalGradient(
                    0f to Color.Black.copy(alpha = 0.55f),
                    0.28f to Color.Transparent,
                    0.72f to MaterialTheme.colorScheme.background.copy(alpha = 0.75f),
                    1f to MaterialTheme.colorScheme.background,
                ),
            ),
        )
        Column(
            Modifier
                .align(Alignment.BottomStart)
                .padding(horizontal = Tokens.Space.Margin, vertical = 18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                anime.displayTitle,
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                meta(anime).forEach { chip ->
                    Text(
                        chip,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.75f),
                        modifier = Modifier
                            .clip(RoundedCornerShape(50))
                            .background(Color.White.copy(alpha = 0.1f))
                            .padding(horizontal = 9.dp, vertical = 4.dp),
                    )
                }
            }
            Button(
                onClick = { onOpen(anime.bangumiId) },
                colors = ButtonDefaults.buttonColors(
                    // Ink, never the accent: Vesica Violet is for state.
                    containerColor = MaterialTheme.colorScheme.onSurface,
                    contentColor = MaterialTheme.colorScheme.background,
                ),
            ) {
                Icon(Icons.Filled.PlayArrow, contentDescription = null)
                Text("查看詳情", fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

private fun meta(anime: DiscoverAnime): List<String> = buildList {
    if (anime.score > 0) add("★ ${"%.1f".format(anime.score)}")
    anime.airDate.take(4).takeIf { it.isNotBlank() }?.let(::add)
    if (anime.episodeCount > 0) add("${anime.episodeCount} 集")
}

/**
 * 繼續睇 — wide cards, because what you want back is the episode, not the
 * series, and a 3:4 poster cannot show you where you were.
 */
@Composable
private fun ContinueRow(entries: List<RecentProgress>, onOpen: (Int) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionHeader("繼續睇")
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding = PaddingValues(horizontal = Tokens.Space.Margin),
        ) {
            items(entries, key = { it.episodeId }) { entry ->
                ContinueCard(entry) { entry.bangumiId?.let(onOpen) }
            }
        }
    }
}

@Composable
private fun ContinueCard(entry: RecentProgress, onClick: () -> Unit) {
    val shape = RoundedCornerShape(Tokens.Radius.Card)
    val fraction = (entry.durationSeconds ?: 0.0)
        .takeIf { it > 0 }
        ?.let { (entry.positionSeconds / it).toFloat() }
        ?: 0f
    Column(
        Modifier.width(232.dp).pressable(onClick),
        verticalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .height(130.dp)
                .clip(shape)
                .background(Tokens.artworkGradient(entry.displayTitle)),
        ) {
            AsyncImage(
                model = entry.coverImage,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
            Box(
                Modifier.fillMaxSize().background(
                    Brush.verticalGradient(
                        0.5f to Color.Transparent,
                        1f to Color.Black.copy(alpha = 0.7f),
                    ),
                ),
            )
            Icon(
                Icons.Filled.PlayArrow,
                contentDescription = null,
                tint = Color.White.copy(alpha = 0.95f),
                modifier = Modifier.align(Alignment.Center).size(40.dp),
            )
            Box(
                Modifier
                    .align(Alignment.BottomCenter)
                    .padding(horizontal = 10.dp, vertical = 9.dp)
                    .fillMaxWidth()
                    .height(4.dp)
                    .clip(RoundedCornerShape(50))
                    .background(Color.Black.copy(alpha = 0.5f)),
            ) {
                Box(
                    Modifier
                        .fillMaxWidth(fraction.coerceIn(0f, 1f))
                        .fillMaxSize()
                        .background(Tokens.Accent),
                )
            }
        }
        Column {
            Text(
                entry.displayTitle,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                "第 ${entry.episodeNumber} 集 · 仲有 ${entry.remainingMinutes} 分鐘",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun Shelf(title: String, items: List<DiscoverAnime>, onOpen: (Int) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionHeader(title)
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding = PaddingValues(horizontal = Tokens.Space.Margin),
        ) {
            items(items, key = { it.bangumiId }) { anime ->
                PosterCard(
                    title = anime.displayTitle,
                    url = anime.coverImage,
                    onClick = { onOpen(anime.bangumiId) },
                    score = anime.score,
                    badge = anime.nextEpisode.takeIf { it > 0 }?.let { "EP $it" },
                )
            }
        }
    }
}
