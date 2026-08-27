package dev.milmil.api

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder

/**
 * The server emits Go `time.Time` (RFC 3339, up to nine fractional digits) for
 * handler DTOs and raw SQLite text (`2026-08-23 08:00:00`) for rows it passes
 * through. Air dates come as `2026-07-25`. Mirrors `MilmilKit`'s `MilmilDate`.
 */
public object MilmilDate {
    private val sqlite = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")

    public fun parse(raw: String): Instant? {
        if (raw.isBlank()) return null
        // Instant.parse handles RFC 3339 with any number of fractional digits.
        runCatching { return Instant.parse(raw) }
        runCatching { return LocalDateTime.parse(raw, sqlite).toInstant(ZoneOffset.UTC) }
        runCatching { return LocalDate.parse(raw).atStartOfDay().toInstant(ZoneOffset.UTC) }
        return null
    }
}

/** Decodes any of the server's date shapes; encodes back as RFC 3339. */
public object InstantSerializer : KSerializer<Instant> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("dev.milmil.api.Instant", PrimitiveKind.STRING)

    override fun deserialize(decoder: Decoder): Instant {
        val raw = decoder.decodeString()
        return MilmilDate.parse(raw) ?: throw IllegalArgumentException("unrecognised date: $raw")
    }

    override fun serialize(encoder: Encoder, value: Instant) {
        encoder.encodeString(DateTimeFormatter.ISO_INSTANT.format(value))
    }
}

/** Same, but a blank or unparseable value becomes null instead of throwing. */
public object NullableInstantSerializer : KSerializer<Instant?> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("dev.milmil.api.NullableInstant", PrimitiveKind.STRING)

    override fun deserialize(decoder: Decoder): Instant? = MilmilDate.parse(decoder.decodeString())

    override fun serialize(encoder: Encoder, value: Instant?) {
        if (value == null) encoder.encodeString("") else encoder.encodeString(DateTimeFormatter.ISO_INSTANT.format(value))
    }
}
