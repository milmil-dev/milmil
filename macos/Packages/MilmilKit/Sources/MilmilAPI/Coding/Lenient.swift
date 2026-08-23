import Foundation

/// SQLite-backed fields arrive as `0|1` while hand-built DTOs use real
/// booleans (`enabled`, `completed`, `sync_disabled` vs `can_direct_play`).
/// Decode either without caring which one a given endpoint chose.
@propertyWrapper
public struct LenientBool: Codable, Sendable, Hashable {
    public var wrappedValue: Bool

    public init(wrappedValue: Bool) {
        self.wrappedValue = wrappedValue
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let bool = try? container.decode(Bool.self) {
            wrappedValue = bool
        } else if let int = try? container.decode(Int.self) {
            wrappedValue = int != 0
        } else if let string = try? container.decode(String.self) {
            wrappedValue = ["1", "true", "yes"].contains(string.lowercased())
        } else if container.decodeNil() {
            wrappedValue = false
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "expected bool, int or string")
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(wrappedValue)
    }
}

/// Optional timestamps that some handlers pass through as a raw
/// `sql.NullString` (`{"String": "", "Valid": false}`) instead of
/// `string | null` — `rss-feeds.last_fetched_at`, `download-rules.last_triggered_at`.
/// Accept a date string, null, or that object; missing keys decode as nil.
@propertyWrapper
public struct LenientDate: Codable, Sendable, Hashable {
    public var wrappedValue: Date?

    public init(wrappedValue: Date?) {
        self.wrappedValue = wrappedValue
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            wrappedValue = nil
        } else if let raw = try? container.decode(String.self) {
            wrappedValue = MilmilDate.parse(raw)
        } else if let null = try? container.decode(NullString.self) {
            wrappedValue = null.valid ? MilmilDate.parse(null.string) : nil
        } else {
            wrappedValue = nil
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(wrappedValue)
    }

    private struct NullString: Decodable {
        let string: String
        let valid: Bool
        enum CodingKeys: String, CodingKey {
            case string = "String"
            case valid = "Valid"
        }
    }
}

public extension KeyedDecodingContainer {
    /// Lets `@LenientDate` properties tolerate an absent key.
    func decode(_ type: LenientDate.Type, forKey key: Key) throws -> LenientDate {
        try decodeIfPresent(type, forKey: key) ?? LenientDate(wrappedValue: nil)
    }
}

/// `genres` is a JSON array on `/libraries/{id}/anime` but a JSON-encoded
/// string on `/collection`. Accept both, and treat null as empty.
@propertyWrapper
public struct LenientStringArray: Codable, Sendable, Hashable {
    public var wrappedValue: [String]

    public init(wrappedValue: [String]) {
        self.wrappedValue = wrappedValue
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            wrappedValue = []
        } else if let array = try? container.decode([String].self) {
            wrappedValue = array
        } else if let string = try? container.decode(String.self) {
            if let data = string.data(using: .utf8), let array = try? JSONDecoder().decode([String].self, from: data) {
                wrappedValue = array
            } else {
                wrappedValue = string.isEmpty ? [] : [string]
            }
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "expected [String] or String")
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(wrappedValue)
    }
}

public extension KeyedDecodingContainer {
    /// Missing keys decode as `false` / `[]` instead of failing the whole object.
    func decode(_ type: LenientBool.Type, forKey key: Key) throws -> LenientBool {
        try decodeIfPresent(type, forKey: key) ?? LenientBool(wrappedValue: false)
    }

    func decode(_ type: LenientStringArray.Type, forKey key: Key) throws -> LenientStringArray {
        try decodeIfPresent(type, forKey: key) ?? LenientStringArray(wrappedValue: [])
    }
}
