import Foundation
import MilmilAPI
import Observation

/// What this Mac does with server notifications — banners per category,
/// sound, quiet hours and the local airing reminders. Server-side routing
/// (Discord / Telegram / webhook) lives in `NotificationSettings`; these are
/// per-machine and never leave `UserDefaults`.
@Observable
final class NotificationPreferences {
    static let shared = NotificationPreferences()

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        bannerCategories = Set(defaults.stringArray(forKey: Keys.banners) ?? Self.defaultBanners)
        sound = defaults.object(forKey: Keys.sound) as? Bool ?? true
        quietHoursEnabled = defaults.bool(forKey: Keys.quietEnabled)
        quietStartMinutes = defaults.object(forKey: Keys.quietStart) as? Int ?? 23 * 60
        quietEndMinutes = defaults.object(forKey: Keys.quietEnd) as? Int ?? 8 * 60
        airingReminders = defaults.object(forKey: Keys.airing) as? Bool ?? true
        airingLeadMinutes = defaults.object(forKey: Keys.airingLead) as? Int ?? 10
        resumeReminders = defaults.object(forKey: Keys.resume) as? Bool ?? true
        weeklyDigest = defaults.object(forKey: Keys.weekly) as? Bool ?? true
    }

    private enum Keys {
        static let banners = "notify.banners"
        static let sound = "notify.sound"
        static let quietEnabled = "notify.quiet.enabled"
        static let quietStart = "notify.quiet.start"
        static let quietEnd = "notify.quiet.end"
        static let airing = "notify.airing.enabled"
        static let airingLead = "notify.airing.leadMinutes"
        static let resume = "notify.resume.enabled"
        static let weekly = "notify.weekly.enabled"
    }

    private static let defaultBanners = MilmilNotification.Category.allCases.filter { $0 != .all }.map(\.rawValue)

    /// Categories that may show a banner (raw values of `Category`).
    var bannerCategories: Set<String> { didSet { defaults.set(Array(bannerCategories).sorted(), forKey: Keys.banners) } }
    var sound: Bool { didSet { defaults.set(sound, forKey: Keys.sound) } }
    var quietHoursEnabled: Bool { didSet { defaults.set(quietHoursEnabled, forKey: Keys.quietEnabled) } }
    /// Minutes from midnight, local time.
    var quietStartMinutes: Int { didSet { defaults.set(quietStartMinutes, forKey: Keys.quietStart) } }
    var quietEndMinutes: Int { didSet { defaults.set(quietEndMinutes, forKey: Keys.quietEnd) } }
    /// Local notifications scheduled from the airing calendar for followed
    /// series; fire even when the app is not running.
    var airingReminders: Bool { didSet { defaults.set(airingReminders, forKey: Keys.airing) } }
    var airingLeadMinutes: Int { didSet { defaults.set(airingLeadMinutes, forKey: Keys.airingLead) } }
    /// 「繼續睇？」: an episode left paused mid-way for half an hour.
    var resumeReminders: Bool { didSet { defaults.set(resumeReminders, forKey: Keys.resume) } }
    /// Sunday-evening summary of the week's new and unwatched episodes.
    var weeklyDigest: Bool { didSet { defaults.set(weeklyDigest, forKey: Keys.weekly) } }

    static let leadChoices = [5, 10, 15, 30, 60]

    func bannersEnabled(for category: MilmilNotification.Category) -> Bool {
        bannerCategories.contains(category.rawValue)
    }

    func setBanners(_ enabled: Bool, for category: MilmilNotification.Category) {
        if enabled { bannerCategories.insert(category.rawValue) } else { bannerCategories.remove(category.rawValue) }
    }

    /// True inside the quiet window (which may wrap midnight, 23:00 → 08:00).
    func isQuiet(at date: Date = Date(), calendar: Calendar = .current) -> Bool {
        guard quietHoursEnabled else { return false }
        let components = calendar.dateComponents([.hour, .minute], from: date)
        let now = (components.hour ?? 0) * 60 + (components.minute ?? 0)
        if quietStartMinutes == quietEndMinutes { return false }
        if quietStartMinutes < quietEndMinutes { return now >= quietStartMinutes && now < quietEndMinutes }
        return now >= quietStartMinutes || now < quietEndMinutes
    }

    /// Whether a server notification of this category should become a banner now.
    func allowsBanner(for category: MilmilNotification.Category, at date: Date = Date()) -> Bool {
        bannersEnabled(for: category) && !isQuiet(at: date)
    }
}
