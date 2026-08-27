import Foundation
import MilmilAPI
import MilmilRealtime
import Observation

/// Everything that lives for the duration of one logged-in server session:
/// the API client, the realtime stream, shared preferences and the small
/// bits of global state (unread badge) pages read from.
@Observable
final class ServerSession {
    let profile: ServerProfile
    /// Re-read after profile edits (avatar) so every view showing the
    /// account picks the change up.
    private(set) var user: User
    let client: APIClient
    let realtime: RealtimeClient
    /// Local "airs soon" reminders for followed series.
    let airingReminders: AiringReminderScheduler

    private(set) var preferences = GlobalPreferences()
    private(set) var unreadNotifications = 0 {
        didSet { SystemNotifier.shared.setBadge(unreadNotifications) }
    }
    private(set) var isRealtimeConnected = false
    /// Offline banner state: set five seconds after a connection drops (a
    /// blink on wake should not flash a banner), cleared on reconnect.
    private(set) var offlineSince: Date?
    /// Failed reconnect attempts since the drop; drives the retry interval shown.
    private(set) var reconnectAttempts = 0
    private var offlineTask: Task<Void, Never>?

    /// Seconds until the realtime client tries again (its backoff ladder).
    var nextRetrySeconds: Int {
        let ladder = RealtimeClient.backoff
        return Int(ladder[min(max(reconnectAttempts - 1, 0), ladder.count - 1)])
    }
    /// Bumped on every realtime event so views can refetch (`.task(id:)`).
    private(set) var eventGeneration = 0
    /// `service:changed` only — job ticks arrive every few seconds and must
    /// not invalidate the browsing pages.
    private(set) var serviceGeneration = 0
    private(set) var lastEvent: ServerEvent?
    /// `system:update-available` — the server's hourly GitHub release poll.
    private(set) var updateAvailable: UpdateAvailable?

    private var realtimeTask: Task<Void, Never>?
    private var preferencesSaveTask: Task<Void, Never>?

    init(profile: ServerProfile, user: User, client: APIClient) {
        self.profile = profile
        self.user = user
        self.client = client
        realtime = RealtimeClient(baseURL: profile.baseURL, client: client)
        airingReminders = AiringReminderScheduler(client: client)
    }

    func start() {
        guard realtimeTask == nil else { return }
        SystemNotifier.shared.requestAuthorizationIfNeeded()
        SystemNotifier.shared.markRead = { [client] id in
            try? await client.markNotificationRead(id: id)
        }
        airingReminders.start()
        OfflineStore.shared.activate(profileID: profile.id, client: client)
        // The bootstrap hands over a placeholder User from the saved profile
        // (id + name); /auth/me fills in the rest, e.g. the avatar.
        Task { await refreshUser() }
        Task { await loadPreferences() }
        Task { await refreshUnread() }
        realtimeTask = Task { [weak self] in
            guard let self else { return }
            let stream = await realtime.events()
            for await event in stream {
                handle(event)
            }
        }
    }

    func stop() {
        realtimeTask?.cancel()
        realtimeTask = nil
        offlineTask?.cancel()
        offlineTask = nil
        offlineSince = nil
        airingReminders.stop()
        OfflineStore.shared.deactivate()
        SystemNotifier.shared.markRead = nil
        Task { await realtime.stop() }
        SystemNotifier.shared.setBadge(0)
    }

    private func handle(_ event: ServerEvent) {
        switch event.type {
        case ServerEvent.connectedType:
            isRealtimeConnected = true
            offlineTask?.cancel()
            offlineTask = nil
            offlineSince = nil
            reconnectAttempts = 0
        case ServerEvent.disconnectedType:
            isRealtimeConnected = false
            reconnectAttempts += 1
            if offlineTask == nil, offlineSince == nil {
                offlineTask = Task { [weak self] in
                    try? await Task.sleep(for: .seconds(5))
                    guard !Task.isCancelled, let self, !isRealtimeConnected else { return }
                    offlineSince = Date()
                }
            }
        case ServerEventType.notificationNew:
            unreadNotifications += 1
            if let notification: MilmilNotification = try? event.decode() {
                SystemNotifier.shared.post(notification)
                DockController.shared.noticed(notification)
                if notification.type == "anime.episode_ready" { OfflineStore.shared.rules.runSoon() }
            }
            lastEvent = event
            eventGeneration += 1
        case ServerEventType.downloadProgress:
            DockController.shared.downloadProgress(event)
            lastEvent = event
            eventGeneration += 1
        case "service:changed":
            lastEvent = event
            serviceGeneration += 1
        default:
            if event.type == ServerEventType.updateAvailable, let update: UpdateAvailable = try? event.decode() {
                updateAvailable = update
            }
            lastEvent = event
            eventGeneration += 1
        }
    }

    // MARK: - Account

    func refreshUser() async {
        if let fresh = try? await client.me() { user = fresh }
    }

    // MARK: - Preferences

    func loadPreferences() async {
        if let loaded = try? await client.globalPreferences() {
            preferences = loaded
        }
    }

    /// Mutate-then-debounce, like the web store's 2 s sync.
    func updatePreferences(_ change: (inout GlobalPreferences) -> Void) {
        change(&preferences)
        preferencesSaveTask?.cancel()
        let snapshot = preferences
        preferencesSaveTask = Task { [client] in
            try? await Task.sleep(for: .seconds(2))
            guard !Task.isCancelled else { return }
            try? await client.saveGlobalPreferences(snapshot)
        }
    }

    // MARK: - Notifications badge

    func refreshUnread() async {
        if let count = try? await client.unreadNotificationCount() {
            unreadNotifications = count
        }
    }

    func setUnread(_ count: Int) {
        unreadNotifications = max(0, count)
    }
}
