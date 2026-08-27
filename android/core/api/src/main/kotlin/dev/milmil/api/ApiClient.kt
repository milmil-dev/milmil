package dev.milmil.api

import io.ktor.client.HttpClient
import io.ktor.client.HttpClientConfig
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.request.header
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json

/**
 * The HTTP surface, named to match `web/src/lib/api` and `MilmilKit`'s
 * endpoint extensions — a request that exists in one client should be findable
 * under the same name in the other two.
 *
 * `baseUrl` is the profile origin and may carry a reverse-proxy prefix; every
 * path here is absolute (`/api/v1/...`) and gets appended to it.
 */
public class ApiClient(
    baseUrl: String,
    engine: HttpClientEngine? = null,
    /**
     * Sent as `X-Milmil-Locale` so the API localizes titles and synopses to
     * what this client shows, rather than the server-wide preference the web
     * app picked. MilmilKit has always done this; the Android client did not,
     * which is why the two showed different titles for the same row.
     */
    private val locale: String = defaultLocale(),
    // Last, so `ApiClient(url) { token }` keeps binding the trailing lambda.
    private val tokenProvider: () -> String? = { null },
) {
    public val baseUrl: String = normalizeBaseUrl(baseUrl)

    private val http: HttpClient = if (engine != null) {
        HttpClient(engine) { installDefaults() }
    } else {
        HttpClient { installDefaults() }
    }

    /** Returns the raw body, or throws the mapped [ApiError]. */
    public suspend fun execute(method: HttpMethod, path: String, jsonBody: String?): String {
        val response: HttpResponse = try {
            http.request(baseUrl + path) {
                this.method = method
                applyAuth(this)
                if (jsonBody != null) {
                    contentType(ContentType.Application.Json)
                    setBody(jsonBody)
                }
            }
        } catch (t: Throwable) {
            throw ApiError.Transport(t)
        }
        val text = response.bodyAsText()
        when {
            response.status.isSuccess() -> return text
            response.status == HttpStatusCode.Unauthorized -> throw ApiError.Unauthorized
            response.status == HttpStatusCode.TooManyRequests ->
                throw ApiError.RateLimited(response.headers["Retry-After"]?.toLongOrNull())
            else -> throw ApiError.Status(response.status.value, text)
        }
    }

    private fun applyAuth(builder: HttpRequestBuilder) {
        tokenProvider()?.takeIf { it.isNotBlank() }?.let { builder.header("Authorization", "Bearer $it") }
        if (locale.isNotBlank()) builder.header("X-Milmil-Locale", locale)
    }

    public fun close(): Unit = http.close()

    private fun HttpClientConfig<*>.installDefaults() {
        install(ContentNegotiation) { json(MilmilJson) }
        expectSuccess = false
    }

    public companion object {
        /** The device language as a BCP-47 tag, e.g. `zh-Hant-HK`. */
        public fun defaultLocale(): String = java.util.Locale.getDefault().toLanguageTag()

        /** Strips a trailing slash and a pasted `/api/v1` suffix, like `ServerProfile.normalize`. */
        public fun normalizeBaseUrl(raw: String): String {
            var url = raw.trim().trimEnd('/')
            if (url.endsWith("/api/v1")) url = url.removeSuffix("/api/v1")
            return url
        }
    }
}

private fun HttpStatusCode.isSuccess(): Boolean = value in 200..299
