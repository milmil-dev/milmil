import AppKit
import CoreSpotlight
import MilmilAPI

/// AppKit entry points SwiftUI has no hook for: the Dock menu, keeping the
/// app alive in the menu bar after the last window closes, reopening from
/// the Dock, and Spotlight result activation.
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let dockMenu = DockMenuModel()
    private var closeProxies: [ObjectIdentifier: WindowCloseProxy] = [:]
    private var observers: [any NSObjectProtocol] = []

    func applicationDidFinishLaunching(_ notification: Notification) {
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: NSWindow.didBecomeKeyNotification, object: nil, queue: .main) { [weak self] note in
            guard let window = note.object as? NSWindow else { return }
            MainActor.assumeIsolated { self?.installCloseProxy(on: window) }
        })
        // A milmil:// link or a notification click activates the app while
        // it is parked in the menu bar; bring the window back with it.
        observers.append(center.addObserver(forName: NSApplication.didBecomeActiveNotification, object: nil, queue: .main) { _ in
            MainActor.assumeIsolated { AppDelegate.restoreRegularIfNeeded() }
        })
        dockMenu.start()
        followSessionForSpotlight()
    }

    /// The shell registers the session after login; index the collection
    /// for Spotlight whenever a new one appears.
    private func followSessionForSpotlight() {
        withObservationTracking {
            if let session = CurrentSession.shared.session {
                SpotlightIndexer.shared.follow(session)
            } else {
                SpotlightIndexer.shared.stop()
            }
        } onChange: { [weak self] in
            Task { @MainActor in self?.followSessionForSpotlight() }
        }
    }

    // MARK: Dock

    func applicationDockMenu(_ sender: NSApplication) -> NSMenu? {
        dockMenu.menu()
    }

    /// Dock click while parked: un-hide the existing window ourselves and
    /// tell SwiftUI not to open a second one.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        Self.restoreRegularIfNeeded()
        guard !flag, NSApp.windows.contains(where: Self.isMainWindow) else { return true }
        Self.showMainWindow()
        return false
    }

    // MARK: Menu-bar-only mode

    /// 關閉視窗後留在選單列: closing the last window parks the app in the
    /// menu bar instead of quitting. Only meaningful with the extra installed.
    static var keepsRunningInMenuBar: Bool {
        UserDefaults.standard.bool(forKey: DesktopDefaults.keepInMenuBar)
            && (UserDefaults.standard.object(forKey: DesktopDefaults.menuBarExtra) as? Bool ?? true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        !Self.keepsRunningInMenuBar
    }

    /// The main window's close is intercepted so the shell (and with it the
    /// session's WebSocket) stays alive: SwiftUI tears the view tree down on a
    /// real close, and `MainShellView.onDisappear` stops the session.
    private func installCloseProxy(on window: NSWindow) {
        guard Self.isMainWindow(window), closeProxies[ObjectIdentifier(window)] == nil else { return }
        let proxy = WindowCloseProxy(original: window.delegate)
        window.delegate = proxy
        closeProxies[ObjectIdentifier(window)] = proxy
    }

    static func isMainWindow(_ window: NSWindow) -> Bool {
        window.identifier?.rawValue.hasPrefix("main") ?? false
    }

    static func parkInMenuBar(hiding window: NSWindow) {
        window.orderOut(nil)
        NSApp.setActivationPolicy(.accessory)
    }

    static func restoreRegularIfNeeded() {
        guard NSApp.activationPolicy() == .accessory else { return }
        NSApp.setActivationPolicy(.regular)
        showMainWindow()
        NSApp.activate()
    }

    static func showMainWindow() {
        if let window = NSApp.windows.first(where: isMainWindow) {
            window.makeKeyAndOrderFront(nil)
        }
    }

    // MARK: Spotlight

    func application(
        _ application: NSApplication,
        continue userActivity: NSUserActivity,
        restorationHandler: @escaping ([any NSUserActivityRestoring]) -> Void
    ) -> Bool {
        guard userActivity.activityType == CSSearchableItemActionType,
              let identifier = userActivity.userInfo?[CSSearchableItemActivityIdentifier] as? String,
              let bangumiID = SpotlightIndexer.bangumiID(fromIdentifier: identifier),
              let url = URL(string: "milmil://anime/\(bangumiID)") else { return false }
        Self.restoreRegularIfNeeded()
        SystemNotifier.shared.openURL?(url)
        return true
    }
}

/// Forwards every delegate call to SwiftUI's own window delegate and only
/// answers `windowShouldClose` itself: hide-and-park when the user asked to
/// stay in the menu bar, otherwise defer to the original.
private nonisolated final class WindowCloseProxy: NSObject, NSWindowDelegate {
    // Only ever touched on the main thread (AppKit delegate calls), but the
    // ObjC forwarding overrides must stay nonisolated to match NSObject.
    private nonisolated(unsafe) weak var original: (any NSWindowDelegate)?

    init(original: (any NSWindowDelegate)?) {
        self.original = original
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        MainActor.assumeIsolated {
            if AppDelegate.keepsRunningInMenuBar {
                AppDelegate.parkInMenuBar(hiding: sender)
                return false
            }
            return original?.windowShouldClose?(sender) ?? true
        }
    }

    override func responds(to aSelector: Selector!) -> Bool {
        super.responds(to: aSelector) || (original?.responds(to: aSelector) ?? false)
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        original
    }
}

/// Dock menu contents, refreshed in the background because
/// `applicationDockMenu` must answer synchronously.
private final class DockMenuModel {
    private var resume: [ProgressEntry] = []
    private var airing: [FollowedAiring.Item] = []
    private var downloads: [Download] = []
    private var refreshedAt: Date?
    private var refreshing = false
    private let ttl: TimeInterval = 120

    func start() {
        Task { [weak self] in
            while !Task.isCancelled {
                await self?.refresh(force: true)
                try? await Task.sleep(for: .seconds(300))
            }
        }
    }

    func menu() -> NSMenu {
        Task { await refresh(force: false) }
        let menu = NSMenu()
        if NSApp.activationPolicy() == .accessory {
            menu.addItem(withTitle: String(localized: "顯示 milmil"), action: #selector(showWindow), keyEquivalent: "").target = self
            menu.addItem(.separator())
        }
        for entry in resume.prefix(3) {
            let title = String(localized: "繼續觀看：\(entry.displayTitle) \(Formatters.episode(entry.episodeNumber))")
            let item = NSMenuItem(title: title, action: #selector(open(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = entry.animeBangumiID.map { "milmil://watch/\($0)?ep=\(entry.episodeID)" }
            item.isEnabled = entry.animeBangumiID != nil
            menu.addItem(item)
        }
        let airingItem = NSMenuItem(title: String(localized: "今日播出"), action: nil, keyEquivalent: "")
        let submenu = NSMenu()
        if airing.isEmpty {
            let none = NSMenuItem(title: String(localized: "沒有追蹤中的番劇今天播出"), action: nil, keyEquivalent: "")
            none.isEnabled = false
            submenu.addItem(none)
        }
        for show in airing {
            let ep = show.episode.map { "EP\($0)" } ?? ""
            let when = show.localTime ?? show.airTimeJST
            let item = NSMenuItem(title: "\(when)  \(show.title) \(ep)", action: #selector(open(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = "milmil://anime/\(show.bangumiID)"
            submenu.addItem(item)
        }
        airingItem.submenu = submenu
        menu.addItem(airingItem)
        let active = downloads.filter { $0.status == "active" || $0.status == "waiting" }
        let paused = downloads.filter { $0.status == "paused" }
        if !active.isEmpty || !paused.isEmpty {
            menu.addItem(.separator())
            if !active.isEmpty {
                menu.addItem(withTitle: String(localized: "暫停所有下載（\(active.count)）"), action: #selector(pauseAll), keyEquivalent: "").target = self
            }
            if !paused.isEmpty {
                menu.addItem(withTitle: String(localized: "繼續所有下載（\(paused.count)）"), action: #selector(resumeAll), keyEquivalent: "").target = self
            }
        }
        return menu
    }

    private func refresh(force: Bool) async {
        guard let client = CurrentSession.shared.session?.client, !refreshing else { return }
        if !force, let refreshedAt, Date().timeIntervalSince(refreshedAt) < ttl { return }
        refreshing = true
        defer { refreshing = false }
        async let resumeTask = try? client.recentProgress()
        async let airingTask = FollowedAiring.today(client: client)
        async let downloadsTask = try? client.downloads()
        resume = (await resumeTask ?? []).filter { !$0.completed }
        airing = await airingTask.items
        downloads = await downloadsTask ?? []
        refreshedAt = Date()
    }

    @objc private func showWindow() {
        AppDelegate.restoreRegularIfNeeded()
        AppDelegate.showMainWindow()
    }

    @objc private func open(_ sender: NSMenuItem) {
        guard let string = sender.representedObject as? String, let url = URL(string: string) else { return }
        AppDelegate.restoreRegularIfNeeded()
        NSApp.activate()
        SystemNotifier.shared.openURL?(url)
    }

    @objc private func pauseAll() {
        let gids = downloads.filter { $0.status == "active" || $0.status == "waiting" }.map(\.gid)
        Task {
            guard let client = CurrentSession.shared.session?.client else { return }
            for gid in gids { try? await client.pauseDownload(gid: gid) }
            await refresh(force: true)
        }
    }

    @objc private func resumeAll() {
        let gids = downloads.filter { $0.status == "paused" }.map(\.gid)
        Task {
            guard let client = CurrentSession.shared.session?.client else { return }
            for gid in gids { try? await client.resumeDownload(gid: gid) }
            await refresh(force: true)
        }
    }
}
