package dev.milmil.android

import dev.milmil.api.CalendarDay
import dev.milmil.api.DiscoverAnime
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class HomeViewModelTest {
    private val week = listOf(
        CalendarDay(weekday = "星期四", weekdayEn = "Thursday", items = listOf(DiscoverAnime(bangumiId = 1))),
        CalendarDay(weekday = "星期五", weekdayEn = "Friday", items = listOf(DiscoverAnime(bangumiId = 2))),
    )

    @Test
    fun `picks the day by its English name, whatever language the server answers in`() {
        assertEquals(listOf(1), week.today("Thursday").map { it.bangumiId })
        assertEquals(listOf(2), week.today("Friday").map { it.bangumiId })
    }

    @Test
    fun `matching ignores case`() {
        assertEquals(listOf(1), week.today("thursday").map { it.bangumiId })
    }

    @Test
    fun `a day with nothing airing is empty, not an error`() {
        assertTrue(week.today("Sunday").isEmpty())
    }
}
