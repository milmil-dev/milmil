package dev.milmil.api

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.serialization.builtins.ListSerializer

/**
 * Decodes payloads captured from a running server, so the DTOs are pinned to
 * what the API actually sends rather than to what the spec says.
 */
class DiscoverTest {
    private fun fixture(name: String): String =
        checkNotNull(javaClass.classLoader.getResourceAsStream(name)) { "missing fixture $name" }
            .bufferedReader().readText()

    @Test
    fun `decodes a real trending response`() {
        val items = MilmilJson.decodeFromString(ListSerializer(DiscoverAnime.serializer()), fixture("trending.json"))
        assertEquals(2, items.size)
        assertTrue(items.all { it.bangumiId > 0 })
        assertTrue(items.all { it.coverImage.startsWith("https://") })
    }

    @Test
    fun `score arrives as an int for whole numbers and a double otherwise`() {
        val items = MilmilJson.decodeFromString(
            ListSerializer(DiscoverAnime.serializer()),
            """[{"bangumi_id":1,"score":8},{"bangumi_id":2,"score":7.4}]""",
        )
        assertEquals(8.0, items[0].score)
        assertEquals(7.4, items[1].score)
    }

    @Test
    fun `decodes a real calendar response`() {
        val days = MilmilJson.decodeFromString(ListSerializer(CalendarDay.serializer()), fixture("calendar.json"))
        assertEquals(2, days.size)
        assertTrue(days.all { it.weekday.isNotBlank() && it.weekdayEn.isNotBlank() })
    }

    @Test
    fun `a shelf card falls back outward when the localized title is empty`() {
        assertEquals("原題", DiscoverAnime(titleOriginal = "原題").displayTitle)
        assertEquals("English", DiscoverAnime(titleEn = "English", titleOriginal = "原題").displayTitle)
        assertEquals("中文", DiscoverAnime(title = "中文", titleEn = "English").displayTitle)
    }

    @Test
    fun `a collection row is not a discover row — the field names differ`() {
        val rows = MilmilJson.decodeFromString(
            ListSerializer(CollectionEntry.serializer()),
            fixture("collection.json"),
        )
        assertTrue(rows.isNotEmpty())
        val row = rows.first()
        assertTrue(row.bangumiId > 0)
        // cover_image_url, not cover_image — decoding this as DiscoverAnime
        // would leave the poster blank instead of failing loudly.
        assertTrue(row.coverImageUrl.isNotBlank())
        assertTrue(row.totalEpisodes >= 0)
    }

    @Test
    fun `a collection title prefers the Chinese field the endpoint adds`() {
        assertEquals("中文", CollectionEntry(titleZh = "中文", title = "Romaji").displayTitle)
        assertEquals("Romaji", CollectionEntry(title = "Romaji", titleEn = "English").displayTitle)
    }

    @Test
    fun `an explicit null falls back to the default, not an exception`() {
        // Real collection rows carry "title_en": null.
        val rows = MilmilJson.decodeFromString(
            ListSerializer(CollectionEntry.serializer()),
            """[{"bangumi_id":1,"title":"有","title_en":null,"cover_image_url":null}]""",
        )
        assertEquals("", rows.first().titleEn)
        assertEquals("", rows.first().coverImageUrl)
    }
}
