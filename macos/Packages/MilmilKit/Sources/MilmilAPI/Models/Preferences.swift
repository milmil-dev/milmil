import Foundation

// Shared with the web client byte for byte: `web/src/lib/api/preferences.ts`
// and `web/src/store/preferences-store.ts` (defaults). Both clients read and
// write `/api/v1/user/preferences`, so a change here must stay compatible.

public struct SubtitleStyle: Codable, Sendable, Hashable {
    public var fontFamily = "Noto Sans CJK"
    /// 12–48
    public var fontSize = 24
    public var color = "#FFFFFF"
    public var backgroundColor = "#000000"
    /// 0–1
    public var backgroundOpacity = 0.75
    /// 0–4
    public var strokeWidth = 2
    public var strokeColor = "#000000"
    /// none | outline | drop-shadow | raised | depressed
    public var shadowType = "outline"
    /// top | center | bottom
    public var position = "bottom"
    /// 0–100 %
    public var positionOffset = 10
    /// 0–20 %
    public var safeMargin = 5
    public var fadeAnimation = true
    public var respectAssStyle = true

    public init() {}

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: AnyCodingKey.self)
        func read<T: Decodable>(_ key: String, _ fallback: T) -> T {
            (try? c.decodeIfPresent(T.self, forKey: AnyCodingKey(key))) ?? fallback
        }
        fontFamily = read("fontFamily", fontFamily)
        fontSize = read("fontSize", fontSize)
        color = read("color", color)
        backgroundColor = read("backgroundColor", backgroundColor)
        backgroundOpacity = read("backgroundOpacity", backgroundOpacity)
        strokeWidth = read("strokeWidth", strokeWidth)
        strokeColor = read("strokeColor", strokeColor)
        shadowType = read("shadowType", shadowType)
        position = read("position", position)
        positionOffset = read("positionOffset", positionOffset)
        safeMargin = read("safeMargin", safeMargin)
        fadeAnimation = read("fadeAnimation", fadeAnimation)
        respectAssStyle = read("respectAssStyle", respectAssStyle)
    }
}

public struct KeyBinding: Codable, Sendable, Hashable {
    public var action: String
    public var key: String
    /// shift | ctrl | alt | meta
    public var modifiers: [String]?

    public init(action: String, key: String, modifiers: [String]? = nil) {
        self.action = action
        self.key = key
        self.modifiers = modifiers
    }
}

public enum DanmakuDensity: String, Codable, Sendable, CaseIterable { case low, medium, high }
public enum DanmakuStroke: String, Codable, Sendable, CaseIterable { case none, shadow, stroke }
public enum ChineseConvert: String, Codable, Sendable, CaseIterable { case none, s2t, t2s }
public enum BufferMode: String, Codable, Sendable, CaseIterable { case auto, low, balanced, high }

/// `/api/v1/user/preferences` body (`{"data": {...}}`). Every key the web
/// knows has a default; keys we don't model ride along in `extra` so a PUT
/// from this client never drops them.
public struct GlobalPreferences: Codable, Sendable, Hashable {
    public var subtitleStyle = SubtitleStyle()
    public var subtitlePreset = "default"
    public var keyboardBindings: [KeyBinding] = []
    public var gestureEnabled = true
    public var gestureSensitivity = 50
    public var autoNext = true
    public var autoSkipOp = false
    public var autoSkipEd = false
    public var danmakuEnabled = true
    public var danmakuOpacity = 1.0
    public var danmakuFontSize = 20
    /// px/s
    public var danmakuSpeed = 144
    public var danmakuDensity = DanmakuDensity.medium
    /// 0.25 | 0.5 | 0.75 | 1
    public var danmakuArea = 1.0
    public var danmakuBold = false
    public var danmakuStroke = DanmakuStroke.shadow
    public var danmakuFilterScroll = true
    public var danmakuFilterTop = true
    public var danmakuFilterBottom = true
    public var danmakuAntiSubtitle = false
    public var danmakuFontFamily = "sans-serif"
    public var danmakuColor = "#FFFFFF"
    public var danmakuBlockKeywords: [String] = []
    public var danmakuChineseConvert = ChineseConvert.none
    public var bufferMode = BufferMode.auto
    public var defaultSubtitleLanguage: String?
    public var defaultAudioLanguage: String?
    /// Keys this client does not model, preserved verbatim.
    public var extra: [String: JSONValue] = [:]

    public init() {}

    private static let knownKeys: Set<String> = [
        "subtitleStyle", "subtitlePreset", "keyboardBindings", "gestureEnabled", "gestureSensitivity", "autoNext", "autoSkipOp", "autoSkipEd",
        "danmakuEnabled", "danmakuOpacity", "danmakuFontSize", "danmakuSpeed", "danmakuDensity", "danmakuArea", "danmakuBold", "danmakuStroke",
        "danmakuFilterScroll", "danmakuFilterTop", "danmakuFilterBottom", "danmakuAntiSubtitle", "danmakuFontFamily", "danmakuColor",
        "danmakuBlockKeywords", "danmakuChineseConvert", "bufferMode", "defaultSubtitleLanguage", "defaultAudioLanguage",
    ]

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: AnyCodingKey.self)
        func read<T: Decodable>(_ key: String, _ fallback: T) -> T {
            (try? c.decodeIfPresent(T.self, forKey: AnyCodingKey(key))) ?? fallback
        }
        subtitleStyle = read("subtitleStyle", subtitleStyle)
        subtitlePreset = read("subtitlePreset", subtitlePreset)
        keyboardBindings = read("keyboardBindings", keyboardBindings)
        gestureEnabled = read("gestureEnabled", gestureEnabled)
        gestureSensitivity = read("gestureSensitivity", gestureSensitivity)
        autoNext = read("autoNext", autoNext)
        autoSkipOp = read("autoSkipOp", autoSkipOp)
        autoSkipEd = read("autoSkipEd", autoSkipEd)
        danmakuEnabled = read("danmakuEnabled", danmakuEnabled)
        danmakuOpacity = read("danmakuOpacity", danmakuOpacity)
        danmakuFontSize = read("danmakuFontSize", danmakuFontSize)
        danmakuSpeed = read("danmakuSpeed", danmakuSpeed)
        danmakuDensity = read("danmakuDensity", danmakuDensity)
        danmakuArea = read("danmakuArea", danmakuArea)
        danmakuBold = read("danmakuBold", danmakuBold)
        danmakuStroke = read("danmakuStroke", danmakuStroke)
        danmakuFilterScroll = read("danmakuFilterScroll", danmakuFilterScroll)
        danmakuFilterTop = read("danmakuFilterTop", danmakuFilterTop)
        danmakuFilterBottom = read("danmakuFilterBottom", danmakuFilterBottom)
        danmakuAntiSubtitle = read("danmakuAntiSubtitle", danmakuAntiSubtitle)
        danmakuFontFamily = read("danmakuFontFamily", danmakuFontFamily)
        danmakuColor = read("danmakuColor", danmakuColor)
        danmakuBlockKeywords = read("danmakuBlockKeywords", danmakuBlockKeywords)
        danmakuChineseConvert = read("danmakuChineseConvert", danmakuChineseConvert)
        bufferMode = read("bufferMode", bufferMode)
        defaultSubtitleLanguage = read("defaultSubtitleLanguage", String?.none)
        defaultAudioLanguage = read("defaultAudioLanguage", String?.none)
        for key in c.allKeys where !Self.knownKeys.contains(key.stringValue) {
            if let value = try? c.decode(JSONValue.self, forKey: key) { extra[key.stringValue] = value }
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: AnyCodingKey.self)
        try c.encode(subtitleStyle, forKey: AnyCodingKey("subtitleStyle"))
        try c.encode(subtitlePreset, forKey: AnyCodingKey("subtitlePreset"))
        try c.encode(keyboardBindings, forKey: AnyCodingKey("keyboardBindings"))
        try c.encode(gestureEnabled, forKey: AnyCodingKey("gestureEnabled"))
        try c.encode(gestureSensitivity, forKey: AnyCodingKey("gestureSensitivity"))
        try c.encode(autoNext, forKey: AnyCodingKey("autoNext"))
        try c.encode(autoSkipOp, forKey: AnyCodingKey("autoSkipOp"))
        try c.encode(autoSkipEd, forKey: AnyCodingKey("autoSkipEd"))
        try c.encode(danmakuEnabled, forKey: AnyCodingKey("danmakuEnabled"))
        try c.encode(danmakuOpacity, forKey: AnyCodingKey("danmakuOpacity"))
        try c.encode(danmakuFontSize, forKey: AnyCodingKey("danmakuFontSize"))
        try c.encode(danmakuSpeed, forKey: AnyCodingKey("danmakuSpeed"))
        try c.encode(danmakuDensity, forKey: AnyCodingKey("danmakuDensity"))
        try c.encode(danmakuArea, forKey: AnyCodingKey("danmakuArea"))
        try c.encode(danmakuBold, forKey: AnyCodingKey("danmakuBold"))
        try c.encode(danmakuStroke, forKey: AnyCodingKey("danmakuStroke"))
        try c.encode(danmakuFilterScroll, forKey: AnyCodingKey("danmakuFilterScroll"))
        try c.encode(danmakuFilterTop, forKey: AnyCodingKey("danmakuFilterTop"))
        try c.encode(danmakuFilterBottom, forKey: AnyCodingKey("danmakuFilterBottom"))
        try c.encode(danmakuAntiSubtitle, forKey: AnyCodingKey("danmakuAntiSubtitle"))
        try c.encode(danmakuFontFamily, forKey: AnyCodingKey("danmakuFontFamily"))
        try c.encode(danmakuColor, forKey: AnyCodingKey("danmakuColor"))
        try c.encode(danmakuBlockKeywords, forKey: AnyCodingKey("danmakuBlockKeywords"))
        try c.encode(danmakuChineseConvert, forKey: AnyCodingKey("danmakuChineseConvert"))
        try c.encode(bufferMode, forKey: AnyCodingKey("bufferMode"))
        try c.encode(defaultSubtitleLanguage, forKey: AnyCodingKey("defaultSubtitleLanguage"))
        try c.encode(defaultAudioLanguage, forKey: AnyCodingKey("defaultAudioLanguage"))
        for (key, value) in extra { try c.encode(value, forKey: AnyCodingKey(key)) }
    }
}

/// `/api/v1/user/preferences/series/{id}` — per-series overrides.
public struct SeriesPreferences: Codable, Sendable, Hashable {
    public var playbackSpeed: Double?
    public var volume: Double?
    public var subtitleLanguage: String?
    public var subtitleSecondaryLanguage: String?
    public var subtitleDelay: Double?
    public var audioTrackLanguage: String?

    public init() {}
}

struct PreferenceEnvelope<T: Codable & Sendable>: Codable, Sendable {
    let data: T
}
