import Foundation

/// One normalized danmaku, whatever its origin.
public struct DanmakuComment: Sendable, Hashable, Identifiable {
    public enum Mode: String, Sendable, Hashable, CaseIterable {
        /// Right-to-left scrolling (DandanPlay modes 1 and 6; web `rtl`).
        case scroll
        case top
        case bottom
    }

    public enum Source: Sendable, Hashable {
        /// DandanPlay, keyed by the media file (`GET /danmaku/{fileId}`).
        case dandanplay
        /// `GET /danmaku/external/imported/{episodeId}`; `name` is the provider (`bilibili`, …).
        case external(String)
        /// Sent from this client and shown optimistically.
        case local
    }

    public let id: String
    /// Seconds into the episode.
    public let time: Double
    public let mode: Mode
    public let color: RGB
    public let text: String
    public let source: Source

    public init(id: String, time: Double, mode: Mode, color: RGB, text: String, source: Source) {
        self.id = id
        self.time = time
        self.mode = mode
        self.color = color
        self.text = text
        self.source = source
    }

    /// Copy with different text (Chinese conversion keeps everything else).
    public func withText(_ text: String) -> DanmakuComment {
        DanmakuComment(id: id, time: time, mode: mode, color: color, text: text, source: source)
    }

    public var sourceLabel: String {
        switch source {
        // The open network's terms require the full name; "dandan"-style
        // abbreviations are explicitly disallowed.
        case .dandanplay: "弹弹play"
        case let .external(name): name.capitalized
        case .local: "我"
        }
    }
}

/// 24-bit colour, the unit both DandanPlay (decimal int) and the web
/// (`#RRGGBB`) use.
public struct RGB: Sendable, Hashable {
    public let red: UInt8
    public let green: UInt8
    public let blue: UInt8

    public static let white = RGB(red: 255, green: 255, blue: 255)

    public init(red: UInt8, green: UInt8, blue: UInt8) {
        self.red = red
        self.green = green
        self.blue = blue
    }

    /// DandanPlay's decimal `color` (e.g. `16777215`); out-of-range values clamp.
    public init(int value: Int) {
        let clamped = UInt32(max(0, min(0xFFFFFF, value)))
        self.init(red: UInt8((clamped >> 16) & 0xFF), green: UInt8((clamped >> 8) & 0xFF), blue: UInt8(clamped & 0xFF))
    }

    /// `#RRGGBB`, `RRGGBB`, `#RGB`; anything else → white.
    public init(hex: String) {
        var digits = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if digits.hasPrefix("#") { digits.removeFirst() }
        if digits.count == 3 { digits = digits.map { "\($0)\($0)" }.joined() }
        guard digits.count == 6, let value = Int(digits, radix: 16) else {
            self = .white
            return
        }
        self.init(int: value)
    }

    public var intValue: Int { Int(red) << 16 | Int(green) << 8 | Int(blue) }
    public var hexString: String { String(format: "#%02X%02X%02X", red, green, blue) }
}
