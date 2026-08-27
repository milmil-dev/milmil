package dev.milmil.api

import io.ktor.http.HttpMethod
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer

/**
 * One anime as `/discover` returns it. Field names and types come from a
 * real response, not from the spec: `score` arrives as an int for whole
 * numbers and a double otherwise, and `genres` is an array here but a JSON
 * string on library rows — hence the lenient serializer.
 */
@Serializable
public data class DiscoverAnime(
    @SerialName("bangumi_id") val bangumiId: Int = 0,
    @SerialName("anilist_id") val anilistId: Int = 0,
    val title: String = "",
    @SerialName("title_original") val titleOriginal: String = "",
    @SerialName("title_en") val titleEn: String = "",
    @SerialName("cover_image") val coverImage: String = "",
    @SerialName("banner_image") val bannerImage: String = "",
    val description: String = "",
    @SerialName("air_date") val airDate: String = "",
    @SerialName("episode_count") val episodeCount: Int = 0,
    @Serializable(with = LenientStringListSerializer::class) val genres: List<String> = emptyList(),
    val score: Double = 0.0,
) {
    /** What a shelf card shows: the localized title, falling back outward. */
    public val displayTitle: String
        get() = title.ifBlank { titleEn.ifBlank { titleOriginal } }
}

/** One day of the seasonal calendar. */
@Serializable
public data class CalendarDay(
    val weekday: String = "",
    @SerialName("weekday_en") val weekdayEn: String = "",
    val items: List<DiscoverAnime> = emptyList(),
)

private val animeListSerializer = ListSerializer(DiscoverAnime.serializer())
private val calendarSerializer = ListSerializer(CalendarDay.serializer())

/** Mirrors `web/src/lib/api/discover.ts` — `discoverApi.trending`. */
public suspend fun ApiClient.trending(page: Int = 1): List<DiscoverAnime> =
    MilmilJson.decodeFromString(
        animeListSerializer,
        execute(HttpMethod.Get, "/api/v1/discover/trending?page=$page", null),
    )

/** `discoverApi.calendar` — the whole week, each day carrying its own items. */
public suspend fun ApiClient.calendar(): List<CalendarDay> =
    MilmilJson.decodeFromString(
        calendarSerializer,
        execute(HttpMethod.Get, "/api/v1/discover/calendar", null),
    )
