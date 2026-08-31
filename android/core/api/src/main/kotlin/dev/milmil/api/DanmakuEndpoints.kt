package dev.milmil.api

import io.ktor.http.HttpMethod
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** DandanPlay comment as the server relays it: `{cid, p: "time,mode,color,uid", m}`. */
@Serializable
public data class DandanPlayComment(
    val cid: Long = 0,
    val p: String = "",
    val m: String = "",
)

/** `GET /danmaku/{fileId}`. */
@Serializable
public data class DandanPlayResponse(
    val count: Int = 0,
    val comments: List<DandanPlayComment> = emptyList(),
)

/** One imported external comment. */
@Serializable
public data class ExternalComment(
    val text: String = "",
    val time: Double = 0.0,
    /** `rtl` | `top` | `bottom`, or a DandanPlay mode number as a string. */
    val mode: String = "rtl",
    /** `#RRGGBB`. */
    val color: String = "#FFFFFF",
)

/** `GET /danmaku/external/imported/{episodeId}`. */
@Serializable
public data class ImportedDanmaku(
    val source: String = "external",
    val count: Int = 0,
    @Serializable(with = LenientBoolSerializer::class) val saved: Boolean = false,
    val comments: List<ExternalComment> = emptyList(),
)

/**
 * The Kotlin twin of `MilmilDanmaku.DanmakuParser`. Garbled fields degrade the
 * same way the web worker degrades them — time 0, scroll, white — because a
 * comment the other clients show and this one drops reads as a bug.
 */
public object DanmakuParser {

    public fun comment(raw: DandanPlayComment): DanmakuComment? {
        val text = raw.m.trim()
        if (text.isEmpty()) return null
        val parts = raw.p.split(",")
        val time = parts.getOrNull(0)?.trim()?.toDoubleOrNull() ?: 0.0
        val mode = parts.getOrNull(1)?.let(::dandanPlayMode) ?: DanmakuMode.Scroll
        val color = parts.getOrNull(2)?.trim()?.toIntOrNull()?.coerceIn(0, 0xFFFFFF) ?: 0xFFFFFF
        val id = if (raw.cid != 0L) "ddp:${raw.cid}" else "ddp:${stableHash("${raw.p}|${raw.m}")}"
        return DanmakuComment(
            id = id,
            time = maxOf(0.0, time),
            mode = mode,
            color = color,
            text = text,
            source = "dandanplay",
        )
    }

    public fun comments(response: DandanPlayResponse): List<DanmakuComment> =
        response.comments.mapNotNull(::comment)

    public fun comments(imported: ImportedDanmaku): List<DanmakuComment> =
        imported.comments.mapIndexedNotNull { index, raw ->
            val text = raw.text.trim()
            if (text.isEmpty()) return@mapIndexedNotNull null
            DanmakuComment(
                id = "${imported.source}:${stableHash("${raw.time}|${raw.mode}|$text")}-$index",
                time = maxOf(0.0, raw.time),
                mode = webMode(raw.mode),
                color = colorFromHex(raw.color),
                text = text,
                source = imported.source,
            )
        }

    /** DandanPlay: 1 scroll, 4 bottom, 5 top, 6 reverse-scroll (drawn as scroll). */
    public fun dandanPlayMode(raw: String): DanmakuMode = when (raw.trim()) {
        "4" -> DanmakuMode.Bottom
        "5" -> DanmakuMode.Top
        else -> DanmakuMode.Scroll
    }

    public fun webMode(raw: String): DanmakuMode = when (raw.lowercase()) {
        "top", "5" -> DanmakuMode.Top
        "bottom", "4" -> DanmakuMode.Bottom
        else -> DanmakuMode.Scroll
    }

    /** `#RRGGBB`, `RRGGBB` or `#RGB`; anything else is white. */
    public fun colorFromHex(hex: String): Int {
        var digits = hex.trim().removePrefix("#")
        if (digits.length == 3) digits = digits.map { "$it$it" }.joinToString("")
        if (digits.length != 6) return 0xFFFFFF
        return digits.toIntOrNull(16) ?: 0xFFFFFF
    }

    /** FNV-1a, so an id is the same on every launch and on every client. */
    internal fun stableHash(value: String): String {
        var hash = -0x340d631b7bdddcdbL // 0xcbf29ce484222325 as a signed Long
        value.encodeToByteArray().forEach { byte ->
            hash = hash xor (byte.toLong() and 0xFF)
            hash *= 0x100000001B3L
        }
        return java.lang.Long.toUnsignedString(hash, 36)
    }
}

/** `GET /danmaku/{fileId}` — the DandanPlay track for a media file. */
public suspend fun ApiClient.danmaku(fileId: String): List<DanmakuComment> =
    DanmakuParser.comments(
        MilmilJson.decodeFromString(
            DandanPlayResponse.serializer(),
            execute(HttpMethod.Get, "/api/v1/danmaku/$fileId", null),
        ),
    )
