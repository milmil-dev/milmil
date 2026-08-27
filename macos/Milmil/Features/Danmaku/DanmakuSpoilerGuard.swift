import Foundation
import MilmilDanmaku
import Observation

/// 防雷模式: hides comments that give later episodes away — a reference to
/// an episode beyond the one playing (第12集 / 第12話 / EP12 / ep 12) or a
/// spoiler keyword. Per-machine in `UserDefaults`, unlike the block list
/// that is shared with the web; the keyword list is one string per line
/// and a `/regex/` entry is a regular expression, like the block list.
@Observable
final class DanmakuSpoilerGuard {
    static let shared = DanmakuSpoilerGuard()

    private enum Keys {
        static let enabled = "danmaku.spoilerGuard.enabled"
        static let keywords = "danmaku.spoilerGuard.keywords"
    }

    /// 笑死 / 嚇死 / 累死 are not deaths.
    static let defaultKeywords = ["劇透", "结局", "結局", "黑化", "領便當", "领便当", "後面會", "后面会", "最後會", "最后会", "/(?<![笑嚇吓累氣气帥帅萌愛爱爽甜羨羡慕])死(?![黨党線线])/"]

    private let defaults: UserDefaults

    var enabled: Bool { didSet { defaults.set(enabled, forKey: Keys.enabled) } }
    var keywords: [String] { didSet { defaults.set(keywords, forKey: Keys.keywords) } }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        enabled = defaults.bool(forKey: Keys.enabled)
        keywords = defaults.stringArray(forKey: Keys.keywords) ?? Self.defaultKeywords
    }

    func resetKeywords() {
        keywords = Self.defaultKeywords
    }

    /// The matcher for one episode; nil when the guard is off.
    func matcher(currentEpisode: Double?) -> Matcher? {
        enabled ? Matcher(keywords: keywords, currentEpisode: currentEpisode) : nil
    }

    /// Pure and testable: `hides(_:)` says whether a comment text is a spoiler.
    struct Matcher: Sendable {
        private let plain: [String]
        private let patterns: [Regex<AnyRegexOutput>]
        private let currentEpisode: Double?
        /// 第12集 / 第12話 / 第十二集 is not handled (rare in danmaku); EP12, ep 12, E12.
        private static let episodeReference = /(?:第\s*(\d{1,4}(?:\.\d)?)\s*[集話话]|(?i:ep|e)\s*(\d{1,4}))/

        init(keywords: [String], currentEpisode: Double?) {
            var plain: [String] = []
            var patterns: [Regex<AnyRegexOutput>] = []
            for raw in keywords {
                let keyword = raw.trimmingCharacters(in: .whitespaces)
                guard !keyword.isEmpty else { continue }
                if keyword.count > 2, keyword.hasPrefix("/"), keyword.hasSuffix("/"),
                   let regex = try? Regex(String(keyword.dropFirst().dropLast())).ignoresCase() {
                    patterns.append(regex)
                } else {
                    plain.append(keyword.lowercased())
                }
            }
            self.plain = plain
            self.patterns = patterns
            self.currentEpisode = currentEpisode
        }

        func hides(_ text: String) -> Bool {
            if referencesLaterEpisode(text) { return true }
            let lowered = text.lowercased()
            if plain.contains(where: { lowered.contains($0) }) { return true }
            return patterns.contains { (try? $0.firstMatch(in: text)) != nil }
        }

        /// "第13集會…" while watching 12 is a spoiler; "第3集" is a callback.
        /// Without a known current episode, numbers are left alone.
        func referencesLaterEpisode(_ text: String) -> Bool {
            guard let currentEpisode else { return false }
            for match in text.matches(of: Self.episodeReference) {
                let digits = match.output.1 ?? match.output.2
                if let digits, let number = Double(digits), number > currentEpisode { return true }
            }
            return false
        }
    }
}
