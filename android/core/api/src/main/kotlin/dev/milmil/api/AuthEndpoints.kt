package dev.milmil.api

import io.ktor.http.HttpMethod

/** Mirrors `MilmilKit/Endpoints/AuthEndpoints.swift` and `web/src/lib/api/auth.ts`. */
public suspend fun ApiClient.health(): Health =
    MilmilJson.decodeFromString(Health.serializer(), execute(HttpMethod.Get, "/health", null))

public suspend fun ApiClient.setupStatus(): SetupStatus =
    MilmilJson.decodeFromString(SetupStatus.serializer(), execute(HttpMethod.Get, "/api/v1/auth/status", null))

public suspend fun ApiClient.me(): User =
    MilmilJson.decodeFromString(User.serializer(), execute(HttpMethod.Get, "/api/v1/auth/me", null))

/**
 * Rate limited to 0.2 req/s per IP with burst 10 — a wrong password must not be
 * retried in a loop; [ApiError.RateLimited] carries the server's Retry-After.
 */
public suspend fun ApiClient.login(username: String, password: String, deviceName: String? = null): LoginOutcome {
    val payload = MilmilJson.encodeToString(LoginRequest.serializer(), LoginRequest(username, password, deviceName))
    val raw = execute(HttpMethod.Post, "/api/v1/auth/login", payload)
    val response = MilmilJson.decodeFromString(LoginResponse.serializer(), raw)
    val userId = response.userId
    return when {
        response.token != null && response.user != null ->
            LoginOutcome.Session(LoginSession(response.token, response.user))
        response.twoFactorRequired && userId != null -> LoginOutcome.TwoFactorRequired(userId)
        else -> throw ApiError.Status(200, raw)
    }
}

public suspend fun ApiClient.completeTwoFactor(userId: String, code: String, deviceName: String? = null): LoginSession {
    val payload = MilmilJson.encodeToString(TwoFactorRequest.serializer(), TwoFactorRequest(userId, code, deviceName))
    val raw = execute(HttpMethod.Post, "/api/v1/auth/2fa/verify", payload)
    val response = MilmilJson.decodeFromString(LoginResponse.serializer(), raw)
    val token = response.token
    val user = response.user
    if (token == null || user == null) throw ApiError.Status(200, raw)
    return LoginSession(token, user)
}

public suspend fun ApiClient.logout() {
    execute(HttpMethod.Post, "/api/v1/auth/logout", null)
}
