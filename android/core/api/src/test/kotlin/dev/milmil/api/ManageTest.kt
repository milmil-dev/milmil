package dev.milmil.api

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.serialization.builtins.ListSerializer

/**
 * The management screens' payloads, captured from a running server. Every
 * assertion here is about a shape the API actually sends rather than the one
 * the spec describes — `0|1` booleans and a pre-formatted size string have
 * each cost another client a screen.
 */
class ManageTest {
    private fun fixture(name: String): String =
        checkNotNull(javaClass.classLoader.getResourceAsStream(name)) { "missing fixture $name" }
            .bufferedReader().readText()

    @Test
    fun `decodes libraries with their scan counts`() {
        val libraries = MilmilJson.decodeFromString(
            ListSerializer(Library.serializer()),
            fixture("libraries.json"),
        )

        val library = libraries.first()
        assertEquals("Milmil", library.name)
        assertEquals("/media", library.path)
        // `enabled` is 1, not true.
        assertTrue(library.enabled)
        assertEquals(5, library.fileCount)
        assertEquals(5, library.matchedCount)
        assertEquals(3818020219L, library.totalSizeBytes)
    }

    @Test
    fun `decodes notifications with read as an integer`() {
        val rows = MilmilJson.decodeFromString(
            ListSerializer(AppNotification.serializer()),
            fixture("notifications.json"),
        )

        assertTrue(rows.isNotEmpty())
        assertFalse(rows.first().read)
        assertTrue(rows.any { it.type == "library.scan_complete" })
    }

    @Test
    fun `decodes a history page and its cursor`() {
        val page = MilmilJson.decodeFromString(HistoryPage.serializer(), fixture("history.json"))

        assertTrue(page.items.isNotEmpty())
        val row = page.items.first()
        assertEquals(41, row.episodeNumber)
        assertEquals(530725, row.bangumiId)
        // Null means there is no further page, not an error.
        assertEquals(null, page.nextBefore)
    }

    @Test
    fun `decodes torrents with the field names the sources really use`() {
        val results = MilmilJson.decodeFromString(
            TorrentResults2.serializer(),
            fixture("torrents.json"),
        ).results

        val first = results.first()
        assertTrue(first.magnet.startsWith("magnet:?"))
        // Already formatted by the server; not a byte count to render ourselves.
        assertTrue(first.size.contains(" "))
        assertTrue(first.sourceSite.isNotBlank())
        assertTrue(first.seeders >= 0)
    }

    @Test
    fun `a download reports how far along it is`() {
        val download = Download(totalBytes = 1000, completedBytes = 250, status = "active")

        assertEquals(0.25f, download.fraction)
        assertTrue(download.active)
        // A download the server has not sized yet must not divide by zero.
        assertEquals(0f, Download(totalBytes = 0, completedBytes = 10).fraction)
        // aria2 names a fresh torrent by its magnet until metadata arrives.
        assertEquals("取得種子資料中…", Download(name = "magnet:?xt=urn:btih:abc").displayName)
        assertEquals("Episode 01.mkv", Download(name = "Episode 01.mkv").displayName)
    }

    @Test
    fun `a history row says what state the episode is in`() {
        // 20 seconds from the end is finished for every purpose the user has;
        // the first cut rendered "仲有 0 分鐘", which is not a sentence.
        assertEquals("睇晒", RecentProgress(positionSeconds = 1410.0, durationSeconds = 1430.0).watchLabel)
        assertEquals("睇晒", RecentProgress(positionSeconds = 5.0, durationSeconds = 1430.0, completed = true).watchLabel)
        // Under a minute left but not yet past the 92% mark: a short episode.
        assertEquals("就快睇完", RecentProgress(positionSeconds = 550.0, durationSeconds = 600.0).watchLabel)
        assertEquals("仲有 11 分鐘", RecentProgress(positionSeconds = 725.0, durationSeconds = 1430.0).watchLabel)
    }
}


/** The test needs the envelope the endpoint unwraps internally. */
@kotlinx.serialization.Serializable
internal data class TorrentResults2(val results: List<TorrentResult> = emptyList())