package dev.milmil.android

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import dev.milmil.api.DiscoverAnime

/**
 * The shelves from the design canvas: a hero carried by its banner, then
 * today's schedule and trending as poster rows. Material 3 shape scale —
 * posters at 12dp, the hero flush to the top edge.
 */
@Composable
public fun HomeScreen(state: HomeState, onOpen: (Int) -> Unit, modifier: Modifier = Modifier) {
    when (state) {
        HomeState.Loading -> Box(modifier.fillMaxSize(), Alignment.Center) {
            CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
        }
        is HomeState.Failed -> Box(modifier.fillMaxSize(), Alignment.Center) {
            Text(state.message, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        is HomeState.Ready -> LazyColumn(
            modifier = modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(20.dp),
            contentPadding = PaddingValues(bottom = 96.dp),
        ) {
            state.hero?.let { hero -> item { Hero(hero, onOpen = { onOpen(hero.bangumiId) }) } }
            if (state.today.isNotEmpty()) item { Shelf("今日時間表", state.today, onOpen) }
            if (state.trending.isNotEmpty()) item { Shelf("熱門", state.trending, onOpen) }
        }
    }
}

@Composable
private fun Hero(anime: DiscoverAnime, onOpen: () -> Unit) {
    Box(Modifier.fillMaxWidth().height(400.dp).clickable(onClick = onOpen)) {
        AsyncImage(
            model = anime.bannerImage.ifBlank { anime.coverImage },
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
        )
        // The scrim is what makes the title readable over arbitrary artwork.
        Box(
            Modifier.fillMaxSize().background(
                Brush.verticalGradient(
                    0f to Color(0x8C070707),
                    0.34f to Color(0x0D070707),
                    0.84f to Color(0xE0070707),
                    1f to MaterialTheme.colorScheme.background,
                ),
            ),
        )
        Column(Modifier.align(Alignment.BottomStart).padding(16.dp)) {
            Text(
                anime.displayTitle,
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                buildString {
                    if (anime.score > 0) append("★ ${anime.score}  ")
                    if (anime.episodeCount > 0) append("${anime.episodeCount} 集")
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun Shelf(title: String, items: List<DiscoverAnime>, onOpen: (Int) -> Unit) {
    Column {
        Text(
            title,
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(start = 16.dp, bottom = 10.dp),
        )
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding = PaddingValues(horizontal = 16.dp),
        ) {
            items(items, key = { it.bangumiId }) { anime ->
                PosterCard(anime, onOpen = { onOpen(anime.bangumiId) })
            }
        }
    }
}

@Composable
private fun PosterCard(anime: DiscoverAnime, onOpen: () -> Unit) {
    Column(Modifier.width(108.dp).clickable(onClick = onOpen)) {
        AsyncImage(
            model = anime.coverImage,
            contentDescription = anime.displayTitle,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(3f / 4f)
                .clip(RoundedCornerShape(12.dp)),
        )
        Text(
            anime.displayTitle,
            style = MaterialTheme.typography.titleSmall,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 8.dp),
        )
    }
}
