import AppKit
import MilmilAPI
import MilmilRealtime
import UserNotifications

/// Bridges server events to macOS: Notification Center banners for new
/// server notifications and the Dock badge for the unread count.
@MainActor
final class SystemNotifier: NSObject, UNUserNotificationCenterDelegate {
    static let shared = SystemNotifier()

    private var authorized = false
    private var requested = false

    func requestAuthorizationIfNeeded() {
        guard !requested else { return }
        requested = true
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        center.requestAuthorization(options: [.alert, .sound, .badge]) { [weak self] granted, _ in
            Task { @MainActor in self?.authorized = granted }
        }
    }

    func post(_ notification: MilmilNotification) {
        guard authorized else { return }
        let content = UNMutableNotificationContent()
        content.title = notification.title
        content.body = notification.message
        content.sound = notification.severity == .error ? .defaultCritical : .default
        content.threadIdentifier = notification.category.rawValue
        content.userInfo = ["notificationID": notification.id, "type": notification.type]
        let request = UNNotificationRequest(identifier: notification.id, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }

    func setBadge(_ count: Int) {
        NSApp.dockTile.badgeLabel = count > 0 ? String(count) : nil
    }

    // Show banners even while the app is frontmost (the web shows a toast).
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }
}
