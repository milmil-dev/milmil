package dev.milmil.api

import java.time.Instant
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
public data class Health(val status: String = "", val version: String = "")

@Serializable
public data class SetupStatus(
    @SerialName("has_admin") @Serializable(with = LenientBoolSerializer::class) val hasAdmin: Boolean = false,
)

@Serializable
public data class User(
    val id: String = "",
    val username: String = "",
    val role: String = "",
    @SerialName("avatar_url") val avatarUrl: String? = null,
    @SerialName("created_at") @Serializable(with = NullableInstantSerializer::class) val createdAt: Instant? = null,
)

@Serializable
public data class LoginSession(val token: String = "", val user: User = User())

/** Login either signs you in or asks for the second factor. */
public sealed interface LoginOutcome {
    public data class Session(val session: LoginSession) : LoginOutcome
    public data class TwoFactorRequired(val userId: String) : LoginOutcome
}

@Serializable
internal data class LoginResponse(
    val token: String? = null,
    val user: User? = null,
    @SerialName("two_factor_required") @Serializable(with = LenientBoolSerializer::class) val twoFactorRequired: Boolean = false,
    @SerialName("user_id") val userId: String? = null,
)

@Serializable
internal data class LoginRequest(
    val username: String,
    val password: String,
    @SerialName("device_name") val deviceName: String? = null,
)

@Serializable
internal data class TwoFactorRequest(
    @SerialName("user_id") val userId: String,
    val code: String,
    @SerialName("device_name") val deviceName: String? = null,
)
