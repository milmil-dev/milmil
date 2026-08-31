package dev.milmil.api

import io.ktor.http.HttpMethod
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer

/**
 * The file behind an episode. `path` is the server-side path (server >= 0.1.18)
 * and is what the macOS client maps to a local mount; the phone has no such
 * mapping, so it only ever streams.
 *
 * Width, height and the codec fields come back null on rows the scanner has
 * not probed, which is most of them — never render them without a fallback.
 */
@Serializable
public data class MediaFile(
    val id: String = "",
    val filename: String = "",
    val path: String = "",
    @SerialName("size_bytes") val sizeBytes: Long = 0,
    val width: Int? = null,
    val height: Int? = null,
    @SerialName("video_codec") val videoCodec: String? = null,
    @SerialName("audio_codec") val audioCodec: String? = null,
)

/** Where the user got to. Absent entirely on an episode never started. */
@Serializable
public data class WatchPosition(
    @SerialName("position_seconds") val positionSeconds: Double = 0.0,
    @SerialName("duration_seconds") val durationSeconds: Double = 0.0,
    @Serializable(with = LenientBoolSerializer::class) val completed: Boolean = false,
) {
    /** 0…1 for a progress bar, or 0 when the duration is not known yet. */
    public val fraction: Float
        get() = if (durationSeconds > 0) (positionSeconds / durationSeconds).toFloat().coerceIn(0f, 1f) else 0f

    /** Resuming from the last few seconds means starting over, not resuming. */
    public val resumable: Boolean
        get() = !completed && positionSeconds > RESUME_FLOOR_SECONDS &&
            (durationSeconds <= 0 || positionSeconds < durationSeconds - RESUME_CEILING_SECONDS)

    private companion object {
        const val RESUME_FLOOR_SECONDS = 10.0
        const val RESUME_CEILING_SECONDS = 30.0
    }
}

/** One row of the episode list. `mediaFile` is null for an episode not on disk. */
@Serializable
public data class PlayableEpisode(
    @SerialName("episode_id") val episodeId: String = "",
    val sort: Int = 0,
    val title: String? = null,
    @SerialName("title_zh") val titleZh: String? = null,
    @SerialName("air_date") val airDate: String? = null,
    val synopsis: String? = null,
    @SerialName("synopsis_zh") val synopsisZh: String? = null,
    val image: String? = null,
    @SerialName("media_file") val mediaFile: MediaFile? = null,
    val progress: WatchPosition? = null,
) {
    public val displayTitle: String
        get() = titleZh?.takeIf { it.isNotBlank() } ?: title?.takeIf { it.isNotBlank() } ?: "第 $sort 集"

    public val playable: Boolean
        get() = mediaFile != null
}

/** `animeApi.playableEpisodes` — the episode list plus the series' own status. */
@Serializable
public data class PlayableEpisodes(
    @SerialName("anime_id") val animeId: String = "",
    @SerialName("watch_status") val watchStatus: String = "",
    @SerialName("user_score") val userScore: Double? = null,
    val episodes: List<PlayableEpisode> = emptyList(),
) {
    /**
     * What a Play button should open: the first episode with something to
     * resume, else the first unwatched one on disk, else the first on disk.
     */
    public val upNext: PlayableEpisode?
        get() = episodes.firstOrNull { it.playable && it.progress?.resumable == true }
            ?: episodes.firstOrNull { it.playable && it.progress?.completed != true }
            ?: episodes.firstOrNull { it.playable }
}

/** Bangumi's rating: the score and the size of the vote behind it. */
@Serializable
public data class AnimeRating(
    val score: Double = 0.0,
    val total: Int = 0,
)

/** A character and who voices them — the macOS page shows both. */
@Serializable
public data class DetailCharacter(
    val role: String = "",
    val character: CharacterInfo = CharacterInfo(),
    @SerialName("voice_actor") val voiceActor: CharacterInfo? = null,
) {
    /** MAIN reads as 主角 everywhere else in the product. */
    public val roleLabel: String
        get() = when (role.uppercase()) {
            "MAIN" -> "主角"
            "SUPPORTING" -> "配角"
            "BACKGROUND" -> "背景"
            else -> role
        }
}

@Serializable
public data class CharacterInfo(
    val id: Int = 0,
    val name: String = "",
    @SerialName("name_native") val nameNative: String = "",
    val image: String = "",
) {
    public val displayName: String
        get() = nameNative.ifBlank { name }
}

/**
 * `discoverApi.detail`. A superset of [DiscoverAnime] rather than a subtype:
 * the extra fields only exist here, and the shared ones are spelled the same,
 * so a shelf card and this page agree on what a title is called.
 */
@Serializable
public data class AnimeDetail(
    @SerialName("bangumi_id") val bangumiId: Int = 0,
    @SerialName("anilist_id") val anilistId: Int = 0,
    val title: String = "",
    @SerialName("title_original") val titleOriginal: String = "",
    @SerialName("title_en") val titleEn: String = "",
    @SerialName("cover_image") val coverImage: String = "",
    @SerialName("banner_image") val bannerImage: String = "",
    val description: String = "",
    val synopsis: String = "",
    @SerialName("air_date") val airDate: String = "",
    @SerialName("episode_count") val episodeCount: Int = 0,
    @SerialName("media_type") val mediaType: String = "",
    @SerialName("trailer_url") val trailerUrl: String = "",
    val score: Double = 0.0,
    val popularity: Int = 0,
    @Serializable(with = LenientStringListSerializer::class) val tags: List<String> = emptyList(),
    @Serializable(with = LenientStringListSerializer::class) val genres: List<String> = emptyList(),
    val characters: List<DetailCharacter> = emptyList(),
    /** Bangumi's own score and how many people voted. */
    val rating: AnimeRating = AnimeRating(),
    /** "More like this" — the same list the macOS detail page shows. */
    val recommendations: List<DiscoverAnime> = emptyList(),
) {
    public val displayTitle: String
        get() = title.ifBlank { titleEn.ifBlank { titleOriginal } }

    /** The two carry the same prose; whichever the server filled in wins. */
    public val blurb: String
        get() = synopsis.ifBlank { description }
}

/** `discoverApi.detail` — the series page's header. */
public suspend fun ApiClient.animeDetail(bangumiId: Int): AnimeDetail =
    MilmilJson.decodeFromString(
        AnimeDetail.serializer(),
        execute(HttpMethod.Get, "/api/v1/discover/anime/$bangumiId", null),
    )

/** `animeApi.playableEpisodes` — the episode list under it. */
public suspend fun ApiClient.playableEpisodes(bangumiId: Int): PlayableEpisodes =
    MilmilJson.decodeFromString(
        PlayableEpisodes.serializer(),
        execute(HttpMethod.Get, "/api/v1/anime/$bangumiId/playable-episodes", null),
    ).let { it.copy(episodes = it.episodes.distinctBy(PlayableEpisode::episodeId)) }

private val progressSerializer = ListSerializer(RecentProgress.serializer())

/** A row of 繼續睇, as `/progress/recent` returns it. */
@Serializable
public data class RecentProgress(
    @SerialName("episode_id") val episodeId: String = "",
    @SerialName("media_file_id") val mediaFileId: String? = null,
    @SerialName("position_seconds") val positionSeconds: Double = 0.0,
    @SerialName("duration_seconds") val durationSeconds: Double? = null,
    @Serializable(with = LenientBoolSerializer::class) val completed: Boolean = false,
    @SerialName("anime_bangumi_id") val bangumiId: Int? = null,
    @SerialName("anime_title") val animeTitle: String = "",
    @SerialName("anime_title_zh") val animeTitleZh: String? = null,
    @SerialName("anime_cover_image") val coverImage: String? = null,
    @SerialName("episode_number") val episodeNumber: Int = 0,
) {
    public val displayTitle: String
        get() = animeTitleZh?.takeIf { it.isNotBlank() } ?: animeTitle

    public val remainingMinutes: Int
        get() = (((durationSeconds ?: 0.0) - positionSeconds) / 60).toInt().coerceAtLeast(0)

    /**
     * What a history row says. An episode stopped 20 seconds from the end is
     * finished for every purpose the user has, and "仲有 0 分鐘" is not a
     * sentence — the same 92% the player uses to mark one complete.
     */
    public val watchLabel: String
        get() {
            val total = durationSeconds ?: 0.0
            val done = completed || (total > 0 && positionSeconds / total >= COMPLETE_FRACTION)
            return when {
                done -> "睇晒"
                remainingMinutes <= 0 -> "就快睇完"
                else -> "仲有 $remainingMinutes 分鐘"
            }
        }
}

/** The player marks an episode complete at the same point; keep them in step. */
private const val COMPLETE_FRACTION = 0.92

/** `progressApi.recent` — what the home shelf's 繼續睇 row is built from. */
public suspend fun ApiClient.recentProgress(): List<RecentProgress> =
    MilmilJson.decodeFromString(
        progressSerializer,
        execute(HttpMethod.Get, "/api/v1/progress/recent", null),
    )

/** One Bangumi comment, as the detail page's 評論 section lists them. */
@Serializable
public data class BangumiComment(
    val id: Long = 0,
    val username: String = "",
    val nickname: String = "",
    val avatar: String = "",
    val rate: Int = 0,
    val comment: String = "",
    @SerialName("updated_at") val updatedAt: Long = 0,
) {
    public val displayName: String get() = nickname.ifBlank { username }
}

private val commentSerializer = ListSerializer(BangumiComment.serializer())

/** `discoverApi.comments`. */
public suspend fun ApiClient.bangumiComments(bangumiId: Int): List<BangumiComment> =
    MilmilJson.decodeFromString(
        commentSerializer,
        execute(HttpMethod.Get, "/api/v1/discover/anime/$bangumiId/comments", null),
    )

@Serializable
private data class WatchStatusUpdate(val status: String)

/**
 * `collectionApi.setStatus` — 加入收藏 and the watch-status menu, which the
 * macOS detail page has had all along and the phones did not.
 */
public suspend fun ApiClient.setWatchStatus(bangumiId: Int, status: String) {
    val body = MilmilJson.encodeToString(WatchStatusUpdate.serializer(), WatchStatusUpdate(status))
    execute(HttpMethod.Patch, "/api/v1/collection/$bangumiId/status", body)
}

@Serializable
private data class ScoreUpdate(val score: Int?)

/** `animeApi.updateScore` — your own score, 1…10, or null to clear it. */
public suspend fun ApiClient.setScore(bangumiId: Int, score: Int?) {
    val body = MilmilJson.encodeToString(ScoreUpdate.serializer(), ScoreUpdate(score))
    execute(HttpMethod.Patch, "/api/v1/anime/$bangumiId/score", body)
}
