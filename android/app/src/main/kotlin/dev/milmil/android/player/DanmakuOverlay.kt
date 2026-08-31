package dev.milmil.android.player

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.milmil.android.BuildConfig
import dev.milmil.api.DanmakuComment
import dev.milmil.api.DanmakuMode
import dev.milmil.api.DanmakuPlacement
import dev.milmil.api.DanmakuStage
import dev.milmil.api.LaneScheduler
import androidx.compose.runtime.withFrameNanos

/** What the user can change about danmaku, sharing the web's JSON keys. */
public data class DanmakuSettings(
    val enabled: Boolean = true,
    val fontSize: Float = 20f,
    val opacity: Float = 0.9f,
    /** px/s. The web's `danmakuSpeed`. */
    val speed: Float = 144f,
    /** Fraction of the height comments may use. The web's `danmakuArea`. */
    val area: Float = 1f,
    /** Hard ceiling on comments on stage at once, by what the device can draw. */
    val maxOnStage: Int = 1000,
)

private class ActiveComment(
    val comment: DanmakuComment,
    val placement: DanmakuPlacement,
    val layout: TextLayoutResult,
)

/**
 * Everything the overlay carries between frames. Deliberately plain fields and
 * not `mutableStateOf`: this is written from inside the draw scope, and a
 * snapshot write during draw is not applied — which showed up as danmaku that
 * rendered on a fresh launch and then silently stopped after the first toggle.
 */
private class DanmakuRuntime {
    val scheduler = LaneScheduler(DanmakuStage(1.0, 1.0))
    val active = mutableListOf<ActiveComment>()

    /** Index of the next comment not yet admitted, in a list sorted by time. */
    var cursor = 0
    var lastTime = -1.0
    var frames = 0

    fun rewind(comments: List<DanmakuComment>, now: Double) {
        active.clear()
        scheduler.reset()
        cursor = comments.binarySearchFirstAtOrAfter(now)
    }
}

/**
 * Danmaku over the video, on one Canvas.
 *
 * Media time comes from the engine every frame rather than from `PlaybackState`,
 * which ticks once a second: a comment placed on a one-second grid visibly
 * stutters. Comments are measured once when admitted and the layout kept, so a
 * frame is only arithmetic and one `drawText` each.
 */
@Composable
public fun DanmakuOverlay(
    comments: List<DanmakuComment>,
    engine: PlaybackEngine,
    settings: DanmakuSettings,
    modifier: Modifier = Modifier,
) {
    if (!settings.enabled || comments.isEmpty()) return

    val measurer = rememberTextMeasurer()
    val runtime = remember(comments, settings) { DanmakuRuntime() }
    var frame by remember { mutableStateOf(0L) }

    LaunchedEffect(runtime) {
        while (true) {
            withFrameNanos { frame = it }
        }
    }

    val style = TextStyle(
        fontSize = settings.fontSize.sp,
        fontWeight = FontWeight.Medium,
        // The outline is part of the style rather than four extra draw passes:
        // at ~20 comments on stage that was 100 text draws a frame, and the
        // emulator rendered 32fps with a third of the frames janky.
        shadow = Shadow(
            color = Color.Black.copy(alpha = 0.9f),
            offset = Offset(0f, 1f),
            blurRadius = 4f,
        ),
    )

    Canvas(modifier) {
        // Read `frame` so every vsync redraws.
        @Suppress("UNUSED_EXPRESSION")
        frame

        val now = engine.positionNow()
        val stage = DanmakuStage(
            width = size.width.toDouble(),
            height = size.height.toDouble(),
            area = settings.area.toDouble(),
            speed = settings.speed.toDouble(),
        )
        if (runtime.scheduler.stage != stage) runtime.scheduler.resize(stage)

        // A seek in either direction invalidates every lane and the cursor.
        if (runtime.lastTime < 0 || now < runtime.lastTime - 1.0 || now > runtime.lastTime + 2.0) {
            runtime.rewind(comments, now)
        }
        runtime.lastTime = now

        while (runtime.cursor < comments.size && comments[runtime.cursor].time <= now) {
            val comment = comments[runtime.cursor]
            runtime.cursor += 1
            if (runtime.active.size >= settings.maxOnStage) continue
            val layout = measurer.measure(comment.text, style)
            val placement = runtime.scheduler.place(
                comment = comment,
                width = layout.size.width.toDouble(),
                height = layout.size.height.toDouble(),
                now = now,
            ) ?: continue
            runtime.active += ActiveComment(comment, placement, layout)
        }

        runtime.active.removeAll { now > it.placement.startTime + it.placement.duration }
        runtime.active.forEach { item -> drawComment(item, runtime.scheduler, now, settings) }
        // A still screenshot cannot show whether this is smooth, and it cannot
        // show an overlay that has quietly stopped advancing — both of which
        // happened during development. One line a second in Debug can.
        runtime.frames += 1
        if (BuildConfig.DEBUG && runtime.frames % FRAMES_PER_LOG == 0) {
            android.util.Log.i(
                "milmil.danmaku",
                "frames=${runtime.frames} now=$now cursor=${runtime.cursor}/${comments.size} " +
                    "active=${runtime.active.size} stage=$size",
            )
        }
    }
}

private fun DrawScope.drawComment(
    item: ActiveComment,
    scheduler: LaneScheduler,
    now: Double,
    settings: DanmakuSettings,
) {
    val x = when (item.comment.mode) {
        DanmakuMode.Scroll -> scheduler.scrollX(item.placement, now)
        // Fixed comments are centred, the way every other client centres them.
        else -> (size.width - item.placement.width) / 2
    }
    val offset = Offset(x.toFloat(), item.placement.y.toFloat())
    val color = Color(
        red = (item.comment.color shr 16 and 0xFF) / 255f,
        green = (item.comment.color shr 8 and 0xFF) / 255f,
        blue = (item.comment.color and 0xFF) / 255f,
        alpha = settings.opacity,
    )
    drawText(textLayoutResult = item.layout, color = color, topLeft = offset)
}

/** The first comment at or after [time] in a list sorted by time. */
internal fun List<DanmakuComment>.binarySearchFirstAtOrAfter(time: Double): Int {
    var low = 0
    var high = size
    while (low < high) {
        val mid = (low + high) / 2
        if (this[mid].time < time) low = mid + 1 else high = mid
    }
    return low
}

private const val FRAMES_PER_LOG = 60
