package dev.milmil.android

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage

/**
 * The visual tokens.
 *
 * A token layer rather than literals at the call site: the first cut of this
 * app reached for `.white.copy(alpha = 0.06f)` and an arbitrary corner radius
 * wherever a surface was needed, and the result was a dozen slightly different
 * greys and five different radii.
 */
public object Tokens {
    /** Vesica Violet — the web's `--mm-accent`, and the other clients'. */
    public val Accent: Color = Color(0xFFA78BFA)

    /** Corner scale: a poster, a card, a sheet. Anything else is a mistake. */
    public object Radius {
        public val Poster: Dp = 14.dp
        public val Card: Dp = 20.dp
        public val Sheet: Dp = 28.dp
    }

    /** Spacing scale, named for what it separates. */
    public object Space {
        public val Tight: Dp = 6.dp
        public val Inline: Dp = 10.dp
        public val Row: Dp = 14.dp
        public val Margin: Dp = 16.dp
        public val Section: Dp = 28.dp
    }

    /**
     * Poster gradient stand-in, ported from `web/src/lib/gradient.ts` so the
     * same title gets the same colours on every client. It stands in for
     * artwork, not for a surface.
     */
    public fun artworkGradient(name: String): Brush {
        var hash = 5381L
        name.forEach { hash = ((hash shl 5) + hash) xor it.code.toLong() }
        val h1 = (hash % 360).toFloat().let { if (it < 0) it + 360 else it }
        val h2 = (h1 + 55 + ((hash shr 8) % 50)).mod(360f)
        return Brush.linearGradient(
            listOf(hsl(h1, 0.42f, 0.24f), hsl(h2, 0.38f, 0.14f)),
        )
    }

    private fun hsl(hue: Float, saturation: Float, lightness: Float): Color {
        val c = (1 - kotlin.math.abs(2 * lightness - 1)) * saturation
        val x = c * (1 - kotlin.math.abs((hue / 60f).mod(2f) - 1))
        val m = lightness - c / 2
        val (r, g, b) = when {
            hue < 60 -> Triple(c, x, 0f)
            hue < 120 -> Triple(x, c, 0f)
            hue < 180 -> Triple(0f, c, x)
            hue < 240 -> Triple(0f, x, c)
            hue < 300 -> Triple(x, 0f, c)
            else -> Triple(c, 0f, x)
        }
        return Color(r + m, g + m, b + m)
    }
}

/**
 * Presses shrink slightly. The difference between a list of rectangles and an
 * app that feels alive is almost entirely this.
 */
@Composable
public fun Modifier.pressable(onClick: () -> Unit, enabled: Boolean = true): Modifier {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.96f else 1f, label = "press")
    return this
        .scale(scale)
        .clickable(
            interactionSource = interaction,
            indication = null,
            enabled = enabled,
            onClick = onClick,
        )
}

/**
 * Cover art with everything a shelf needs on it: the rounded corner, a
 * gradient stand-in while it loads, a rating, and how far through it you are.
 *
 * One component rather than five hand-rolled `AsyncImage` blocks — the first
 * cut had a different corner radius and a different placeholder on every
 * screen, and no screen showed watch progress at all.
 */
@Composable
public fun Poster(
    title: String,
    url: String?,
    modifier: Modifier = Modifier,
    width: Dp = 112.dp,
    score: Double = 0.0,
    progress: Float = 0f,
    badge: String? = null,
) {
    val shape = RoundedCornerShape(Tokens.Radius.Poster)
    Box(
        modifier
            .width(width)
            .height(width * 1.42f)
            .shadow(10.dp, shape, ambientColor = Color.Black, spotColor = Color.Black)
            .clip(shape)
            .background(Tokens.artworkGradient(title))
            // A hairline keeps a dark poster from dissolving into a dark page.
            .border(0.5.dp, Color.White.copy(alpha = 0.08f), shape),
    ) {
        AsyncImage(
            model = url,
            contentDescription = title,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
        )

        // A scrim only where something sits on the art, so a clean poster
        // stays clean.
        if (score > 0 || progress > 0f) {
            Box(
                Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            0.55f to Color.Transparent,
                            1f to Color.Black.copy(alpha = 0.65f),
                        ),
                    ),
            )
        }

        if (badge != null) {
            Text(
                badge,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                modifier = Modifier
                    .padding(6.dp)
                    .clip(RoundedCornerShape(50))
                    .background(Color.Black.copy(alpha = 0.55f))
                    .padding(horizontal = 6.dp, vertical = 2.dp),
            )
        }

        Column(
            Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .padding(7.dp),
            verticalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            if (score > 0) {
                Text(
                    "★ ${"%.1f".format(score)}",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = Color.White,
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(Color.Black.copy(alpha = 0.45f))
                        .padding(horizontal = 6.dp, vertical = 2.dp),
                )
            }
            if (progress > 0f) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(3.dp)
                        .clip(RoundedCornerShape(50))
                        .background(Color.White.copy(alpha = 0.25f)),
                ) {
                    Box(
                        Modifier
                            .fillMaxWidth(progress.coerceIn(0f, 1f))
                            .fillMaxSize()
                            .background(Tokens.Accent),
                    )
                }
            }
        }
    }
}

/** A poster with its title under it, as a shelf card. */
@Composable
public fun PosterCard(
    title: String,
    url: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    width: Dp = 112.dp,
    score: Double = 0.0,
    progress: Float = 0f,
    badge: String? = null,
    caption: String? = null,
) {
    Column(
        modifier
            .width(width)
            .pressable(onClick),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Poster(title, url, width = width, score = score, progress = progress, badge = badge)
        Column(
            // A fixed caption height keeps a row of cards from going ragged
            // when one title wraps to two lines and its neighbour does not.
            Modifier.height(if (caption == null) 34.dp else 48.dp),
        ) {
            Text(
                title,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                lineHeight = 16.sp,
            )
            if (caption != null) {
                Text(
                    caption,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/** A shelf heading. What makes a label read as a section. */
@Composable
public fun SectionHeader(title: String, modifier: Modifier = Modifier, caption: String? = null) {
    Column(modifier.padding(horizontal = Tokens.Space.Margin)) {
        Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
        if (caption != null) {
            Text(
                caption,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/** A card surface: one tone, one radius, one hairline, everywhere. */
@Composable
public fun CardRow(
    onClick: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    val shape = RoundedCornerShape(Tokens.Radius.Card)
    Box(
        modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.pressable(onClick) else Modifier)
            .clip(shape)
            .background(MaterialTheme.colorScheme.surfaceContainer)
            .border(0.5.dp, Color.White.copy(alpha = 0.06f), shape)
            .padding(10.dp),
        content = content,
    )
}

/**
 * The loading state: shapes where the content will be. A spinner in the middle
 * of an empty screen tells the user nothing about what is coming.
 */
@Composable
public fun Skeleton(modifier: Modifier = Modifier, radius: Dp = 8.dp) {
    Box(
        modifier
            .clip(RoundedCornerShape(radius))
            .background(Color.White.copy(alpha = 0.07f)),
    )
}

/** A shelf of skeletons, so the home page has a shape before it has data. */
@Composable
public fun ShelfSkeleton(modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Skeleton(Modifier.padding(horizontal = Tokens.Space.Margin).width(120.dp).height(20.dp))
        Row(
            Modifier.padding(horizontal = Tokens.Space.Margin),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            repeat(4) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Skeleton(Modifier.width(112.dp).height(159.dp), Tokens.Radius.Poster)
                    Skeleton(Modifier.width(84.dp).height(12.dp))
                }
            }
        }
    }
}
