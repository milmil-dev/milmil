import Foundation

/// One entry of mpv's `track-list`.
public struct MediaTrack: Sendable, Hashable, Identifiable {
    public enum Kind: String, Sendable {
        case video, audio, sub
    }

    public let id: Int64
    public let kind: Kind
    public let title: String?
    public let language: String?
    public let codec: String?
    public let isDefault: Bool
    public let isForced: Bool
    public let isExternal: Bool
    public let isSelected: Bool
    public let externalFilename: String?
    public let channels: Int64?
    public let width: Int64?
    public let height: Int64?

    public init?(node: MPVNode) {
        guard let id = node["id"]?.intValue,
              let kindString = node["type"]?.stringValue,
              let kind = Kind(rawValue: kindString) else { return nil }
        self.id = id
        self.kind = kind
        title = node["title"]?.stringValue
        language = node["lang"]?.stringValue
        codec = node["codec"]?.stringValue
        isDefault = node["default"]?.boolValue ?? false
        isForced = node["forced"]?.boolValue ?? false
        isExternal = node["external"]?.boolValue ?? false
        isSelected = node["selected"]?.boolValue ?? false
        externalFilename = node["external-filename"]?.stringValue
        channels = node["demux-channel-count"]?.intValue
        width = node["demux-w"]?.intValue
        height = node["demux-h"]?.intValue
    }

    public init(
        id: Int64, kind: Kind, title: String? = nil, language: String? = nil, codec: String? = nil,
        isDefault: Bool = false, isForced: Bool = false, isExternal: Bool = false, isSelected: Bool = false
    ) {
        self.id = id
        self.kind = kind
        self.title = title
        self.language = language
        self.codec = codec
        self.isDefault = isDefault
        self.isForced = isForced
        self.isExternal = isExternal
        self.isSelected = isSelected
        externalFilename = nil
        channels = nil
        width = nil
        height = nil
    }

    /// "日本語 · AAC 2ch", "Signs & Songs (eng)", …
    public var displayName: String {
        var parts: [String] = []
        if let title, !title.isEmpty { parts.append(title) }
        if let language, !language.isEmpty { parts.append(Self.languageName(language)) }
        if parts.isEmpty { parts.append("\(kind.rawValue.capitalized) \(id)") }
        var extras: [String] = []
        if let codec, !codec.isEmpty { extras.append(codec.uppercased()) }
        if let channels, channels > 0 { extras.append("\(channels)ch") }
        if isForced { extras.append("forced") }
        if isExternal { extras.append("external") }
        return extras.isEmpty ? parts.joined(separator: " · ") : "\(parts.joined(separator: " · ")) (\(extras.joined(separator: ", ")))"
    }

    public static func languageName(_ code: String) -> String {
        let normalized = code.lowercased()
        let known: [String: String] = [
            "ja": "日本語", "jpn": "日本語", "en": "English", "eng": "English",
            "zh": "中文", "chi": "中文", "zho": "中文", "zh-tw": "繁體中文", "zh-hant": "繁體中文",
            "zh-cn": "简体中文", "zh-hans": "简体中文", "ko": "한국어", "kor": "한국어",
        ]
        if let name = known[normalized] { return name }
        return Locale.current.localizedString(forLanguageCode: code) ?? code
    }

    public static func parseList(_ node: MPVNode?) -> [MediaTrack] {
        (node?.arrayValue ?? []).compactMap(MediaTrack.init(node:))
    }
}

/// One entry of mpv's `chapter-list`.
public struct MediaChapter: Sendable, Hashable, Identifiable {
    public let index: Int
    public let title: String
    public let time: Double

    public var id: Int { index }

    public init(index: Int, title: String, time: Double) {
        self.index = index
        self.title = title
        self.time = time
    }

    public static func parseList(_ node: MPVNode?) -> [MediaChapter] {
        (node?.arrayValue ?? []).enumerated().compactMap { index, item in
            guard let time = item["time"]?.doubleValue else { return nil }
            return MediaChapter(index: index, title: item["title"]?.stringValue ?? "", time: time)
        }
    }

    /// Chapters whose names look like an opening / ending, for skip buttons.
    public var segmentKind: String? {
        let lower = title.lowercased()
        if lower.contains("op") || lower.contains("opening") { return "op" }
        if lower.contains("ed") || lower.contains("ending") { return "ed" }
        if lower.contains("preview") || lower.contains("next") { return "preview" }
        return nil
    }
}
