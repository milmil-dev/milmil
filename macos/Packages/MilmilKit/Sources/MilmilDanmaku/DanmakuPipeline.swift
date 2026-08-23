import Foundation

/// Everything between the raw sources and the timeline the renderer reads:
/// merge → Chinese conversion → mode / keyword filters → density thinning
/// → sort. Pure, so the web's behaviour can be pinned by tests.
public struct DanmakuPipeline: Sendable {
    public enum Density: Sendable, Hashable {
        case low, medium, high, unlimited

        /// Comments allowed per 6-second window (web worker `LIMITS.desktop`).
        public var limitPerWindow: Int? {
            switch self {
            case .low: 20
            case .medium: 50
            case .high: 80
            case .unlimited: nil
            }
        }
    }

    public struct Options: Sendable {
        public var density: Density = .medium
        public var showScroll = true
        public var showTop = true
        public var showBottom = true
        /// Plain substrings (case-insensitive) or `/regex/` entries, like the web's block list.
        public var blockKeywords: [String] = []
        /// `nil` → no conversion. Injected so the package stays free of OpenCC.
        public var convert: (@Sendable (String) -> String)?

        public init() {}
    }

    public static let windowSeconds: Double = 6

    public let options: Options

    public init(options: Options) {
        self.options = options
    }

    public func process(_ inputs: [DanmakuComment]) -> DanmakuTimeline {
        let blockers = Self.compileBlockers(options.blockKeywords)
        var comments = inputs.compactMap { comment -> DanmakuComment? in
            switch comment.mode {
            case .scroll where !options.showScroll, .top where !options.showTop, .bottom where !options.showBottom:
                return nil
            default:
                break
            }
            let text = options.convert?(comment.text) ?? comment.text
            if blockers.contains(where: { $0.matches(text) }) { return nil }
            return text == comment.text ? comment : comment.withText(text)
        }
        comments.sort(by: Self.byTimeThenID)
        if let limit = options.density.limitPerWindow {
            comments = Self.thin(comments, limit: limit)
        }
        return DanmakuTimeline(sorted: comments)
    }

    static func byTimeThenID(_ lhs: DanmakuComment, _ rhs: DanmakuComment) -> Bool {
        if lhs.time != rhs.time { return lhs.time < rhs.time }
        return lhs.id < rhs.id
    }

    /// Web worker algorithm: fixed 6 s buckets, first `limit` per bucket win.
    static func thin(_ sorted: [DanmakuComment], limit: Int) -> [DanmakuComment] {
        var result: [DanmakuComment] = []
        result.reserveCapacity(sorted.count)
        var windowStart = 0.0
        var windowCount = 0
        for comment in sorted {
            if comment.time >= windowStart + windowSeconds {
                windowStart = (comment.time / windowSeconds).rounded(.down) * windowSeconds
                windowCount = 0
            }
            if windowCount < limit {
                result.append(comment)
                windowCount += 1
            }
        }
        return result
    }

    enum Blocker {
        case substring(String)
        case regex(Regex<AnyRegexOutput>)

        func matches(_ text: String) -> Bool {
            switch self {
            case let .substring(needle): text.lowercased().contains(needle)
            case let .regex(regex): (try? regex.firstMatch(in: text)) != nil
            }
        }
    }

    static func compileBlockers(_ keywords: [String]) -> [Blocker] {
        keywords.compactMap { raw in
            let keyword = raw.trimmingCharacters(in: .whitespaces)
            guard !keyword.isEmpty else { return nil }
            if keyword.count > 2, keyword.hasPrefix("/"), keyword.hasSuffix("/"),
               let regex = try? Regex(String(keyword.dropFirst().dropLast())).ignoresCase() {
                return .regex(regex)
            }
            return .substring(keyword.lowercased())
        }
    }
}

/// Time-sorted, immutable, binary-searchable.
public struct DanmakuTimeline: Sendable, Equatable {
    public let comments: [DanmakuComment]

    public static let empty = DanmakuTimeline(sorted: [])

    init(sorted: [DanmakuComment]) {
        comments = sorted
    }

    public var count: Int { comments.count }
    public var isEmpty: Bool { comments.isEmpty }

    /// Index of the first comment with `time >= seconds`.
    public func index(atOrAfter seconds: Double) -> Int {
        var low = 0
        var high = comments.count
        while low < high {
            let mid = (low + high) / 2
            if comments[mid].time < seconds { low = mid + 1 } else { high = mid }
        }
        return low
    }

    /// Comments with `from <= time < to`.
    public func comments(from: Double, to: Double) -> ArraySlice<DanmakuComment> {
        guard to > from else { return [] }
        let start = index(atOrAfter: from)
        let end = index(atOrAfter: to)
        return comments[start..<end]
    }
}
