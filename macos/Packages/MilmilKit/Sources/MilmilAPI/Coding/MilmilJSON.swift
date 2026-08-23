import Foundation

public enum MilmilJSON {
    /// Decoder matching the server's conventions: explicit coding keys (the
    /// API mixes `last_ip` and `token_prefix`, which `convertFromSnakeCase`
    /// would map inconsistently) and lenient dates.
    public static func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            guard let date = MilmilDate.parse(raw) else {
                throw DecodingError.dataCorruptedError(in: container, debugDescription: "unrecognised date: \(raw)")
            }
            return date
        }
        return decoder
    }

    public static func makeEncoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }
}

/// The server emits Go `time.Time` (RFC 3339 with nanoseconds) for handler
/// DTOs and raw SQLite text (`2026-08-23 08:00:00`) for rows it passes through.
/// Everything here is a value-type `FormatStyle`, so it is safe to share.
public enum MilmilDate {
    private static let posix = Locale(identifier: "en_US_POSIX")

    private static let sqlite = Date.ParseStrategy(
        format: """
        \(year: .defaultDigits)-\(month: .twoDigits)-\(day: .twoDigits) \
        \(hour: .twoDigits(clock: .twentyFourHour, hourCycle: .zeroBased)):\(minute: .twoDigits):\(second: .twoDigits)
        """,
        locale: posix,
        timeZone: .gmt
    )

    private static let dateOnly = Date.ParseStrategy(
        format: "\(year: .defaultDigits)-\(month: .twoDigits)-\(day: .twoDigits)",
        locale: posix,
        timeZone: .gmt
    )

    public static func parse(_ raw: String) -> Date? {
        if let date = try? Date(raw, strategy: .iso8601) { return date }
        // The fractional-seconds style wants exactly three digits; Go writes up to nine.
        if let dot = raw.firstIndex(of: "."),
           let zone = raw[dot...].firstIndex(where: { $0 == "Z" || $0 == "+" || $0 == "-" }) {
            let fraction = raw[raw.index(after: dot)..<zone]
            let millis = String(fraction.prefix(3)).padding(toLength: 3, withPad: "0", startingAt: 0)
            let trimmed = String(raw[..<dot]) + "." + millis + String(raw[zone...])
            if let date = try? Date(trimmed, strategy: .iso8601.year().month().day().time(includingFractionalSeconds: true).timeZone(separator: .colon)) {
                return date
            }
            if let date = try? Date(trimmed, strategy: .iso8601.year().month().day().time(includingFractionalSeconds: true).timeZone(separator: .omitted)) {
                return date
            }
        }
        if let date = try? Date(raw, strategy: sqlite) { return date }
        if let date = try? Date(raw, strategy: dateOnly) { return date }
        return nil
    }
}
