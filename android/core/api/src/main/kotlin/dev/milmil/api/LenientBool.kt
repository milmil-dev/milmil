package dev.milmil.api

import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.jsonPrimitive

/**
 * Booleans arrive as `0|1` from SQLite-backed rows and as `true|false` from
 * handler DTOs — the same field can be either depending on the endpoint.
 * `MilmilKit` solves this with `@LenientBool`; this is the Kotlin twin.
 *
 * Writes back as a JSON boolean. The one place that must NOT use it is the RSS
 * rule `enabled` field, which the server rejects unless it is an int.
 */
public object LenientBoolSerializer : KSerializer<Boolean> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("dev.milmil.api.LenientBool", PrimitiveKind.BOOLEAN)

    override fun deserialize(decoder: Decoder): Boolean {
        val input = decoder as? JsonDecoder ?: return decoder.decodeBoolean()
        val primitive = input.decodeJsonElement().jsonPrimitive
        primitive.booleanOrNull?.let { return it }
        primitive.content.toIntOrNull()?.let { return it != 0 }
        return when (primitive.content.lowercase()) {
            "true", "yes" -> true
            "false", "no", "" -> false
            else -> throw IllegalArgumentException("not a boolean: ${primitive.content}")
        }
    }

    override fun serialize(encoder: Encoder, value: Boolean) {
        encoder.encodeBoolean(value)
    }
}

/** `genres` is sometimes a JSON array and sometimes a JSON string holding one. */
public object LenientStringListSerializer : KSerializer<List<String>> {
    private val delegate = ListSerializer(String.serializer())

    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("dev.milmil.api.LenientStringList", PrimitiveKind.STRING)

    override fun deserialize(decoder: Decoder): List<String> {
        val input = decoder as? JsonDecoder ?: return emptyList()
        return when (val element = input.decodeJsonElement()) {
            is JsonArray -> element.mapNotNull { (it as? JsonPrimitive)?.content }
            is JsonPrimitive -> {
                val raw = element.content
                if (raw.isBlank()) {
                    emptyList()
                } else {
                    runCatching { MilmilJson.decodeFromString(delegate, raw) }
                        .getOrElse { raw.split(',').map(String::trim).filter(String::isNotEmpty) }
                }
            }
            else -> emptyList()
        }
    }

    override fun serialize(encoder: Encoder, value: List<String>) {
        encoder.encodeString(MilmilJson.encodeToString(delegate, value))
    }
}
