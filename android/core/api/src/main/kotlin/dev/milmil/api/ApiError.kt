package dev.milmil.api

/** Mirrors `MilmilKit`'s `APIError`. */
public sealed class ApiError(message: String) : Exception(message) {
    /** 401. The `mlml_` token never expires, so this means it was revoked —
     *  drop it and show login rather than retrying. */
    public data object Unauthorized : ApiError("unauthorized")

    /** 429 on the credential endpoints: 0.2 req/s per IP, burst 10. Back off; never poll. */
    public data class RateLimited(val retryAfterSeconds: Long?) : ApiError("rate limited")

    public data class Status(val code: Int, val body: String) : ApiError("HTTP $code: $body")
    public data class Transport(val failure: Throwable) : ApiError(failure.message ?: "transport failure")
}
