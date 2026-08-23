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
    let user: User
    let client: APIClient
    let realtime: RealtimeClient

    private(set) var preferences = GlobalPreferences()
    private(set) var unreadNotifications = 0 {
        didSet { SystemNotifier.shared.setBadge(unreadNotifications) }
    }
    private(set) var isRealtimeConnected = false
    /// Bumped on every realtime event so views can refetch (`.task(id:)`).
    private(set) var eventGeneration = 0
    private(set) var lastEvent: ServerEvent?

    private var realtimeTask: Task<Void, Never>?
    private var preferencesSaveTask: Task<Void, Never>?

    init(profile: ServerProfile, user: User, client: APIClient) {
        self.profile = profile
        self.user = user
        self.client = client
        realtime = RealtimeClient(baseURL: profile.baseURL, client: client)
    }

    func start() {
        guard realtimeTask == nil else { return }
        SystemNotifier.shared.requestAuthorizationIfNeeded()
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
        Task { await realtime.stop() }
        SystemNotifier.shared.setBadge(0)
    }

    private func handle(_ event: ServerEvent) {
        switch event.type {
        case ServerEvent.connectedType:
            isRealtimeConnected = true
        case ServerEvent.disconnectedType:
            isRealtimeConnected = false
        case ServerEventType.notificationNew:
            unreadNotifications += 1
            if let notification: MilmilNotification = try? event.decode() {
                SystemNotifier.shared.post(notification)
            }
            lastEvent = event
            eventGeneration += 1
        default:
            lastEvent = event
            eventGeneration += 1
        }
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
