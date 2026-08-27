import Foundation
import MilmilAPI

/// Followed series airing today, shared by the Dock menu and the App Intent.
/// "Followed" is the same set the airing reminders use: collection status
/// 觀看中 ∪ enabled download rules with a Bangumi ID.
struct FollowedAiring: Sendable {
    struct Item: Identifiable, Sendable, Hashable {
        let bangumiID: Int
        let title: String
        let episode: Int?
        /// "23:30" in JST, straight from the calendar.
        let airTimeJST: String
        /// The same moment on this Mac's clock, when it converts.
        let localTime: String?
        var id: Int { bangumiID }
    }

    let items: [Item]

    static func followedIDs(client: APIClient) async -> Set<Int> {
        async let watchingTask = try? client.collection(status: .watching)
        async let rulesTask = try? client.downloadRules()
        var followed = Set((await watchingTask ?? []).compactMap(\.bangumiID))
        for rule in await rulesTask ?? [] where rule.enabled {
            if let id = rule.bangumiID { followed.insert(id) }
        }
        return followed
    }

    /// Today in JST, sorted by air time.
    static func today(client: APIClient, now: Date = Date()) async -> FollowedAiring {
        async let calendarTask = try? client.calendar()
        let followed = await followedIDs(client: client)
        guard !followed.isEmpty, let calendar = await calendarTask, let tokyo = TimeZone(identifier: "Asia/Tokyo") else {
            return FollowedAiring(items: [])
        }
        var jst = Calendar(identifier: .gregorian)
        jst.timeZone = tokyo
        let weekday = jst.component(.weekday, from: now)
        var items: [Item] = []
        for day in calendar where AiringReminderScheduler.weekdayIndex(day.weekdayEN) == weekday {
            for anime in day.items where anime.bangumiID > 0 && followed.contains(anime.bangumiID) {
                guard let airTime = anime.airTime else { continue }
                items.append(Item(
                    bangumiID: anime.bangumiID,
                    title: anime.title,
                    episode: anime.nextEpisode,
                    airTimeJST: airTime,
                    localTime: Formatters.localTime(fromJST: airTime)
                ))
            }
        }
        return FollowedAiring(items: items.sorted { $0.airTimeJST < $1.airTimeJST })
    }
}
