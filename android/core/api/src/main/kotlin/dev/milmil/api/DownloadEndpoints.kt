package dev.milmil.api

import io.ktor.http.HttpMethod
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer

/** One aria2 download, as the downloads list shows it. */
@Serializable
public data class Download(
    val id: String = "",
    val gid: String = "",
    val name: String = "",
    /** active | waiting | paused | complete | error | removed */
    val status: String = "",
    @SerialName("total_bytes") val totalBytes: Long = 0,
    @SerialName("completed_bytes") val completedBytes: Long = 0,
    @SerialName("speed_bytes") val speedBytes: Long = 0,
) {
    public val fraction: Float
        get() = if (totalBytes > 0) (completedBytes.toDouble() / totalBytes).toFloat().coerceIn(0f, 1f) else 0f

    public val active: Boolean get() = status == "active"

    /**
     * What to show as the name. aria2 reports the magnet URI until it has
     * pulled the torrent's metadata, and a 60-character hash is not a name —
     * the row read as a bug on the first real download.
     */
    public val displayName: String
        get() = name.takeIf { it.isNotBlank() && !it.startsWith("magnet:") } ?: "取得種子資料中…"
}

private val downloadSerializer = ListSerializer(Download.serializer())

/** `downloadApi.list`. */
public suspend fun ApiClient.downloads(): List<Download> =
    MilmilJson.decodeFromString(
        downloadSerializer,
        execute(HttpMethod.Get, "/api/v1/downloads", null),
    )

/** `downloadApi.pause`. */
public suspend fun ApiClient.pauseDownload(gid: String) {
    execute(HttpMethod.Post, "/api/v1/downloads/$gid/pause", null)
}

/** `downloadApi.resume`. */
public suspend fun ApiClient.resumeDownload(gid: String) {
    execute(HttpMethod.Post, "/api/v1/downloads/$gid/resume", null)
}

/** `downloadApi.delete` — the row only; the file on disk is left alone. */
public suspend fun ApiClient.deleteDownload(gid: String) {
    execute(HttpMethod.Delete, "/api/v1/downloads/$gid", null)
}

/**
 * One torrent as a search source returns it. Field names come from a real
 * response: the site is `source_site`, not `source`, and `size` is already
 * formatted ("1.4 GiB") rather than a byte count.
 */
@Serializable
public data class TorrentResult(
    val title: String = "",
    val magnet: String = "",
    val size: String = "",
    val seeders: Int = 0,
    val leechers: Int = 0,
    @SerialName("sub_group") val subGroup: String = "",
    @SerialName("source_site") val sourceSite: String = "",
    @SerialName("publish_date") val publishDate: String = "",
)

@Serializable
private data class TorrentResults(val results: List<TorrentResult> = emptyList())

/**
 * `discoverApi.animeTorrents` — 找種子 for a series with nothing on disk, the
 * one thing the web and macOS detail pages offer that the phone did not.
 */
public suspend fun ApiClient.animeTorrents(bangumiId: Int): List<TorrentResult> =
    MilmilJson.decodeFromString(
        TorrentResults.serializer(),
        execute(HttpMethod.Get, "/api/v1/discover/anime/$bangumiId/torrents", null),
    ).results

@Serializable
private data class DownloadRequest(val url: String, @SerialName("bangumi_id") val bangumiId: Int?)

/** `downloadApi.create` — hand a magnet to aria2. */
public suspend fun ApiClient.startDownload(magnet: String, bangumiId: Int? = null) {
    val body = MilmilJson.encodeToString(DownloadRequest.serializer(), DownloadRequest(magnet, bangumiId))
    execute(HttpMethod.Post, "/api/v1/downloads", body)
}
