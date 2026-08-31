package dev.milmil.api

import kotlin.math.abs
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The Swift `LaneScheduler` tests, ported case for case. The port is only
 * finished when these pass: two clients that lay danmaku out differently for
 * the same episode is a difference a user sees the moment they switch device.
 */
class LaneSchedulerTest {
    private fun comment(n: Int, time: Double, mode: DanmakuMode = DanmakuMode.Scroll) =
        DanmakuComment(id = "c$n", time = time, mode = mode, color = 0xFFFFFF, text = "x", source = "dandanplay")

    @Test
    fun `scroll comments at the same instant take distinct lanes and a later one reuses a freed lane`() {
        // speed 200 over 1000px → 5s on stage.
        val scheduler = LaneScheduler(DanmakuStage(width = 1000.0, height = 500.0, area = 1.0, speed = 200.0))

        val a = scheduler.place(comment(1, 0.0), width = 200.0, height = 30.0, now = 0.0)
        val b = scheduler.place(comment(2, 0.0), width = 200.0, height = 30.0, now = 0.0)
        assertEquals(0.0, a?.y)
        assertEquals(30.0, b?.y)

        // 6s later both have left the stage, so lane 0 is free again.
        val c = scheduler.place(comment(3, 6.0), width = 200.0, height = 30.0, now = 6.0)
        assertEquals(0.0, c?.y)
    }

    @Test
    fun `top stacks downward, bottom stacks upward, and both expire`() {
        val scheduler = LaneScheduler(DanmakuStage(width = 800.0, height = 400.0))

        assertEquals(0.0, scheduler.place(comment(1, 0.0, DanmakuMode.Top), 100.0, 20.0, 0.0)?.y)
        assertEquals(20.0, scheduler.place(comment(2, 0.0, DanmakuMode.Top), 100.0, 20.0, 0.0)?.y)
        assertEquals(380.0, scheduler.place(comment(3, 0.0, DanmakuMode.Bottom), 100.0, 20.0, 0.0)?.y)
        assertEquals(360.0, scheduler.place(comment(4, 0.0, DanmakuMode.Bottom), 100.0, 20.0, 0.0)?.y)
        assertEquals(0.0, scheduler.place(comment(5, 5.0, DanmakuMode.Top), 100.0, 20.0, 5.0)?.y)
    }

    @Test
    fun `no two scroll comments overlap at any time`() {
        val random = Random(42)
        val scheduler = LaneScheduler(DanmakuStage(width = 1280.0, height = 720.0, area = 1.0, speed = 144.0))
        val placements = mutableListOf<DanmakuPlacement>()
        var time = 0.0

        repeat(1000) { n ->
            time += random.nextDouble(0.0, 0.3)
            val width = random.nextDouble(40.0, 400.0)
            scheduler.place(comment(n, time), width = width, height = 28.0, now = time)?.let(placements::add)
        }

        assertTrue(placements.size > 300, "placed only ${placements.size}")
        placements.forEachIndexed { index, first ->
            placements.drop(index + 1)
                .filter { abs(it.y - first.y) < 28.0 }
                .forEach { second ->
                    var t = maxOf(first.startTime, second.startTime)
                    val end = minOf(first.startTime + first.duration, second.startTime + second.duration)
                    while (t <= end) {
                        val x1 = scheduler.scrollX(first, t)
                        val x2 = scheduler.scrollX(second, t)
                        assertTrue(
                            x1 >= x2 + second.width || x2 >= x1 + first.width,
                            "overlap at $t: $first vs $second",
                        )
                        t += 0.05
                    }
                }
        }
    }

    @Test
    fun `area limits the usable height, and overlap wraps instead of dropping`() {
        val strict = LaneScheduler(DanmakuStage(width = 1000.0, height = 100.0, area = 0.5))
        assertNotNull(strict.place(comment(1, 0.0), 100.0, 30.0, 0.0))
        assertNull(strict.place(comment(2, 0.0), 100.0, 30.0, 0.0))

        val loose = LaneScheduler(DanmakuStage(width = 1000.0, height = 100.0, area = 0.5))
        assertNotNull(loose.place(comment(1, 0.0), 100.0, 30.0, 0.0))
        val wrapped = assertNotNull(loose.place(comment(2, 0.0), 100.0, 30.0, 0.0, allowOverlap = true))
        assertTrue(wrapped.y < 50.0, "wrapped to ${wrapped.y}")
    }

    @Test
    fun `reset after a seek frees every lane`() {
        val scheduler = LaneScheduler(DanmakuStage(width = 1000.0, height = 100.0))
        scheduler.place(comment(1, 0.0), 100.0, 30.0, 0.0)
        scheduler.reset()
        assertEquals(0.0, scheduler.place(comment(2, 0.1), 100.0, 30.0, 0.1)?.y)
    }
}
