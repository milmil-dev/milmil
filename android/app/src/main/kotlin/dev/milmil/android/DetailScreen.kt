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
import androidx.compose.foundation.layout.offset
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
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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
import dev.milmil.api.BangumiComment
import dev.milmil.api.DetailCharacter
import dev.milmil.api.DiscoverAnime
import dev.milmil.api.PlayableEpisode

/**
 * The series page, carrying what the macOS page carries: the artwork header,
 * the collection controls, the synopsis, cast with voice actors, the episode
 * list, recommendations and Bangumi's comments.
 *
 * The first port had a banner, a title and a list — everything that makes the
 * page worth opening was missing.
 */
@Composable
public fun DetailScreen(
    state: Loadable<DetailContent>,
    onBack: () -> Unit,
    onPlay: (PlayableEpisode) -> Unit,
    onFindTorrents: (String) -> Unit,
    onOpen: (Int) -> Unit,
    onStatus: (String) -> Unit,
    onScore: (Int?) -> Unit,
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
            is Loadable.Ready -> Content(state.value, onPlay, onFindTorrents, onOpen, onStatus, onScore)
        }

        // Over the artwork, so it needs its own scrim rather than an app bar.
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
    onOpen: (Int) -> Unit,
    onStatus: (String) -> Unit,
    onScore: (Int?) -> Unit,
) {
    val detail = content.detail
    var expanded by remember { mutableStateOf(false) }
    LazyColumn(contentPadding = PaddingValues(bottom = 40.dp)) {
        item { Banner(detail.bannerImage.ifBlank { detail.coverImage }, detail.displayTitle) }

        item {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Tokens.Space.Margin)
                    .offset(y = (-46).dp),
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                verticalAlignment = Alignment.Bottom,
            ) {
                Poster(detail.displayTitle, detail.coverImage, width = 104.dp, score = detail.score)
                Column(
                    Modifier.padding(bottom = 6.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        detail.displayTitle,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                    )
                    // The original title is what a viewer matches against a
                    // fansub release name; macOS shows it and the phone did not.
                    detail.titleOriginal.takeIf { it.isNotBlank() && it != detail.displayTitle }?.let {
                        Text(
                            it,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Text(
                        meta(content),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        item {
            Actions(content, onPlay, onFindTorrents, onStatus, onScore)
        }

        if (detail.genres.isNotEmpty() || detail.tags.isNotEmpty()) {
            item {
                ChipRow((detail.genres + detail.tags).distinct().take(10))
            }
        }

        detail.blurb.takeIf { it.isNotBlank() }?.let { blurb ->
            item {
                Column(
                    Modifier.padding(horizontal = Tokens.Space.Margin, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        blurb,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = if (expanded) Int.MAX_VALUE else 5,
                        overflow = TextOverflow.Ellipsis,
                    )
                    TextButton(onClick = { expanded = !expanded }, contentPadding = PaddingValues(0.dp)) {
                        Text(if (expanded) "收起" else "展開")
                    }
                }
            }
        }

        if (detail.characters.isNotEmpty()) {
            item { SectionHeader("角色 / 聲優", Modifier.padding(top = Tokens.Space.Section)) }
            item { CastRow(detail.characters) }
        }

        val episodes = content.episodes?.episodes.orEmpty()
        if (episodes.isNotEmpty()) {
            item {
                SectionHeader(
                    "分集",
                    Modifier.padding(top = Tokens.Space.Section),
                    caption = "${content.playableCount} / ${episodes.size} 集喺伺服器",
                )
            }
            items(episodes, key = { it.episodeId }) { episode ->
                EpisodeRow(episode) { onPlay(episode) }
            }
        }

        if (detail.recommendations.isNotEmpty()) {
            item { SectionHeader("推薦", Modifier.padding(top = Tokens.Space.Section)) }
            item {
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    contentPadding = PaddingValues(horizontal = Tokens.Space.Margin, vertical = 12.dp),
                ) {
                    items(detail.recommendations.distinctBy { it.bangumiId }) { anime ->
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

        if (content.comments.isNotEmpty()) {
            item {
                SectionHeader(
                    "評論",
                    Modifier.padding(top = Tokens.Space.Section),
                    caption = "${content.comments.size} 條",
                )
            }
            items(content.comments, key = { it.id }) { comment -> CommentRow(comment) }
        }
    }
}

@Composable
private fun Banner(url: String, title: String) {
    Box(Modifier.fillMaxWidth().height(280.dp)) {
        AsyncImage(
            model = url,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize().background(Tokens.artworkGradient(title)),
        )
        Box(
            Modifier.fillMaxSize().background(
                Brush.verticalGradient(
                    0f to Color.Black.copy(alpha = 0.4f),
                    0.35f to Color.Transparent,
                    0.85f to MaterialTheme.colorScheme.background.copy(alpha = 0.85f),
                    1f to MaterialTheme.colorScheme.background,
                ),
            ),
        )
    }
}

@Composable
private fun Actions(
    content: DetailContent,
    onPlay: (PlayableEpisode) -> Unit,
    onFindTorrents: (String) -> Unit,
    onStatus: (String) -> Unit,
    onScore: (Int?) -> Unit,
) {
    var statusMenu by remember { mutableStateOf(false) }
    var scoreMenu by remember { mutableStateOf(false) }
    val next = content.upNext

    Column(
        Modifier.padding(horizontal = Tokens.Space.Margin),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            if (next != null) {
                Button(
                    onClick = { onPlay(next) },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.onSurface,
                        contentColor = MaterialTheme.colorScheme.background,
                    ),
                ) {
                    Icon(Icons.Filled.PlayArrow, contentDescription = null)
                    Text(
                        if (next.progress?.resumable == true) "繼續睇 第 ${next.sort} 集"
                        else "播放 第 ${next.sort} 集",
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            } else {
                // Nothing on disk: the useful action is to go and get it.
                Button(
                    onClick = { onFindTorrents(content.detail.displayTitle) },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.onSurface,
                        contentColor = MaterialTheme.colorScheme.background,
                    ),
                ) {
                    Icon(Icons.Filled.Search, contentDescription = null)
                    Text("找種子", fontWeight = FontWeight.SemiBold)
                }
            }
            if (next != null) {
                OutlinedButton(onClick = { onFindTorrents(content.detail.displayTitle) }) {
                    Icon(Icons.Filled.Search, contentDescription = "找種子")
                }
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box {
                OutlinedButton(onClick = { statusMenu = true }) {
                    Text(WatchStatus.label(content.watchStatus))
                }
                DropdownMenu(expanded = statusMenu, onDismissRequest = { statusMenu = false }) {
                    WatchStatus.entries.forEach { status ->
                        DropdownMenuItem(
                            text = { Text(status.label) },
                            onClick = {
                                onStatus(status.key)
                                statusMenu = false
                            },
                        )
                    }
                }
            }
            Box {
                OutlinedButton(onClick = { scoreMenu = true }) {
                    Text(content.userScore?.let { "我評 $it" } ?: "評分")
                }
                DropdownMenu(expanded = scoreMenu, onDismissRequest = { scoreMenu = false }) {
                    (10 downTo 1).forEach { score ->
                        DropdownMenuItem(
                            text = { Text("$score") },
                            onClick = {
                                onScore(score)
                                scoreMenu = false
                            },
                        )
                    }
                    DropdownMenuItem(
                        text = { Text("清除評分") },
                        onClick = {
                            onScore(null)
                            scoreMenu = false
                        },
                    )
                }
            }
        }
    }
}

private fun meta(content: DetailContent): String {
    val detail = content.detail
    return buildList {
        detail.airDate.take(4).takeIf { it.isNotBlank() }?.let(::add)
        detail.mediaType.takeIf { it.isNotBlank() }?.let(::add)
        if (detail.episodeCount > 0) add("${detail.episodeCount} 集")
        // Bangumi's score is only meaningful next to how many voted for it.
        if (detail.rating.total > 0) add("★ ${"%.1f".format(detail.rating.score)} · ${detail.rating.total} 人評")
    }.joinToString(" · ")
}

@Composable
private fun ChipRow(items: List<String>) {
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        contentPadding = PaddingValues(horizontal = Tokens.Space.Margin, vertical = 12.dp),
    ) {
        items(items) { item ->
            Text(
                item,
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

@Composable
private fun CastRow(characters: List<DetailCharacter>) {
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        contentPadding = PaddingValues(horizontal = Tokens.Space.Margin, vertical = 12.dp),
    ) {
        items(characters, key = { it.character.id }) { entry ->
            Column(
                Modifier.width(76.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                AsyncImage(
                    model = entry.character.image,
                    contentDescription = entry.character.displayName,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .size(68.dp)
                        .clip(CircleShape)
                        .background(Tokens.artworkGradient(entry.character.displayName)),
                )
                Text(
                    entry.character.displayName,
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                // The voice actor is half of why this section exists.
                entry.voiceActor?.displayName?.takeIf { it.isNotBlank() }?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
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
    Box(Modifier.padding(horizontal = Tokens.Space.Margin, vertical = 4.dp)) {
        CardRow(onClick = onPlay.takeIf { episode.playable }) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Box(
                    Modifier
                        .size(46.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(
                            if (episode.playable) Tokens.Accent.copy(alpha = 0.16f)
                            else Color.White.copy(alpha = 0.06f),
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        "${episode.sort}",
                        style = MaterialTheme.typography.titleSmall,
                        color = if (episode.playable) Tokens.Accent
                        else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(
                        episode.displayTitle,
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (episode.playable) MaterialTheme.colorScheme.onSurface
                        else MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        if (episode.playable) episode.airDate.orEmpty() else "未有檔案",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    episode.progress?.takeIf { it.fraction > 0f }?.let { progress ->
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .height(3.dp)
                                .clip(RoundedCornerShape(50))
                                .background(Color.White.copy(alpha = 0.12f)),
                        ) {
                            Box(
                                Modifier
                                    .fillMaxWidth(progress.fraction)
                                    .fillMaxSize()
                                    .background(Tokens.Accent),
                            )
                        }
                    }
                }
                if (episode.playable) {
                    Icon(
                        Icons.Filled.PlayArrow,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun CommentRow(comment: BangumiComment) {
    Box(Modifier.padding(horizontal = Tokens.Space.Margin, vertical = 4.dp)) {
        CardRow {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                AsyncImage(
                    model = comment.avatar,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .size(34.dp)
                        .clip(CircleShape)
                        .background(Tokens.artworkGradient(comment.displayName)),
                )
                Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(
                            comment.displayName,
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Medium,
                        )
                        if (comment.rate > 0) {
                            Text(
                                "★ ${comment.rate}",
                                style = MaterialTheme.typography.labelSmall,
                                color = Tokens.Accent,
                            )
                        }
                    }
                    Text(
                        comment.comment,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}
