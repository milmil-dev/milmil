package dev.milmil.android

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

/**
 * The flame and bookmark from the design canvas, drawn here rather than pulled
 * from `material-icons-extended`: that artifact ships thousands of vectors and
 * R8 is famously bad at shrinking it, for two glyphs.
 */
private fun icon(name: String, filled: Boolean, draw: androidx.compose.ui.graphics.vector.ImageVector.Builder.() -> Unit) =
    ImageVector.Builder(
        name = name,
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f,
    ).apply(draw).build()

private const val FLAME = "M12 2.5c2.7 3.4 4.3 6 4.3 8.5a4.3 4.3 0 0 1-8.6 0c0-1 .3-2 1-3 .2 1.4.9 2.1 1.7 2.3C10.2 8 10.7 5.3 12 2.5Z"

/** Discover. Outlined when the tab is not selected, filled when it is. */
public val DiscoverFlameFilled: ImageVector = icon("DiscoverFlameFilled", true) {
    path(fill = SolidColor(Color.Black)) {
        moveTo(12f, 2.5f)
        curveToRelative(2.7f, 3.4f, 4.3f, 6f, 4.3f, 8.5f)
        arcToRelative(4.3f, 4.3f, 0f, isMoreThanHalf = false, isPositiveArc = true, -8.6f, 0f)
        curveToRelative(0f, -1f, 0.3f, -2f, 1f, -3f)
        curveToRelative(0.2f, 1.4f, 0.9f, 2.1f, 1.7f, 2.3f)
        curveTo(10.2f, 8f, 10.7f, 5.3f, 12f, 2.5f)
        close()
        moveTo(6.5f, 13.5f)
        curveToRelative(0f, 3f, 2.5f, 5.5f, 5.5f, 5.5f)
        reflectiveCurveToRelative(5.5f, -2.5f, 5.5f, -5.5f)
        lineTo(19f, 13.5f)
        curveToRelative(0f, 3.9f, -3.1f, 7f, -7f, 7f)
        reflectiveCurveToRelative(-7f, -3.1f, -7f, -7f)
        close()
    }
}

public val DiscoverFlameOutlined: ImageVector = icon("DiscoverFlameOutlined", false) {
    path(
        stroke = SolidColor(Color.Black),
        strokeLineWidth = 1.9f,
        strokeLineCap = StrokeCap.Round,
        strokeLineJoin = StrokeJoin.Round,
    ) {
        moveTo(12f, 2.5f)
        curveToRelative(2.7f, 3.4f, 4.3f, 6f, 4.3f, 8.5f)
        arcToRelative(4.3f, 4.3f, 0f, isMoreThanHalf = false, isPositiveArc = true, -8.6f, 0f)
        curveToRelative(0f, -1f, 0.3f, -2f, 1f, -3f)
        curveToRelative(0.2f, 1.4f, 0.9f, 2.1f, 1.7f, 2.3f)
        curveTo(10.2f, 8f, 10.7f, 5.3f, 12f, 2.5f)
        close()
        moveTo(6.5f, 13.5f)
        arcToRelative(5.5f, 5.5f, 0f, isMoreThanHalf = false, isPositiveArc = false, 11f, 0f)
    }
}

/** Collection. A bookmark, matching the canvas rather than a star. */
public val BookmarkFilled: ImageVector = icon("BookmarkFilled", true) {
    path(fill = SolidColor(Color.Black)) {
        moveTo(6f, 3f)
        horizontalLineToRelative(12f)
        verticalLineToRelative(18f)
        lineToRelative(-6f, -4.5f)
        lineTo(6f, 21f)
        close()
    }
}

public val BookmarkOutlined: ImageVector = icon("BookmarkOutlined", false) {
    path(
        stroke = SolidColor(Color.Black),
        strokeLineWidth = 1.9f,
        strokeLineCap = StrokeCap.Round,
        strokeLineJoin = StrokeJoin.Round,
    ) {
        moveTo(6f, 3f)
        horizontalLineToRelative(12f)
        verticalLineToRelative(18f)
        lineToRelative(-6f, -4.5f)
        lineTo(6f, 21f)
        close()
    }
}

/**
 * Pause. `material-icons-core` ships play but not pause, and a rotated plus is
 * not a pause glyph — two 4×14 bars at the same optical weight as the play
 * triangle next to it.
 */
public val PauseFilled: ImageVector = icon("PauseFilled", true) {
    path(fill = SolidColor(Color.Black)) {
        moveTo(8f, 5f)
        horizontalLineToRelative(3f)
        verticalLineToRelative(14f)
        horizontalLineToRelative(-3f)
        close()
        moveTo(13f, 5f)
        horizontalLineToRelative(3f)
        verticalLineToRelative(14f)
        horizontalLineToRelative(-3f)
        close()
    }
}

/** Skip to the next episode: a play triangle against a bar. */
public val SkipNextFilled: ImageVector = icon("SkipNextFilled", true) {
    path(fill = SolidColor(Color.Black)) {
        moveTo(6f, 5f)
        lineTo(15f, 12f)
        lineTo(6f, 19f)
        close()
        moveTo(16f, 5f)
        horizontalLineToRelative(2.5f)
        verticalLineToRelative(14f)
        horizontalLineToRelative(-2.5f)
        close()
    }
}

/**
 * Rewind: an open circle whose arrow head sits top-left, pointing the way the
 * motion goes. The first cut had the two arcs curving the same way, so the
 * rewind button read as fast-forward — the seconds label goes inside the ring
 * at the call site, the way Material draws these.
 */
public val RewindArc: ImageVector = icon("RewindArc", false) {
    path(
        stroke = SolidColor(Color.Black),
        strokeLineWidth = 1.7f,
        strokeLineCap = StrokeCap.Round,
    ) {
        // The long way round the circle, leaving a gap at the top for the head.
        moveTo(14.7f, 4.5f)
        arcToRelative(8f, 8f, 0f, isMoreThanHalf = true, isPositiveArc = true, -5.4f, 0f)
    }
    path(fill = SolidColor(Color.Black)) {
        moveTo(6.6f, 4.5f)
        lineTo(11.2f, 1.9f)
        lineTo(11.2f, 7.1f)
        close()
    }
}

/** Fast forward: the same ring mirrored, head at the top-right. */
public val ForwardArc: ImageVector = icon("ForwardArc", false) {
    path(
        stroke = SolidColor(Color.Black),
        strokeLineWidth = 1.7f,
        strokeLineCap = StrokeCap.Round,
    ) {
        moveTo(9.3f, 4.5f)
        arcToRelative(8f, 8f, 0f, isMoreThanHalf = true, isPositiveArc = false, 5.4f, 0f)
    }
    path(fill = SolidColor(Color.Black)) {
        moveTo(17.4f, 4.5f)
        lineTo(12.8f, 1.9f)
        lineTo(12.8f, 7.1f)
        close()
    }
}

/** Subtitles: a frame with two text rules sitting low in it. */
public val SubtitlesOutlined: ImageVector = icon("SubtitlesOutlined", false) {
    path(
        stroke = SolidColor(Color.Black),
        strokeLineWidth = 1.7f,
        strokeLineJoin = StrokeJoin.Round,
    ) {
        moveTo(3f, 5f)
        horizontalLineToRelative(18f)
        verticalLineToRelative(14f)
        horizontalLineToRelative(-18f)
        close()
    }
    path(fill = SolidColor(Color.Black)) {
        moveTo(6f, 12.6f)
        horizontalLineToRelative(6f)
        verticalLineToRelative(1.8f)
        horizontalLineToRelative(-6f)
        close()
        moveTo(13.5f, 12.6f)
        horizontalLineToRelative(4.5f)
        verticalLineToRelative(1.8f)
        horizontalLineToRelative(-4.5f)
        close()
        moveTo(6f, 15.8f)
        horizontalLineToRelative(3f)
        verticalLineToRelative(1.8f)
        horizontalLineToRelative(-3f)
        close()
        moveTo(10.5f, 15.8f)
        horizontalLineToRelative(7.5f)
        verticalLineToRelative(1.8f)
        horizontalLineToRelative(-7.5f)
        close()
    }
}

/** Audio track: a speaker with one wave, distinct from the subtitle frame. */
public val AudioTrackOutlined: ImageVector = icon("AudioTrackOutlined", false) {
    path(fill = SolidColor(Color.Black)) {
        moveTo(4f, 9f)
        horizontalLineToRelative(3f)
        lineTo(11.5f, 4.5f)
        verticalLineToRelative(15f)
        lineTo(7f, 15f)
        horizontalLineToRelative(-3f)
        close()
    }
    path(
        stroke = SolidColor(Color.Black),
        strokeLineWidth = 1.7f,
        strokeLineCap = StrokeCap.Round,
    ) {
        moveTo(15f, 9f)
        arcToRelative(4.2f, 4.2f, 0f, isMoreThanHalf = false, isPositiveArc = true, 0f, 6f)
        moveTo(17.8f, 6.2f)
        arcToRelative(8f, 8f, 0f, isMoreThanHalf = false, isPositiveArc = true, 0f, 11.6f)
    }
}

/** Danmaku: a comment bubble with the streaming lines inside it. */
public val DanmakuOutlined: ImageVector = icon("DanmakuOutlined", false) {
    path(
        stroke = SolidColor(Color.Black),
        strokeLineWidth = 1.7f,
        strokeLineJoin = StrokeJoin.Round,
    ) {
        moveTo(3f, 5f)
        horizontalLineToRelative(18f)
        verticalLineToRelative(11f)
        horizontalLineToRelative(-11f)
        lineTo(6f, 20f)
        verticalLineToRelative(-4f)
        horizontalLineToRelative(-3f)
        close()
    }
    path(fill = SolidColor(Color.Black)) {
        moveTo(6f, 8f)
        horizontalLineToRelative(9f)
        verticalLineToRelative(1.6f)
        horizontalLineToRelative(-9f)
        close()
        moveTo(16.5f, 8f)
        horizontalLineToRelative(2f)
        verticalLineToRelative(1.6f)
        horizontalLineToRelative(-2f)
        close()
        moveTo(6f, 11.4f)
        horizontalLineToRelative(4f)
        verticalLineToRelative(1.6f)
        horizontalLineToRelative(-4f)
        close()
        moveTo(11.5f, 11.4f)
        horizontalLineToRelative(7f)
        verticalLineToRelative(1.6f)
        horizontalLineToRelative(-7f)
        close()
    }
}
