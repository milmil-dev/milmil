import Foundation
import MilmilPlayer

/// What the user picked while watching one series — audio track, subtitle
/// track (or off), subtitle visibility, speed — so the next episode opens
/// the same way without another trip through the menus. Tracks are matched
/// by title, then language, never by mpv's per-file ids.
struct SeriesPlaybackPreference: Codable, Equatable {
    var audioLanguage: String?
    var audioTitle: String?
    var subtitleLanguage: String?
    var subtitleTitle: String?
    /// The user turned the subtitle track off (distinct from "never chose").
    var subtitleOff = false
    var subtitlesVisible: Bool?
    var speed: Double?

    var isEmpty: Bool {
        audioLanguage == nil && audioTitle == nil && subtitleLanguage == nil && subtitleTitle == nil
            && !subtitleOff && subtitlesVisible == nil && speed == nil
    }
}

/// Per-series preferences keyed by Bangumi id, in `UserDefaults`.
@MainActor
final class SeriesPlaybackPreferences {
    static let shared = SeriesPlaybackPreferences()
    static let key = "player.seriesPreferences"

    private let defaults: UserDefaults
    private var cache: [String: SeriesPlaybackPreference]

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if let data = defaults.data(forKey: Self.key),
           let decoded = try? JSONDecoder().decode([String: SeriesPlaybackPreference].self, from: data) {
            cache = decoded
        } else {
            cache = [:]
        }
    }

    func preference(for bangumiID: Int) -> SeriesPlaybackPreference? {
        cache[String(bangumiID)]
    }

    func update(_ bangumiID: Int, _ change: (inout SeriesPlaybackPreference) -> Void) {
        var preference = cache[String(bangumiID)] ?? SeriesPlaybackPreference()
        change(&preference)
        if preference.isEmpty {
            cache.removeValue(forKey: String(bangumiID))
        } else {
            cache[String(bangumiID)] = preference
        }
        persist()
    }

    func forget(_ bangumiID: Int) {
        cache.removeValue(forKey: String(bangumiID))
        persist()
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(cache) {
            defaults.set(data, forKey: Self.key)
        }
    }

    /// The track that best matches a remembered choice: same title first,
    /// then same language (case-insensitive, `zh-TW` also matches `zh`).
    static func match(_ tracks: [MediaTrack], language: String?, title: String?) -> MediaTrack? {
        if let title, !title.isEmpty, let exact = tracks.first(where: { $0.title == title }) { return exact }
        guard let language, !language.isEmpty else { return nil }
        let wanted = language.lowercased()
        if let exact = tracks.first(where: { $0.language?.lowercased() == wanted }) { return exact }
        let base = wanted.split(separator: "-").first.map(String.init) ?? wanted
        return tracks.first { track in
            guard let lang = track.language?.lowercased() else { return false }
            return lang.hasPrefix(base) || base.hasPrefix(lang)
        }
    }
}
