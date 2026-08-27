package dev.milmil.api

import io.ktor.http.HttpMethod
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer

/**
 * A collection row. Deliberately NOT [DiscoverAnime]: the collection endpoint
 * answers with its own field names — `cover_image_url` not `cover_image`,
 * `total_episodes` not `episode_count`, and a `title_zh` that discover does
 * not have. Folding them into one type would silently blank half the screen.
 */
@Serializable
public data class CollectionEntry(
    val id: String = "",
    @SerialName("bangumi_id") val bangumiId: Int = 0,
    val title: String = "",
    @SerialName("title_en") val titleEn: String = "",
    @SerialName("title_zh") val titleZh: String = "",
    @SerialName("cover_image_url") val coverImageUrl: String = "",
    @SerialName("total_episodes") val totalEpisodes: Int = 0,
    @SerialName("local_file_count") val localFileCount: Int = 0,
    val status: String = "",
    val score: Double = 0.0,
    val season: String = "",
    @SerialName("air_date") val airDate: String = "",
    @Serializable(with = LenientStringListSerializer::class) val genres: List<String> = emptyList(),
) {
    public val displayTitle: String
        get() = titleZh.ifBlank { title.ifBlank { titleEn } }
}

/** How many titles sit in each watch status, for the filter chips. */
@Serializable
public data class StatusCount(
    @SerialName("watch_status") val status: String = "",
    val count: Int = 0,
)

private val collectionSerializer = ListSerializer(CollectionEntry.serializer())
private val statusSerializer = ListSerializer(StatusCount.serializer())

public suspend fun ApiClient.collection(page: Int = 1): List<CollectionEntry> =
    MilmilJson.decodeFromString(
        collectionSerializer,
        execute(HttpMethod.Get, "/api/v1/collection?page=$page", null),
    )

public suspend fun ApiClient.statusCounts(): List<StatusCount> =
    MilmilJson.decodeFromString(
        statusSerializer,
        execute(HttpMethod.Get, "/api/v1/collection/status-counts", null),
    )
