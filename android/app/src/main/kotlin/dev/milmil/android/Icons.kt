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
