package dev.milmil.api

import io.ktor.http.HttpMethod
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Where a file is being played from, best first. The Kotlin twin of
 * `MilmilPlayer.StreamStage`, minus the two rungs a phone does not have: it
 * keeps no offline copy and mounts no server path in v1.
 */
public enum class StreamStage(public val label: String) {
    /** `GET /stream/{id}/direct`, with Range support. */
    Direct("直接串流"),

    /** `GET /stream/{id}/remux` — fragmented MP4, no re-encode. */
    Remux("Remux"),

    /** `POST /stream/{id}/transcode` → HLS. */
    Hls("轉碼 (HLS)"),
}

/**
 * The ladder the player walks down when a stage fails to open or decode.
 * Behaviour is deliberately identical to the macOS `StreamFallback` — the
 * three clients agreeing on the order is what makes "it plays on my Mac but
 * not my phone" a real bug report rather than an expected difference.
 */
public class StreamFallback(canRemux: Boolean = true, canTranscode: Boolean = true) {
    public val stages: List<StreamStage> = buildList {
        add(StreamStage.Direct)
        if (canRemux) add(StreamStage.Remux)
        if (canTranscode) add(StreamStage.Hls)
    }

    public var index: Int = 0
        private set

    public val current: StreamStage get() = stages[index]
    public val hasNext: Boolean get() = index + 1 < stages.size

    /** Move down one rung, or return null when the ladder is exhausted. */
    public fun advance(): StreamStage? {
        if (!hasNext) return null
        index += 1
        return current
    }

    /** Jump to a rung the user picked; later failures still fall from there. */
    public fun select(stage: StreamStage): Boolean {
        val position = stages.indexOf(stage)
        if (position < 0) return false
        index = position
        return true
    }

    public fun reset() {
        index = 0
    }
}

/**
 * What the server knows about a file before anything is played. `canDirectPlay`
 * and friends decide which rungs the ladder gets, so a file the server already
 * knows needs transcoding does not waste two failed opens first.
 */
@Serializable
public data class MediaInfo(
    val id: String = "",
    val filename: String = "",
    val container: String = "",
    @SerialName("video_codec") val videoCodec: String? = null,
    @SerialName("audio_codec") val audioCodec: String? = null,
    val width: Int? = null,
    val height: Int? = null,
    @SerialName("duration_seconds") val durationSeconds: Double? = null,
    @SerialName("can_direct_play") @Serializable(with = LenientBoolSerializer::class) val canDirectPlay: Boolean = true,
    @SerialName("can_remux") @Serializable(with = LenientBoolSerializer::class) val canRemux: Boolean = true,
    @SerialName("needs_transcode") @Serializable(with = LenientBoolSerializer::class) val needsTranscode: Boolean = false,
    @SerialName("library_online") @Serializable(with = LenientBoolSerializer::class) val libraryOnline: Boolean = true,
) {
    /** A resolution badge: what the OSC shows, and null rather than "0p". */
    public val resolutionLabel: String?
        get() = height?.takeIf { it > 0 }?.let { "${it}p" }
}

/** `mediaApi.info`. */
public suspend fun ApiClient.mediaInfo(fileId: String): MediaInfo =
    MilmilJson.decodeFromString(
        MediaInfo.serializer(),
        execute(HttpMethod.Get, "/api/v1/media-files/$fileId/info", null),
    )

@Serializable
private data class TranscodeResponse(val token: String = "", val status: String = "")

/**
 * `streamApi.transcode` — starts an HLS session and returns the playlist URL.
 * Only the last rung needs it; the other two are plain GETs.
 */
public suspend fun ApiClient.startTranscode(fileId: String, resolution: String = "1080p"): String {
    val body = """{"codec":"h264","resolution":"$resolution"}"""
    val response = MilmilJson.decodeFromString(
        TranscodeResponse.serializer(),
        execute(HttpMethod.Post, "/api/v1/stream/$fileId/transcode", body),
    )
    return "$baseUrl/api/v1/stream/hls/${response.token}/master.m3u8"
}

/**
 * The URL for a rung. Direct and remux carry the token in the query rather
 * than a header, because ExoPlayer opens these itself; the HLS rung's URL
 * comes from [startTranscode] instead and is already authorized by its token.
 */
public fun ApiClient.streamUrl(fileId: String, stage: StreamStage): String {
    val query = token()?.takeIf { it.isNotBlank() }?.let { "?token=${it.encodeUrl()}" } ?: ""
    return when (stage) {
        StreamStage.Direct -> "$baseUrl/api/v1/stream/$fileId/direct$query"
        StreamStage.Remux -> "$baseUrl/api/v1/stream/$fileId/remux$query"
        // Not reachable: the HLS rung's URL comes from startTranscode.
        StreamStage.Hls -> "$baseUrl/api/v1/stream/$fileId/direct$query"
    }
}

/**
 * Whole seconds, not fractions: the server's fields are `int64` and reject a
 * JSON float outright with a 400. Sending `725.0` cost us a watch session that
 * looked like it saved and did not.
 */
@Serializable
private data class ProgressRequest(
    @SerialName("media_file_id") val mediaFileId: String,
    @SerialName("episode_id") val episodeId: String,
    @SerialName("position_seconds") val positionSeconds: Long,
    @SerialName("duration_seconds") val durationSeconds: Long,
    val completed: Boolean,
)

/**
 * `progressApi.save`. Called on a throttle while playing and once on exit, the
 * same shape the web player posts — the three clients share one watch history,
 * so a position written here has to be one the others can resume from.
 */
public suspend fun ApiClient.saveProgress(
    mediaFileId: String,
    episodeId: String,
    positionSeconds: Double,
    durationSeconds: Double,
    completed: Boolean,
) {
    val body = MilmilJson.encodeToString(
        ProgressRequest.serializer(),
        ProgressRequest(
            mediaFileId,
            episodeId,
            positionSeconds.toLong(),
            durationSeconds.toLong(),
            completed,
        ),
    )
    execute(HttpMethod.Post, "/api/v1/progress", body)
}

private fun String.encodeUrl(): String =
    java.net.URLEncoder.encode(this, java.nio.charset.StandardCharsets.UTF_8)
