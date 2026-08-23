import Foundation

/// DandanPlay comment as the server relays it: `{cid, p: "time,mode,color,uid", m}`.
public struct DandanPlayComment: Decodable, Sendable, Hashable {
    public let cid: Int64
    public let p: String
    public let m: String

    public init(cid: Int64, p: String, m: String) {
        self.cid = cid
        self.p = p
        self.m = m
    }

    enum CodingKeys: String, CodingKey { case cid, p, m }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        cid = try c.decodeIfPresent(Int64.self, forKey: .cid) ?? 0
        p = try c.decodeIfPresent(String.self, forKey: .p) ?? ""
        m = try c.decodeIfPresent(String.self, forKey: .m) ?? ""
    }
}

/// `GET /danmaku/{fileId}` envelope.
public struct DandanPlayResponse: Decodable, Sendable {
    public let count: Int
    public let comments: [DandanPlayComment]

    enum CodingKeys: String, CodingKey { case count, comments }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        comments = try c.decodeIfPresent([DandanPlayComment].self, forKey: .comments) ?? []
        count = try c.decodeIfPresent(Int.self, forKey: .count) ?? comments.count
    }
}

/// One imported external comment (`{text, time, mode, color}`).
public struct ExternalComment: Decodable, Sendable, Hashable {
    public let text: String
    public let time: Double
    /// `rtl` | `top` | `bottom` (the web's names) — or a DandanPlay mode number as string.
    public let mode: String
    /// `#RRGGBB`
    public let color: String

    public init(text: String, time: Double, mode: String, color: String) {
        self.text = text
        self.time = time
        self.mode = mode
        self.color = color
    }

    enum CodingKeys: String, CodingKey { case text, time, mode, color }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        text = try c.decodeIfPresent(String.self, forKey: .text) ?? ""
        time = (try? c.decodeIfPresent(Double.self, forKey: .time)) ?? 0
        mode = (try? c.decodeIfPresent(String.self, forKey: .mode)) ?? (try? c.decodeIfPresent(Int.self, forKey: .mode)).map(String.init) ?? "rtl"
        if let hex = try? c.decodeIfPresent(String.self, forKey: .color) {
            color = hex
        } else if let int = try? c.decodeIfPresent(Int.self, forKey: .color) {
            color = RGB(int: int).hexString
        } else {
            color = "#FFFFFF"
        }
    }
}

/// `GET /danmaku/external/imported/{episodeId}` rows.
public struct ImportedDanmaku: Decodable, Sendable {
    public let source: String
    public let count: Int
    public let saved: Bool
    public let comments: [ExternalComment]

    enum CodingKeys: String, CodingKey { case source, count, saved, comments }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        source = try c.decodeIfPresent(String.self, forKey: .source) ?? "external"
        comments = try c.decodeIfPresent([ExternalComment].self, forKey: .comments) ?? []
        count = try c.decodeIfPresent(Int.self, forKey: .count) ?? comments.count
        if let flag = try? c.decodeIfPresent(Bool.self, forKey: .saved) {
            saved = flag
        } else {
            saved = ((try? c.decodeIfPresent(Int.self, forKey: .saved)) ?? 0) != 0
        }
    }
}

public enum DanmakuParser {
    /// `p` = `time,mode,color[,uid…]`. Missing or garbled fields fall back
    /// like the web worker: time 0, mode scroll, colour white.
    public static func comment(from raw: DandanPlayComment) -> DanmakuComment? {
        let text = raw.m.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        let parts = raw.p.split(separator: ",", omittingEmptySubsequences: false).map(String.init)
        let time = parts.indices.contains(0) ? (Double(parts[0].trimmingCharacters(in: .whitespaces)) ?? 0) : 0
        let mode = parts.indices.contains(1) ? mode(forDandanPlay: parts[1]) : .scroll
        let color = parts.indices.contains(2) ? RGB(int: Int(parts[2].trimmingCharacters(in: .whitespaces)) ?? 0xFFFFFF) : .white
        let id = raw.cid != 0 ? "ddp:\(raw.cid)" : "ddp:\(stableHash("\(raw.p)|\(raw.m)"))"
        return DanmakuComment(id: id, time: max(0, time), mode: mode, color: color, text: text, source: .dandanplay)
    }

    public static func comments(from response: DandanPlayResponse) -> [DanmakuComment] {
        response.comments.compactMap(comment(from:))
    }

    public static func comments(from imported: ImportedDanmaku) -> [DanmakuComment] {
        imported.comments.enumerated().compactMap { index, raw in
            let text = raw.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { return nil }
            let id = "\(imported.source):\(stableHash("\(raw.time)|\(raw.mode)|\(text)"))-\(index)"
            return DanmakuComment(
                id: id, time: max(0, raw.time), mode: mode(forWeb: raw.mode), color: RGB(hex: raw.color),
                text: text, source: .external(imported.source)
            )
        }
    }

    /// DandanPlay: 1 scroll, 4 bottom, 5 top, 6 scroll (reverse, rendered as scroll); others → scroll.
    public static func mode(forDandanPlay raw: String) -> DanmakuComment.Mode {
        switch raw.trimmingCharacters(in: .whitespaces) {
        case "4": .bottom
        case "5": .top
        default: .scroll
        }
    }

    public static func mode(forWeb raw: String) -> DanmakuComment.Mode {
        switch raw.lowercased() {
        case "top", "5": .top
        case "bottom", "4": .bottom
        default: .scroll
        }
    }

    /// DandanPlay mode number for `POST /danmaku/{fileId}`.
    public static func dandanPlayMode(_ mode: DanmakuComment.Mode) -> Int {
        switch mode {
        case .scroll: 1
        case .bottom: 4
        case .top: 5
        }
    }

    /// Deterministic across launches (Swift's `hashValue` is seeded per process).
    static func stableHash(_ string: String) -> String {
        var hash: UInt64 = 0xcbf2_9ce4_8422_2325
        for byte in string.utf8 {
            hash ^= UInt64(byte)
            hash = hash &* 0x0000_0100_0000_01B3
        }
        return String(hash, radix: 36)
    }
}
