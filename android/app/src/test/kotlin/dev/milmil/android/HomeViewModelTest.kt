package dev.milmil.android

import dev.milmil.api.CalendarDay
import dev.milmil.api.DiscoverAnime
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class HomeViewModelTest {
    // These are the values the server actually sends — abbreviated. The first
    // version of this test invented "Thursday"/"Friday" and passed while the
    // app matched nothing on a device.
    private val week = listOf(
        CalendarDay(weekday = "星期四", weekdayEn = "Thu", items = listOf(DiscoverAnime(bangumiId = 1))),
        CalendarDay(weekday = "星期五", weekdayEn = "Fri", items = listOf(DiscoverAnime(bangumiId = 2))),
    )

    @Test
    fun `picks the day by its English name, whatever language the server answers in`() {
        assertEquals(listOf(1), week.today("Thu").map { it.bangumiId })
        assertEquals(listOf(2), week.today("Fri").map { it.bangumiId })
    }

    @Test
    fun `a full name still finds an abbreviated day, and the reverse`() {
        assertEquals(listOf(2), week.today("Friday").map { it.bangumiId })
        assertEquals(
            listOf(9),
            listOf(CalendarDay(weekdayEn = "Sunday", items = listOf(DiscoverAnime(bangumiId = 9))))
                .today("Sun").map { it.bangumiId },
        )
    }

    @Test
    fun `matching ignores case`() {
        assertEquals(listOf(1), week.today("thu").map { it.bangumiId })
    }

    @Test
    fun `a day with nothing airing is empty, not an error`() {
        assertTrue(week.today("Sunday").isEmpty())
    }
}
