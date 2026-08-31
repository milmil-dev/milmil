package dev.milmil.api

import io.ktor.http.HttpMethod
import java.time.Instant
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer

/**
 * A media library with the scan counts the list needs. `enabled` and
 * `rename_auto` arrive as `0|1`, and `last_scanned_at` is null until the
 * first scan finishes.
 */
@Serializable
public data class Library(
    val id: String = "",
    val name: String = "",
    val path: String = "",
    @Serializable(with = LenientBoolSerializer::class) val enabled: Boolean = true,
    @SerialName("source_type") val sourceType: String = "local",
    @SerialName("scan_interval_minutes") val scanIntervalMinutes: Int = 0,
    @SerialName("last_scanned_at") @Serializable(with = NullableInstantSerializer::class) val lastScannedAt: Instant? = null,
    @SerialName("file_count") val fileCount: Int = 0,
    @SerialName("matched_count") val matchedCount: Int = 0,
    @SerialName("unmatched_count") val unmatchedCount: Int = 0,
    @SerialName("total_size_bytes") val totalSizeBytes: Long = 0,
)

private val librarySerializer = ListSerializer(Library.serializer())

/** `libraryApi.list`. */
public suspend fun ApiClient.libraries(): List<Library> =
    MilmilJson.decodeFromString(
        librarySerializer,
        execute(HttpMethod.Get, "/api/v1/libraries", null),
    )

/** `libraryApi.scan` — fire and forget; progress arrives as a notification. */
public suspend fun ApiClient.scanLibrary(id: String) {
    execute(HttpMethod.Post, "/api/v1/libraries/$id/scan", null)
}

/** One row of 通知. */
@Serializable
public data class AppNotification(
    val id: String = "",
    val type: String = "",
    val title: String = "",
    val message: String = "",
    val severity: String = "info",
    @Serializable(with = LenientBoolSerializer::class) val read: Boolean = false,
    @SerialName("created_at") @Serializable(with = NullableInstantSerializer::class) val createdAt: Instant? = null,
) {
    /**
     * A download notification carries the download's name, which for a fresh
     * torrent is the whole magnet URI — six lines of percent-encoding in a
     * notification list. The `dn` parameter inside it is the real name.
     */
    public val displayMessage: String
        get() {
            if (!message.startsWith("magnet:")) return message
            val name = message.substringAfter("&dn=", "").substringBefore("&")
            if (name.isEmpty()) return "種子"
            return runCatching {
                java.net.URLDecoder.decode(name, java.nio.charset.StandardCharsets.UTF_8)
            }.getOrDefault(name)
        }
}

@Serializable
private data class UnreadCount(val count: Int = 0)

private val notificationSerializer = ListSerializer(AppNotification.serializer())

/** `notificationsApi.list`. */
public suspend fun ApiClient.notifications(limit: Int = 50): List<AppNotification> =
    MilmilJson.decodeFromString(
        notificationSerializer,
        execute(HttpMethod.Get, "/api/v1/notifications?limit=$limit", null),
    )

/** `notificationsApi.unreadCount` — the navigation-bar badge. */
public suspend fun ApiClient.unreadNotifications(): Int =
    MilmilJson.decodeFromString(
        UnreadCount.serializer(),
        execute(HttpMethod.Get, "/api/v1/notifications/unread-count", null),
    ).count

/** `notificationsApi.markAllRead`. */
public suspend fun ApiClient.markAllNotificationsRead() {
    execute(HttpMethod.Post, "/api/v1/notifications/mark-all-read", null)
}

/** `historyApi.list`. The cursor is `next_before`; null means the end. */
@Serializable
public data class HistoryPage(
    val items: List<RecentProgress> = emptyList(),
    @SerialName("next_before") val nextBefore: String? = null,
)

public suspend fun ApiClient.history(limit: Int = 50, before: String? = null): HistoryPage {
    val cursor = before?.let { "&before=${java.net.URLEncoder.encode(it, "UTF-8")}" } ?: ""
    return MilmilJson.decodeFromString(
        HistoryPage.serializer(),
        execute(HttpMethod.Get, "/api/v1/progress/history?limit=$limit$cursor", null),
    )
}

/** `historyApi.delete` — one row, so a mistake can be taken back. */
public suspend fun ApiClient.deleteProgress(id: String) {
    execute(HttpMethod.Delete, "/api/v1/progress/${java.net.URLEncoder.encode(id, "UTF-8")}", null)
}
