package dev.milmil.android

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

/**
 * Bookmark from the design canvas, drawn here rather than pulled from
 * `material-icons-extended`: that artifact ships thousands of vectors and R8
 * is famously bad at shrinking it.
 */
private fun icon(name: String, filled: Boolean, draw: ImageVector.Builder.() -> Unit) =
    ImageVector.Builder(
        name = name,
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f,
    ).apply(draw).build()

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
