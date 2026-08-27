package dev.milmil.api

import kotlinx.serialization.json.Json

/**
 * The server's JSON conventions, mirrored from `MilmilKit`'s `MilmilJSON`.
 * Keep the two in step: a client that disagrees about `0|1` or about which
 * date formats exist will fail on rows the others read fine.
 */
public val MilmilJson: Json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    // The API mixes `last_ip` and `token_prefix`; a naming strategy would map
    // them inconsistently, so DTOs carry explicit @SerialName.
    coerceInputValues = false
}
