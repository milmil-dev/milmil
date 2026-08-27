import Foundation
import Observation

/// 離線: the smart-keep rules and the quota, per machine.
@Observable
final class OfflinePreferences {
    static let shared = OfflinePreferences()

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        autoKeep = defaults.bool(forKey: Keys.autoKeep)
        autoKeepCount = defaults.object(forKey: Keys.autoKeepCount) as? Int ?? 2
        autoDeleteWatched = defaults.object(forKey: Keys.autoDelete) as? Bool ?? true
        quotaGB = defaults.object(forKey: Keys.quota) as? Int ?? 20
    }

    private enum Keys {
        static let autoKeep = "offline.auto.enabled"
        static let autoKeepCount = "offline.auto.count"
        static let autoDelete = "offline.autoDeleteWatched"
        static let quota = "offline.quotaGB"
    }

    /// Off by default: keeping gigabytes without being asked is a surprise.
    var autoKeep: Bool { didSet { defaults.set(autoKeep, forKey: Keys.autoKeep) } }
    var autoKeepCount: Int { didSet { defaults.set(autoKeepCount, forKey: Keys.autoKeepCount) } }
    var autoDeleteWatched: Bool { didSet { defaults.set(autoDeleteWatched, forKey: Keys.autoDelete) } }
    var quotaGB: Int { didSet { defaults.set(quotaGB, forKey: Keys.quota) } }

    static let countChoices = [1, 2, 3, 5]
    static let quotaChoices = [5, 10, 20, 50, 100]
    var quotaBytes: Int64 { Int64(quotaGB) * 1_000_000_000 }
    /// Watched copies are dropped this long after the last play.
    static let watchedGrace: TimeInterval = 24 * 3600
}
