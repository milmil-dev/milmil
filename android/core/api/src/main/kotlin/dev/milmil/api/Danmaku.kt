package dev.milmil.api

/** One normalized danmaku, whatever its origin. Mirrors `DanmakuComment`. */
public data class DanmakuComment(
    val id: String,
    /** Seconds into the episode. */
    val time: Double,
    val mode: DanmakuMode,
    val color: Int,
    val text: String,
    val source: String,
)

public enum class DanmakuMode {
    /** Right-to-left (DandanPlay modes 1 and 6; the web calls it `rtl`). */
    Scroll,
    Top,
    Bottom,
}

/**
 * Where a comment goes on the stage. `y` is the top edge, origin top-left;
 * a scroll comment starts just past the right edge and leaves past the left
 * one [duration] seconds later.
 */
public data class DanmakuPlacement(
    val y: Double,
    val width: Double,
    val height: Double,
    /** Media time the comment appears. */
    val startTime: Double,
    val duration: Double,
)

/**
 * The stage a scheduler lays comments out on.
 *
 * @param area fraction of the height comments may use (the web's `danmakuArea`)
 * @param speed px/s (the web's `danmakuSpeed`, default 144)
 */
public data class DanmakuStage(
    val width: Double,
    val height: Double,
    val area: Double = 1.0,
    val speed: Double = 144.0,
) {
    /** Every scroll comment gets the same travel time, as the web engine does. */
    public val scrollDuration: Double get() = if (speed > 0) width / speed else 4.0

    public val usableHeight: Double get() = maxOf(0.0, height * minOf(1.0, maxOf(0.1, area)))
}

/**
 * Lane allocation, ported from `MilmilDanmaku.LaneScheduler` — itself a port of
 * the web engine's `allocate.js`. Per mode it keeps a list of occupied vertical
 * ranges; a new comment takes the first gap tall enough, or stacks after the
 * last range it would collide with.
 *
 * The port is only finished when the Swift tests pass here too: two clients
 * that lay danmaku out differently for the same episode is a difference a user
 * sees immediately.
 */
public class LaneScheduler(stage: DanmakuStage) {

    /** Top and bottom comments stay this long. */
    public var fixedDuration: Double = 4.0

    private data class Lane(
        val range: Double,
        val time: Double,
        val width: Double,
        val height: Double,
    )

    public var stage: DanmakuStage = stage
        private set

    private val space = mutableMapOf<DanmakuMode, MutableList<Lane>>()

    init {
        reset()
    }

    public fun resize(stage: DanmakuStage) {
        this.stage = stage
        reset()
    }

    /** Forget every active comment — after a seek, or a settings change. */
    public fun reset() {
        DanmakuMode.entries.forEach { mode ->
            space[mode] = mutableListOf(Lane(range = 0.0, time = -1.0, width = 0.0, height = 0.0))
        }
    }

    private fun durationFor(mode: DanmakuMode): Double =
        if (mode == DanmakuMode.Scroll) stage.scrollDuration else fixedDuration

    /**
     * Place [comment] at media time [now] given its rendered size, or return
     * null when no lane is free and [allowOverlap] is false.
     */
    public fun place(
        comment: DanmakuComment,
        width: Double,
        height: Double,
        now: Double,
        allowOverlap: Boolean = false,
    ): DanmakuPlacement? {
        if (stage.usableHeight < height || width <= 0) return null
        val duration = durationFor(comment.mode)
        val lanes = space.getValue(comment.mode)
        var last = 0
        var current = 0
        var index = 1
        while (index < lanes.size) {
            val lane = lanes[index]
            var required = height
            if (comment.mode != DanmakuMode.Scroll) required += lane.height
            if (lane.range - lane.height - lanes[last].range >= required) {
                current = index
                break
            }
            if (willCollide(lane, width, comment.mode, now, duration)) last = index
            index += 1
        }
        val channel = lanes[last].range
        val bottomEdge = channel + height
        val fits = bottomEdge <= stage.usableHeight
        if (!fits && !allowOverlap) return null

        val entry = Lane(range = bottomEdge, time = now, width = width, height = height)
        val removeCount = if (current > last) current - last - 1 else 0
        repeat(removeCount) { lanes.removeAt(last + 1) }
        lanes.add(last + 1, entry)

        val usable = stage.usableHeight
        val y = if (!fits) {
            // Overlap: wrap the way the web engine does.
            val span = maxOf(1.0, usable - height)
            channel % span
        } else {
            channel
        }
        val top = if (comment.mode == DanmakuMode.Bottom) usable - height - y else y
        return DanmakuPlacement(
            y = maxOf(0.0, top),
            width = width,
            height = height,
            startTime = now,
            duration = duration,
        )
    }

    /** `allocate.js`'s `willCollide`, with media time as the timeline. */
    private fun willCollide(
        lane: Lane,
        width: Double,
        mode: DanmakuMode,
        now: Double,
        duration: Double,
    ): Boolean {
        if (mode != DanmakuMode.Scroll) return now - lane.time < duration
        val laneTotal = stage.width + lane.width
        val laneElapsed = laneTotal * (now - lane.time) / duration
        // Its tail is not fully on stage yet.
        if (lane.width > laneElapsed) return true
        val laneLeftTime = duration + lane.time - now
        val newTotal = stage.width + width
        val newArrivalTime = duration * stage.width / newTotal
        return laneLeftTime > newArrivalTime
    }

    /** Where a scroll comment's left edge is at [time]. */
    public fun scrollX(placement: DanmakuPlacement, time: Double): Double {
        val total = stage.width + placement.width
        val elapsed = maxOf(0.0, time - placement.startTime)
        return stage.width - total * elapsed / placement.duration
    }
}
