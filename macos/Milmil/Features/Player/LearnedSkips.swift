import Foundation

/// An OP/ED range the user taught the player by skipping it twice.
struct LearnedSkip: Codable, Equatable, Hashable {
    var start: Double
    var duration: Double
    var end: Double { start + duration }
}

/// A forward jump the user made by hand — the raw material a `LearnedSkip`
/// is distilled from.
struct SkipCandidate: Codable, Equatable {
    var start: Double
    var length: Double
}

/// Learned skips and the candidate jumps behind them, per series, in
/// `UserDefaults`. Two jumps that start within 20 s and last within 15 s of
/// each other are the same opening or ending.
@MainActor
final class LearnedSkips {
    static let shared = LearnedSkips()
    static let key = "player.learnedSkips"
    /// Jumps shorter than an OP or longer than an OP + recap are not skips.
    static let minimumLength: Double = 60
    static let maximumLength: Double = 150
    static let startTolerance: Double = 20
    static let lengthTolerance: Double = 15
    private static let candidateLimit = 12

    private struct Entry: Codable {
        var skips: [LearnedSkip] = []
        var candidates: [SkipCandidate] = []
    }

    private let defaults: UserDefaults
    private var entries: [String: Entry]

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if let data = defaults.data(forKey: Self.key), let decoded = try? JSONDecoder().decode([String: Entry].self, from: data) {
            entries = decoded
        } else {
            entries = [:]
        }
    }

    func skips(for bangumiID: Int) -> [LearnedSkip] {
        entries[String(bangumiID)]?.skips ?? []
    }

    func remember(_ skip: LearnedSkip, for bangumiID: Int) {
        var entry = entries[String(bangumiID)] ?? Entry()
        entry.skips.removeAll { Self.overlaps($0, skip) }
        entry.skips.append(skip)
        entry.candidates.removeAll { Self.matches($0, skip) }
        entries[String(bangumiID)] = entry
        persist()
    }

    func forget(for bangumiID: Int) {
        entries.removeValue(forKey: String(bangumiID))
        persist()
    }

    /// Records a manual jump; returns the skip it completes when an earlier
    /// jump on the same series lines up with it and nothing learned covers
    /// it yet.
    func record(start: Double, length: Double, for bangumiID: Int) -> LearnedSkip? {
        guard length >= Self.minimumLength, length <= Self.maximumLength else { return nil }
        var entry = entries[String(bangumiID)] ?? Entry()
        let candidate = SkipCandidate(start: start, length: length)
        if entry.skips.contains(where: { Self.matches(candidate, $0) }) { return nil }
        let twin = entry.candidates.first { Self.similar($0, candidate) }
        entry.candidates.append(candidate)
        if entry.candidates.count > Self.candidateLimit { entry.candidates.removeFirst(entry.candidates.count - Self.candidateLimit) }
        entries[String(bangumiID)] = entry
        persist()
        guard let twin else { return nil }
        let begin = min(twin.start, candidate.start)
        let finish = max(twin.start + twin.length, candidate.start + candidate.length)
        return LearnedSkip(start: begin, duration: finish - begin)
    }

    private static func similar(_ a: SkipCandidate, _ b: SkipCandidate) -> Bool {
        abs(a.start - b.start) <= startTolerance && abs(a.length - b.length) <= lengthTolerance
    }

    private static func matches(_ candidate: SkipCandidate, _ skip: LearnedSkip) -> Bool {
        abs(candidate.start - skip.start) <= startTolerance && abs(candidate.length - skip.duration) <= lengthTolerance
    }

    private static func overlaps(_ a: LearnedSkip, _ b: LearnedSkip) -> Bool {
        a.start < b.end && b.start < a.end
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(entries) {
            defaults.set(data, forKey: Self.key)
        }
    }
}
