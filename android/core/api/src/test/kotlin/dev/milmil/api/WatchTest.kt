package dev.milmil.api

import io.ktor.client.engine.mock.respond
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Detail and playback, pinned to payloads captured from a running server.
 * Everything here has burned us at least once in another client: null codec
 * fields, `completed` as `0`, and a ladder whose order has to match macOS.
 */
class WatchTest {
    private fun fixture(name: String): String =
        checkNotNull(javaClass.classLoader.getResourceAsStream(name)) { "missing fixture $name" }
            .bufferedReader().readText()

    @Test
    fun `decodes a real playable-episodes response`() {
        val payload = MilmilJson.decodeFromString(
            PlayableEpisodes.serializer(),
            fixture("playable-episodes.json"),
        )

        assertEquals("watching", payload.watchStatus)
        assertEquals(10, payload.episodes.size)

        val first = payload.episodes.first()
        assertEquals(41, first.sort)
        assertEquals("雷神", first.displayTitle)
        assertTrue(first.playable)
        // The scanner has not probed these files, so every dimension is null.
        assertNull(first.mediaFile?.width)
        assertEquals(794652181L, first.mediaFile?.sizeBytes)
    }

    @Test
    fun `up next resumes the episode that was left part-watched`() {
        val payload = MilmilJson.decodeFromString(
            PlayableEpisodes.serializer(),
            fixture("playable-episodes.json"),
        )

        val next = assertNotNull(payload.upNext)
        assertEquals(41, next.sort)
        assertEquals(725.0, next.progress?.positionSeconds)
        assertTrue(next.progress!!.resumable)
    }

    @Test
    fun `an episode watched to the end is not offered as a resume`() {
        assertFalse(WatchPosition(positionSeconds = 1420.0, durationSeconds = 1430.0).resumable)
        assertFalse(WatchPosition(positionSeconds = 4.0, durationSeconds = 1430.0).resumable)
        assertFalse(WatchPosition(positionSeconds = 700.0, durationSeconds = 1430.0, completed = true).resumable)
        assertTrue(WatchPosition(positionSeconds = 700.0, durationSeconds = 1430.0).resumable)
    }

    @Test
    fun `decodes a real detail response`() {
        val detail = MilmilJson.decodeFromString(AnimeDetail.serializer(), fixture("anime-detail.json"))

        assertEquals(530725, detail.bangumiId)
        assertEquals("死神", detail.displayTitle)
        assertEquals("TV", detail.mediaType)
        assertTrue(detail.blurb.isNotBlank())
        assertTrue(detail.tags.isNotEmpty())
        assertTrue(detail.characters.isNotEmpty())
        assertEquals("黒崎一護", detail.characters.first().character.displayName)
    }

    @Test
    fun `decodes recent progress with completed as an integer`() {
        val rows = MilmilJson.decodeFromString(
            kotlinx.serialization.builtins.ListSerializer(RecentProgress.serializer()),
            fixture("progress-recent.json"),
        )

        val row = rows.first()
        assertFalse(row.completed)
        assertEquals(41, row.episodeNumber)
        assertEquals(11, row.remainingMinutes)
    }

    @Test
    fun `media info tolerates the codec fields being null`() {
        val info = MilmilJson.decodeFromString(MediaInfo.serializer(), fixture("media-info.json"))

        assertEquals("mp4", info.container)
        assertNull(info.videoCodec)
        assertNull(info.resolutionLabel)
        assertTrue(info.canDirectPlay)
        // This file cannot be remuxed, so the ladder must not offer that rung.
        assertFalse(info.canRemux)
    }

    @Test
    fun `the ladder falls in the same order as the macOS client`() {
        val ladder = StreamFallback()

        assertEquals(listOf(StreamStage.Direct, StreamStage.Remux, StreamStage.Hls), ladder.stages)
        assertEquals(StreamStage.Direct, ladder.current)
        assertEquals(StreamStage.Remux, ladder.advance())
        assertEquals(StreamStage.Hls, ladder.advance())
        assertNull(ladder.advance())
    }

    @Test
    fun `a file the server cannot remux skips that rung entirely`() {
        val ladder = StreamFallback(canRemux = false)

        assertEquals(listOf(StreamStage.Direct, StreamStage.Hls), ladder.stages)
        assertEquals(StreamStage.Hls, ladder.advance())
    }

    @Test
    fun `picking a rung still falls from there`() {
        val ladder = StreamFallback()

        assertTrue(ladder.select(StreamStage.Remux))
        assertEquals(StreamStage.Remux, ladder.current)
        assertEquals(StreamStage.Hls, ladder.advance())

        ladder.reset()
        assertEquals(StreamStage.Direct, ladder.current)
    }

    @Test
    fun `stream urls carry the token ExoPlayer cannot send as a header`() {
        val client = ApiClient("http://127.0.0.1:18080/") { "mlml_a/b+c" }

        assertEquals(
            "http://127.0.0.1:18080/api/v1/stream/f1/direct?token=mlml_a%2Fb%2Bc",
            client.streamUrl("f1", StreamStage.Direct),
        )
        assertEquals(
            "http://127.0.0.1:18080/api/v1/stream/f1/remux?token=mlml_a%2Fb%2Bc",
            client.streamUrl("f1", StreamStage.Remux),
        )
    }

    @Test
    fun `progress is posted as whole seconds`() = kotlinx.coroutines.test.runTest {
        var body: String? = null
        val engine = io.ktor.client.engine.mock.MockEngine { request ->
            body = (request.body as io.ktor.http.content.TextContent).text
            respond(
                content = "{}",
                headers = io.ktor.http.headersOf(io.ktor.http.HttpHeaders.ContentType, "application/json"),
            )
        }
        val client = ApiClient("http://x", engine) { "mlml_t" }

        client.saveProgress("f1", "e1", positionSeconds = 742.6, durationSeconds = 1430.0, completed = false)

        // The server's fields are int64 and answer 400 to a JSON float, which
        // once made every watch session silently fail to save.
        assertEquals(
            """{"media_file_id":"f1","episode_id":"e1","position_seconds":742,"duration_seconds":1430,"completed":false}""",
            body,
        )
    }
}
