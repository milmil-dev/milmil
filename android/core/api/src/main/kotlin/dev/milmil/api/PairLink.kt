package dev.milmil.api

import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

/**
 * `milmil://pair?url=<server>&token=<mlml_…>&name=<label>` — everything a
 * client needs to reach a server without anyone typing a URL or a password.
 *
 * Mirrors `macos/Milmil/App/PairRequest.swift`. The two must stay in step:
 * one QR code has to work on either platform, so a link one accepts and the
 * other rejects is a bug, not a difference.
 */
public data class PairLink(
    val name: String,
    val url: String,
    val token: String,
) {
    public companion object {
        public const val SCHEME: String = "milmil"
        public const val HOST: String = "pair"

        /** Returns null for anything that is not a usable pairing link. */
        public fun parse(link: String): PairLink? {
            val uri = runCatching { URI(link.trim()) }.getOrNull() ?: return null
            if (!uri.scheme.equals(SCHEME, ignoreCase = true)) return null
            if (!uri.host.equals(HOST, ignoreCase = true)) return null

            val query = queryPairs(uri.rawQuery)
            val server = query["url"]?.takeIf { it.isNotBlank() } ?: return null
            val token = query["token"]?.takeIf { it.isNotBlank() } ?: return null

            val normalized = ApiClient.normalizeBaseUrl(server)
            val fallback = runCatching { URI(normalized).host }.getOrNull().orEmpty()
            val name = query["name"]?.takeIf { it.isNotBlank() }
                ?: fallback.takeIf { it.isNotBlank() }
                ?: "milmil"
            return PairLink(name = name, url = normalized, token = token)
        }

        /** `URI.getQuery()` decodes too eagerly; a token may contain `+` or `%`. */
        private fun queryPairs(rawQuery: String?): Map<String, String> {
            if (rawQuery.isNullOrBlank()) return emptyMap()
            return rawQuery.split('&').mapNotNull { part ->
                val index = part.indexOf('=')
                if (index <= 0) return@mapNotNull null
                val key = decode(part.substring(0, index))
                val value = decode(part.substring(index + 1))
                key to value
            }.toMap()
        }

        private fun decode(raw: String): String =
            runCatching { URLDecoder.decode(raw, StandardCharsets.UTF_8) }.getOrDefault(raw)
    }
}
