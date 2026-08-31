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
    /** Which episode is due — the calendar's `EP n` badge. */
    @SerialName("next_episode") val nextEpisode: Int = 0,
    /** `23:30`. The schedule groups a day by this, as the web timeline does. */
    @SerialName("air_time") val airTime: String = "",
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

/**
 * `/discover/browse` can return the same title twice — page 1 came back with
 * 50 rows and 48 distinct ids, 進擊的巨人 and 火影忍者疾風傳 each doubled.
 * A grid keyed on the id then crashes Compose outright ("Key was already
 * used"), and even without that the user would see the same show twice.
 * De-duplicating here keeps every caller safe rather than each screen
 * remembering to.
 */
private fun List<DiscoverAnime>.deduped(): List<DiscoverAnime> = distinctBy { it.bangumiId }
private val calendarSerializer = ListSerializer(CalendarDay.serializer())

/** Mirrors `web/src/lib/api/discover.ts` — `discoverApi.trending`. */
public suspend fun ApiClient.trending(page: Int = 1): List<DiscoverAnime> =
    MilmilJson.decodeFromString(
        animeListSerializer,
        execute(HttpMethod.Get, "/api/v1/discover/trending?page=$page", null),
    ).deduped()

/**
 * `discoverApi.search`. The search response is a leaner shape than trending —
 * no banner, no anilist id — which the defaults absorb.
 */
public suspend fun ApiClient.search(query: String, page: Int = 1): List<DiscoverAnime> =
    MilmilJson.decodeFromString(
        animeListSerializer,
        execute(HttpMethod.Get, "/api/v1/discover/search?q=${query.encodeQuery()}&page=$page", null),
    ).deduped()

/** `discoverApi.browse` — the filtered grid behind the Discover tab. */
public suspend fun ApiClient.browse(page: Int = 1): List<DiscoverAnime> =
    MilmilJson.decodeFromString(
        animeListSerializer,
        execute(HttpMethod.Get, "/api/v1/discover/browse?page=$page", null),
    ).deduped()

private fun String.encodeQuery(): String =
    java.net.URLEncoder.encode(this, java.nio.charset.StandardCharsets.UTF_8)

/** `discoverApi.calendar` — the whole week, each day carrying its own items. */
public suspend fun ApiClient.calendar(): List<CalendarDay> =
    MilmilJson.decodeFromString(
        calendarSerializer,
        execute(HttpMethod.Get, "/api/v1/discover/calendar", null),
    ).map { day -> day.copy(items = day.items.deduped()) }
