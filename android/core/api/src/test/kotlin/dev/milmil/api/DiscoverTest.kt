package dev.milmil.api

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import io.ktor.client.engine.mock.respond
import kotlinx.serialization.builtins.ListSerializer

/**
 * Decodes payloads captured from a running server, so the DTOs are pinned to
 * what the API actually sends rather than to what the spec says.
 */
class DiscoverTest {
    /** Answers with a fixed body instead of making a request. */
    private fun respondingEngine(body: String, into: MutableList<String>) =
        io.ktor.client.engine.mock.MockEngine { request ->
            into += request.url.toString()
            respond(
                content = body,
                headers = io.ktor.http.headersOf(io.ktor.http.HttpHeaders.ContentType, "application/json"),
            )
        }

    /** Captures the path of every request instead of making one. */
    private fun recordingEngine(into: MutableList<String>) =
        io.ktor.client.engine.mock.MockEngine { request ->
            into += request.url.toString()
            respond(
                content = "[]",
                headers = io.ktor.http.headersOf(io.ktor.http.HttpHeaders.ContentType, "application/json"),
            )
        }

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

    @Test
    fun `query strings interpolate — a literal dollar means a broken request`() {
        // `browse?page=${'$'}page` compiles fine and sends the characters
        // "$page" to the server. Only a request-level check catches it.
        val paths = mutableListOf<String>()
        val client = ApiClient("http://host", recordingEngine(paths))
        kotlinx.coroutines.runBlocking {
            runCatching { client.browse(page = 3) }
            runCatching { client.trending(page = 2) }
            runCatching { client.search("re zero", page = 1) }
        }
        assertTrue(paths.isNotEmpty())
        assertTrue(paths.none { it.contains('$') }, "literal dollar in $paths")
        assertTrue(paths.any { it.contains("browse?page=3") }, paths.toString())
        assertTrue(paths.any { it.contains("trending?page=2") }, paths.toString())
        assertTrue(paths.any { it.contains("q=re+zero") || it.contains("q=re%20zero") }, paths.toString())
    }

    @Test
    fun `a repeated title is dropped — the grid keys on the id and Compose demands unique keys`() {
        val body = """[
            {"bangumi_id":118335,"title":"進擊的巨人"},
            {"bangumi_id":2782,"title":"火影忍者疾風傳"},
            {"bangumi_id":118335,"title":"進擊的巨人"},
            {"bangumi_id":2782,"title":"火影忍者疾風傳"}
        ]"""
        val paths = mutableListOf<String>()
        val client = ApiClient("http://host", respondingEngine(body, paths))
        val rows = kotlinx.coroutines.runBlocking { client.browse() }
        assertEquals(listOf(118335, 2782), rows.map { it.bangumiId })
    }

    @Test
    fun `every request carries the client's language, like MilmilKit does`() {
        val headers = mutableListOf<String?>()
        val engine = io.ktor.client.engine.mock.MockEngine { request ->
            headers += request.headers["X-Milmil-Locale"]
            respond(
                content = "[]",
                headers = io.ktor.http.headersOf(io.ktor.http.HttpHeaders.ContentType, "application/json"),
            )
        }
        val client = ApiClient("http://host", engine, locale = "zh-Hant-HK")
        kotlinx.coroutines.runBlocking { runCatching { client.trending() } }
        assertEquals(listOf<String?>("zh-Hant-HK"), headers.toList())
    }
}
