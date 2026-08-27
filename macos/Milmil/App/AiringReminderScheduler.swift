import Foundation
import MilmilAPI
import Observation
import UserNotifications

/// Plans local "airs soon" reminders for followed series from the airing
/// calendar: one `UNCalendarNotificationTrigger` per episode over the next
/// week, `airingLeadMinutes` before the JST air time. Local triggers fire
/// even when the app is not running — the server's `anime.airing` needs the
/// WebSocket open and a Telegram setting enabled, so this replaces it on the
/// Mac. Replans on start, every six hours, and when the preferences change.
@MainActor
final class AiringReminderScheduler {
    private let client: APIClient
    private let preferences: NotificationPreferences
    private let notifier: SystemNotifier
    private var loop: Task<Void, Never>?
    private var horizonDays = 7
    /// Notification Center keeps at most 64 pending requests per app.
    private let capacity = 56

    init(client: APIClient, preferences: NotificationPreferences = .shared, notifier: SystemNotifier = .shared) {
        self.client = client
        self.preferences = preferences
        self.notifier = notifier
    }

    func start() {
        guard loop == nil else { return }
        observePreferences()
        loop = Task { [weak self] in
            while !Task.isCancelled {
                await self?.replan()
                try? await Task.sleep(for: .seconds(6 * 3600))
            }
        }
    }

    func stop() {
        loop?.cancel()
        loop = nil
    }

    private func observePreferences() {
        withObservationTracking {
            _ = preferences.airingReminders
            _ = preferences.airingLeadMinutes
            _ = preferences.sound
        } onChange: { [weak self] in
            Task { @MainActor in
                guard let self, self.loop != nil else { return }
                await self.replan()
                self.observePreferences()
            }
        }
    }

    /// Followed = collection status "watching" ∪ enabled download rules with
    /// a Bangumi ID — the same set the server's digest uses.
    func replan() async {
        await notifier.clearAiringReminders()
        guard preferences.airingReminders else { return }
        async let calendarTask = try? client.calendar()
        async let watchingTask = try? client.collection(status: .watching)
        async let rulesTask = try? client.downloadRules()
        guard let calendar = await calendarTask else { return }
        var followed = Set((await watchingTask ?? []).compactMap(\.bangumiID))
        for rule in await rulesTask ?? [] where rule.enabled {
            if let id = rule.bangumiID { followed.insert(id) }
        }
        guard !followed.isEmpty else { return }
        let plan = Self.plan(calendar: calendar, followed: followed, leadMinutes: preferences.airingLeadMinutes, horizonDays: horizonDays)
        for entry in plan.prefix(capacity) {
            notifier.scheduleAiringReminder(id: entry.id, title: entry.title, body: entry.body, at: entry.fireAt, bangumiID: entry.bangumiID)
        }
    }

    struct Entry: Equatable {
        let id: String
        let bangumiID: Int
        let title: String
        let body: String
        let fireAt: Date
    }

    /// Pure planning for tests: every followed calendar item on each matching
    /// weekday within the horizon, soonest first.
    static func plan(calendar days: [CalendarDay], followed: Set<Int>, leadMinutes: Int, horizonDays: Int, now: Date = Date()) -> [Entry] {
        guard let tokyo = TimeZone(identifier: "Asia/Tokyo") else { return [] }
        var jst = Calendar(identifier: .gregorian)
        jst.timeZone = tokyo
        let stamp = DateFormatter()
        stamp.calendar = jst
        stamp.timeZone = tokyo
        stamp.dateFormat = "yyyyMMdd"
        var entries: [Entry] = []
        for offset in 0..<horizonDays {
            guard let day = jst.date(byAdding: .day, value: offset, to: now) else { continue }
            let weekday = jst.component(.weekday, from: day)
            for calendarDay in days where Self.weekdayIndex(calendarDay.weekdayEN) == weekday {
                for item in calendarDay.items where item.bangumiID > 0 && followed.contains(item.bangumiID) {
                    guard let airTime = item.airTime, let airs = Self.airDate(airTime, on: day, calendar: jst) else { continue }
                    let fireAt = airs.addingTimeInterval(-Double(leadMinutes) * 60)
                    guard fireAt > now else { continue }
                    let weeksAhead = offset / 7
                    let episode = item.nextEpisode.map { $0 + weeksAhead }
                    let ep = episode.map { "EP\($0)" } ?? ""
                    let local = Formatters.localTime(fromJST: airTime)
                    let when = local.map { local in String(localized: "\(airTime) JST · 本地 \(local)") } ?? airTime
                    entries.append(Entry(
                        id: "\(item.bangumiID)-\(stamp.string(from: day))",
                        bangumiID: item.bangumiID,
                        title: String(localized: "\(item.title) \(ep) 即將播出"),
                        body: String(localized: "\(leadMinutes) 分鐘後播出 · \(when)"),
                        fireAt: fireAt
                    ))
                }
            }
        }
        return entries.sorted { $0.fireAt < $1.fireAt }
    }

    /// `Mon`/`Monday` → 2 (Calendar's Sunday = 1 numbering).
    static func weekdayIndex(_ name: String) -> Int? {
        switch name.lowercased().prefix(3) {
        case "sun": 1
        case "mon": 2
        case "tue": 3
        case "wed": 4
        case "thu": 5
        case "fri": 6
        case "sat": 7
        default: nil
        }
    }

    private static func airDate(_ hhmm: String, on day: Date, calendar: Calendar) -> Date? {
        let parts = hhmm.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2 else { return nil }
        var components = calendar.dateComponents([.year, .month, .day], from: day)
        components.hour = parts[0]
        components.minute = parts[1]
        components.second = 0
        return calendar.date(from: components)
    }
}
