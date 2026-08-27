package dev.milmil.api

import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * These are the three-client invariants. If any of them changes here it must
 * change in `MilmilKit` and `web/src/lib/api` too, or the clients will disagree
 * about the same row.
 */
class DecodingTest {
    @Serializable
    private data class Row(
        @Serializable(with = LenientBoolSerializer::class) val enabled: Boolean = false,
        @SerialName("genres") @Serializable(with = LenientStringListSerializer::class) val genres: List<String> = emptyList(),
        @Serializable(with = NullableInstantSerializer::class) val updated: Instant? = null,
    )

    @Test
    fun `booleans arrive as 0 or 1 from SQLite-backed rows`() {
        assertEquals(true, MilmilJson.decodeFromString<Row>("""{"enabled":1}""").enabled)
        assertEquals(false, MilmilJson.decodeFromString<Row>("""{"enabled":0}""").enabled)
    }

    @Test
    fun `booleans also arrive as real JSON booleans from handler DTOs`() {
        assertEquals(true, MilmilJson.decodeFromString<Row>("""{"enabled":true}""").enabled)
        assertEquals(false, MilmilJson.decodeFromString<Row>("""{"enabled":false}""").enabled)
    }

    @Test
    fun `genres may be an array or a JSON string holding one`() {
        assertEquals(listOf("Action", "Drama"), MilmilJson.decodeFromString<Row>("""{"genres":["Action","Drama"]}""").genres)
        assertEquals(listOf("Action", "Drama"), MilmilJson.decodeFromString<Row>("""{"genres":"[\"Action\",\"Drama\"]"}""").genres)
        assertEquals(emptyList(), MilmilJson.decodeFromString<Row>("""{"genres":""}""").genres)
    }

    @Test
    fun `dates come as Go RFC 3339 with nanoseconds`() {
        val row = MilmilJson.decodeFromString<Row>("""{"updated":"2026-08-27T09:07:29.123456789Z"}""")
        assertEquals(Instant.parse("2026-08-27T09:07:29.123456789Z"), row.updated)
    }

    @Test
    fun `dates also come as raw SQLite text`() {
        val row = MilmilJson.decodeFromString<Row>("""{"updated":"2026-08-23 08:00:00"}""")
        assertEquals(Instant.parse("2026-08-23T08:00:00Z"), row.updated)
    }

    @Test
    fun `air dates are date-only`() {
        assertEquals(Instant.parse("2026-07-25T00:00:00Z"), MilmilJson.decodeFromString<Row>("""{"updated":"2026-07-25"}""").updated)
    }

    @Test
    fun `an empty date is null, not an error`() {
        assertNull(MilmilJson.decodeFromString<Row>("""{"updated":""}""").updated)
    }

    @Test
    fun `unknown fields are ignored so a newer server does not break an older client`() {
        assertEquals(true, MilmilJson.decodeFromString<Row>("""{"enabled":1,"something_new":42}""").enabled)
    }

    @Test
    fun `a pasted api path is stripped from the base url`() {
        assertEquals("http://host:8080", ApiClient.normalizeBaseUrl("http://host:8080/api/v1"))
        assertEquals("http://host:8080", ApiClient.normalizeBaseUrl("http://host:8080/"))
        assertEquals("https://example.com/milmil", ApiClient.normalizeBaseUrl("https://example.com/milmil/"))
    }
}
