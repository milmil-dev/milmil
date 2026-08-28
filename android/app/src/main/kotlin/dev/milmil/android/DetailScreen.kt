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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
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

import dev.milmil.api.DetailCharacter
import dev.milmil.api.PlayableEpisode

/**
 * The series page: banner, title block, an extended FAB to start watching, then
 * the episode list. The FAB is the Material 3 way to state a screen's one
 * action, and it is the same 繼續睇/播放 decision the other clients make.
 */
@Composable
public fun DetailScreen(
    state: Loadable<DetailContent>,
    onBack: () -> Unit,
    onPlay: (PlayableEpisode) -> Unit,
    onFindTorrents: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(modifier.fillMaxSize()) {
        when (state) {
            Loadable.Loading -> Box(Modifier.fillMaxSize(), Alignment.Center) {
                CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
            }
            is Loadable.Failed -> Box(Modifier.fillMaxSize(), Alignment.Center) {
                Text(state.message, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            is Loadable.Ready -> Content(state.value, onPlay, onFindTorrents)
        }

        // Over the banner, so it needs its own scrim rather than the app bar's.
        IconButton(
            onClick = onBack,
            modifier = Modifier
                .padding(8.dp)
                .size(40.dp)
                .clip(CircleShape)
                .background(Color.Black.copy(alpha = 0.45f)),
        ) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回", tint = Color.White)
        }
    }
}

@Composable
private fun Content(
    content: DetailContent,
    onPlay: (PlayableEpisode) -> Unit,
    onFindTorrents: (String) -> Unit,
) {
    val detail = content.detail
    Box(Modifier.fillMaxSize()) {
        LazyColumn(contentPadding = PaddingValues(bottom = 120.dp)) {
            item { Banner(detail.bannerImage.ifBlank { detail.coverImage }) }
            item {
                Column(Modifier.padding(horizontal = 16.dp)) {
                    Text(
                        detail.displayTitle,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        listOfNotNull(
                            detail.airDate.take(4).takeIf { it.isNotBlank() },
                            detail.mediaType.takeIf { it.isNotBlank() },
                            detail.episodeCount.takeIf { it > 0 }?.let { "$it 集" },
                            detail.score.takeIf { it > 0 }?.let { "★ $it" },
                        ).joinToString(" · "),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                    if (detail.blurb.isNotBlank()) {
                        Text(
                            detail.blurb,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 6,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.padding(top = 12.dp),
                        )
                    }
                }
            }

            if (detail.characters.isNotEmpty()) {
                item { SectionTitle("角色") }
                item { Characters(detail.characters) }
            }

            val episodes = content.episodes?.episodes.orEmpty()
            if (episodes.isNotEmpty()) {
                item { SectionTitle("分集 · ${content.playableCount} / ${episodes.size} 集喺伺服器") }
                items(episodes, key = { it.episodeId }) { episode ->
                    EpisodeRow(episode, onPlay = { onPlay(episode) })
                }
            }
        }

        // Nothing on disk: the useful action is to go and get it, which is what
        // the web and macOS detail pages offer and the phone did not.
        if (content.upNext == null) {
            ExtendedFloatingActionButton(
                onClick = { onFindTorrents(detail.displayTitle) },
                icon = { Icon(Icons.Filled.Search, contentDescription = null) },
                text = { Text("找種子") },
                modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
            )
        }

        content.upNext?.let { next ->
            ExtendedFloatingActionButton(
                onClick = { onPlay(next) },
                icon = { Icon(Icons.Filled.PlayArrow, contentDescription = null) },
                text = {
                    Text(if (next.progress?.resumable == true) "繼續睇 第 ${next.sort} 集" else "播放 第 ${next.sort} 集")
                },
                modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
            )
        }
    }
}

@Composable
private fun Banner(url: String) {
    Box {
        AsyncImage(
            model = url,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f),
        )
        // The title sits under the banner, so the fade only has to carry the
        // image into the page rather than hold text.
        Box(
            Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
                .background(
                    Brush.verticalGradient(
                        0.55f to Color.Transparent,
                        1f to MaterialTheme.colorScheme.background,
                    ),
                ),
        )
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.titleMedium,
        modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 24.dp, bottom = 12.dp),
    )
}

@Composable
private fun Characters(characters: List<DetailCharacter>) {
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        contentPadding = PaddingValues(horizontal = 16.dp),
    ) {
        items(characters, key = { it.character.id }) { entry ->
            Column(Modifier.width(72.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                AsyncImage(
                    model = entry.character.image,
                    contentDescription = entry.character.displayName,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.size(72.dp).clip(CircleShape),
                )
                Text(
                    entry.character.displayName,
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 6.dp),
                )
            }
        }
    }
}

/**
 * One episode. An episode with no file on the server is deliberately still
 * listed but not tappable — knowing episode 44 exists and is missing is the
 * point of the list.
 */
@Composable
private fun EpisodeRow(episode: PlayableEpisode, onPlay: () -> Unit) {
    val enabled = episode.playable
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = enabled, onClick = onPlay)
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        Box(
            Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)).background(
                if (enabled) MaterialTheme.colorScheme.secondaryContainer
                else MaterialTheme.colorScheme.surfaceVariant,
            ),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                "${episode.sort}",
                style = MaterialTheme.typography.labelLarge,
                color = if (enabled) MaterialTheme.colorScheme.onSecondaryContainer
                else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Column(Modifier.fillMaxWidth()) {
            Text(
                episode.displayTitle,
                style = MaterialTheme.typography.bodyLarge,
                color = if (enabled) MaterialTheme.colorScheme.onSurface
                else MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                if (enabled) episode.airDate.orEmpty() else "未有檔案",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            episode.progress?.takeIf { it.fraction > 0f }?.let { progress ->
                LinearProgressIndicator(
                    progress = { progress.fraction },
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp).height(3.dp),
                )
            }
        }
    }
}
