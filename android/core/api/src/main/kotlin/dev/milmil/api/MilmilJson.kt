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
    //
    // Explicit nulls are real: a collection row sends `"title_en": null` for a
    // title it does not have. Coercing them to the property default is what
    // MilmilKit does with optionals, and keeps every DTO free of nullable
    // strings that every call site would then have to unwrap.
    coerceInputValues = true
}
