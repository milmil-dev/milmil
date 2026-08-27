import Foundation
import MilmilAPI
import UserNotifications

/// Sunday 20:00 local: "本週你追嘅番出咗 N 集，仲有 M 集未睇", from the
/// series being watched (collection) and their playable episodes — an
/// episode counts as this week's when it aired in the last seven days and
/// has a file; unwatched when that file has not been completed. One pending
/// request, replaced on every recompute (start, then daily), so the numbers
/// are at most a day stale when it fires. Opens the collection.
@MainActor
final class WeeklyDigestScheduler {
    static let identifier = "weekly-digest"

    private let client: APIClient
    private let preferences: NotificationPreferences
    private var loop: Task<Void, Never>?
    /// Series polled per recompute; more than this is a stale collection.
    private let seriesCap = 40

    init(client: APIClient, preferences: NotificationPreferences = .shared) {
        self.client = client
        self.preferences = preferences
    }

    func start() {
        guard loop == nil else { return }
        observePreferences()
        loop = Task { [weak self] in
            while !Task.isCancelled {
                await self?.replan()
                try? await Task.sleep(for: .seconds(24 * 3600))
            }
        }
    }

    func stop() {
        loop?.cancel()
        loop = nil
    }

    private func observePreferences() {
        withObservationTracking {
            _ = preferences.weeklyDigest
        } onChange: { [weak self] in
            Task { @MainActor in
                guard let self, self.loop != nil else { return }
                await self.replan()
                self.observePreferences()
            }
        }
    }

    struct Summary: Equatable {
        var aired = 0
        var unwatched = 0
    }

    func replan() async {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [Self.identifier])
        guard preferences.weeklyDigest, let watching = try? await client.collection(status: .watching) else { return }
        let ids = watching.compactMap(\.bangumiID).prefix(seriesCap)
        var summary = Summary()
        await withTaskGroup(of: Summary.self) { group in
            for id in ids {
                group.addTask { [client] in
                    guard let playable = try? await client.playableEpisodes(bangumiID: id) else { return Summary() }
                    return Self.summarize(playable.episodes)
                }
            }
            for await part in group {
                summary.aired += part.aired
                summary.unwatched += part.unwatched
            }
        }
        guard summary.aired > 0 || summary.unwatched > 0, let fireAt = Self.nextSunday() else { return }
        let content = UNMutableNotificationContent()
        content.title = String(localized: "本週追番週報")
        content.body = String(localized: "本週你追嘅番出咗 \(summary.aired) 集，仲有 \(summary.unwatched) 集未睇")
        if preferences.sound { content.sound = .default }
        content.categoryIdentifier = SystemNotifier.CategoryID.plain
        content.userInfo = ["type": "weekly.digest", "url": "milmil://collection"]
        let components = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: fireAt)
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
        try? await center.add(UNNotificationRequest(identifier: Self.identifier, content: content, trigger: trigger))
    }

    /// Aired in the last seven days with a file → this week's; of those,
    /// not completed → unwatched. Pure for tests.
    nonisolated static func summarize(_ episodes: [PlayableEpisode], now: Date = Date()) -> Summary {
        var summary = Summary()
        let weekAgo = now.addingTimeInterval(-7 * 24 * 3600)
        for episode in episodes where episode.hasFile {
            guard let day = Formatters.day(from: episode.airDate), day >= weekAgo, day <= now else { continue }
            summary.aired += 1
            if episode.progress?.completed != true { summary.unwatched += 1 }
        }
        return summary
    }

    /// The coming Sunday at 20:00 local (next week's when that has passed).
    static func nextSunday(from now: Date = Date(), calendar: Calendar = .current) -> Date? {
        var components = DateComponents()
        components.weekday = 1
        components.hour = 20
        components.minute = 0
        return calendar.nextDate(after: now, matching: components, matchingPolicy: .nextTime)
    }
}
