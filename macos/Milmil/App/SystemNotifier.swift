import AppKit
import MilmilAPI
import MilmilRealtime
import UserNotifications

/// Bridges server events to macOS: Notification Center banners for new
/// server notifications (with the anime's cover and 播放 / 作品頁 actions when
/// the event names one), the Dock badge for the unread count, and the local
/// airing reminders the scheduler plans. Clicking a banner deep-links through
/// the same `milmil://` URLs the URL scheme uses.
@MainActor
final class SystemNotifier: NSObject, UNUserNotificationCenterDelegate {
    static let shared = SystemNotifier()

    /// Routes a `milmil://` URL into the running shell; set by the app.
    var openURL: ((URL) -> Void)?
    /// Marks a server notification read; set by the session.
    var markRead: ((String) async -> Void)?
    var preferences = NotificationPreferences.shared

    private var authorized = false
    private var requested = false

    enum CategoryID {
        static let anime = "milmil.anime"
        static let download = "milmil.download"
        static let airing = "milmil.airing"
        static let plain = "milmil.plain"
    }

    enum ActionID {
        static let play = "milmil.play"
        static let open = "milmil.open"
        static let markRead = "milmil.markRead"
    }

    static let airingIdentifierPrefix = "airing-"

    func requestAuthorizationIfNeeded() {
        guard !requested else { return }
        requested = true
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        center.setNotificationCategories(Self.categories)
        center.requestAuthorization(options: [.alert, .sound, .badge]) { [weak self] granted, _ in
            Task { @MainActor in self?.authorized = granted }
        }
    }

    private static var categories: Set<UNNotificationCategory> {
        let play = UNNotificationAction(identifier: ActionID.play, title: String(localized: "播放"), options: [.foreground])
        let open = UNNotificationAction(identifier: ActionID.open, title: String(localized: "作品頁"), options: [.foreground])
        let read = UNNotificationAction(identifier: ActionID.markRead, title: String(localized: "標為已讀"), options: [])
        return [
            UNNotificationCategory(identifier: CategoryID.anime, actions: [play, open, read], intentIdentifiers: []),
            UNNotificationCategory(identifier: CategoryID.download, actions: [open, read], intentIdentifiers: []),
            UNNotificationCategory(identifier: CategoryID.airing, actions: [open], intentIdentifiers: []),
            UNNotificationCategory(identifier: CategoryID.plain, actions: [read], intentIdentifiers: []),
        ]
    }

    // MARK: Server notifications

    func post(_ notification: MilmilNotification) {
        guard authorized, preferences.allowsBanner(for: notification.category) else { return }
        // The scheduler already planned a local reminder for this airing.
        if notification.type == "anime.airing", preferences.airingReminders { return }
        let content = UNMutableNotificationContent()
        content.title = Self.title(for: notification)
        content.body = notification.message
        if preferences.sound {
            content.sound = notification.severity == .error ? .defaultCritical : .default
        }
        content.threadIdentifier = notification.bangumiID.map { "anime-\($0)" } ?? notification.category.rawValue
        content.categoryIdentifier = Self.category(for: notification)
        var userInfo: [String: Any] = ["notificationID": notification.id, "type": notification.type]
        if let id = notification.bangumiID { userInfo["bangumiID"] = id }
        if let episode = notification.episodeID { userInfo["episodeID"] = episode }
        content.userInfo = userInfo
        let cover = notification.coverImage
        let id = notification.id
        Task {
            if let cover, let attachment = await Self.attachment(for: cover, id: id) {
                content.attachments = [attachment]
            }
            try? await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: content, trigger: nil))
        }
    }

    /// Localized headline when the server attached the anime; the raw
    /// server title otherwise.
    static func title(for notification: MilmilNotification) -> String {
        guard let name = notification.animeName else { return notification.title }
        let ep = notification.episodeLabel.map { "EP\($0)" } ?? ""
        switch notification.type {
        case "anime.episode_ready": return String(localized: "\(name) \(ep) 已可播放")
        case "download.completed": return String(localized: "\(name) \(ep) 已下載")
        case "download.started": return String(localized: "\(name) \(ep) 開始下載")
        case "download.failed": return String(localized: "\(name) \(ep) 下載失敗")
        case "anime.airing": return String(localized: "\(name) \(ep) 即將播出")
        default: return notification.title
        }
    }

    static func category(for notification: MilmilNotification) -> String {
        switch notification.type {
        case "anime.episode_ready": CategoryID.anime
        case "anime.airing": CategoryID.airing
        default: notification.bangumiID != nil ? CategoryID.download : CategoryID.plain
        }
    }

    /// The cover as a banner thumbnail, downloaded to a temp file the
    /// notification center then copies.
    private static func attachment(for url: URL, id: String) async -> UNNotificationAttachment? {
        guard let (data, response) = try? await URLSession.shared.data(from: url),
              (response as? HTTPURLResponse).map({ 200..<300 ~= $0.statusCode }) ?? true else { return nil }
        let ext = url.pathExtension.isEmpty ? "jpg" : url.pathExtension
        let file = FileManager.default.temporaryDirectory.appending(path: "notification-\(id).\(ext)")
        try? data.write(to: file)
        return try? UNNotificationAttachment(identifier: "cover", url: file)
    }

    // MARK: Local airing reminders

    /// Schedules one reminder; identifiers start with `airingIdentifierPrefix`
    /// so `clearAiringReminders` can find them again.
    func scheduleAiringReminder(id: String, title: String, body: String, at date: Date, bangumiID: Int) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        if preferences.sound { content.sound = .default }
        content.threadIdentifier = "anime-\(bangumiID)"
        content.categoryIdentifier = CategoryID.airing
        content.userInfo = ["type": "anime.airing", "bangumiID": bangumiID]
        let components = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: Self.airingIdentifierPrefix + id, content: content, trigger: trigger))
    }

    /// A locally composed notification (resume reminder, weekly digest):
    /// same categories and deep links as the server ones. `url` wins over
    /// the bangumi / episode pair when the click should land elsewhere.
    func postLocal(
        id: String, title: String, body: String,
        bangumiID: Int? = nil, episodeID: String? = nil, url: String? = nil, category: String = CategoryID.plain
    ) {
        guard authorized, !preferences.isQuiet() else { return }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        if preferences.sound { content.sound = .default }
        content.categoryIdentifier = category
        var userInfo: [String: Any] = ["type": id]
        if let bangumiID { userInfo["bangumiID"] = bangumiID }
        if let episodeID { userInfo["episodeID"] = episodeID }
        if let url { userInfo["url"] = url }
        content.userInfo = userInfo
        content.threadIdentifier = bangumiID.map { "anime-\($0)" } ?? id
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: content, trigger: nil))
    }

    func removePending(_ ids: [String]) {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ids)
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: ids)
    }

    func clearAiringReminders() async {
        let center = UNUserNotificationCenter.current()
        let pending = await center.pendingNotificationRequests()
        let ids = pending.map(\.identifier).filter { $0.hasPrefix(Self.airingIdentifierPrefix) }
        center.removePendingNotificationRequests(withIdentifiers: ids)
    }

    func setBadge(_ count: Int) {
        NSApp.dockTile.badgeLabel = count > 0 ? String(count) : nil
    }

    // MARK: Delegate

    // Show banners even while the app is frontmost (the web shows a toast).
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }

    /// A click or action button: mark the row read, then deep-link —
    /// 播放 to the watch page, anything else to the series (or the
    /// notifications list when the event named no series).
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let info = response.notification.request.content.userInfo
        let action = response.actionIdentifier
        let bangumiID = info["bangumiID"] as? Int
        let episodeID = info["episodeID"] as? String
        let notificationID = info["notificationID"] as? String
        let link = info["url"] as? String
        await MainActor.run {
            if action == ActionID.markRead || action == UNNotificationDefaultActionIdentifier, let notificationID {
                Task { await self.markRead?(notificationID) }
            }
            guard action != ActionID.markRead, action != UNNotificationDismissActionIdentifier else { return }
            let url: URL? = if action == ActionID.play, let bangumiID {
                URL(string: "milmil://watch/\(bangumiID)" + (episodeID.map { "?ep=\($0)" } ?? ""))
            } else if let link, let target = URL(string: link) {
                target
            } else if let bangumiID {
                URL(string: "milmil://anime/\(bangumiID)")
            } else {
                URL(string: "milmil://notifications")
            }
            if let url {
                NSApp.activate()
                self.openURL?(url)
            }
        }
    }
}
