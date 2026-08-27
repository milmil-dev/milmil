import AppKit
import MilmilAPI
import SwiftUI

@main
struct MilmilApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var session = SessionStore(tokenStore: DevSnapshot.tokenStore ?? KeychainTokenStore(), defaults: .standard)
    @State private var player = PlayerCoordinator()
    @State private var trailers = TrailerCoordinator()
    @State private var menuBar = MenuBarController()
    @State private var settingsNavigator = SettingsNavigator()
    /// `milmil://…` links and dropped / double-clicked `.torrent` files that
    /// arrived before the shell was ready.
    @State private var pendingLinks: [URL] = []
    @State private var pendingFiles: [URL] = []

    init() {
        // One main window, one player, one trailer window — nothing here
        // tabs, so keep "Show Tab Bar" out of the View and Window menus.
        NSWindow.allowsAutomaticWindowTabbing = false
    }

    var body: some Scene {
        WindowGroup(id: "main") {
            RootView()
                .environment(session)
                .environment(player)
                .environment(trailers)
                .task {
                    DevSnapshot.runIfRequested()
                    menuBar.attach(player: player)
                    // Banner clicks arrive as milmil:// links, same as the URL scheme.
                    SystemNotifier.shared.openURL = { pendingLinks.append($0) }
                    await session.bootstrap()
                }
                .onOpenURL { url in
                    if url.isFileURL {
                        pendingFiles.append(url)
                    } else {
                        pendingLinks.append(url)
                    }
                }
                .environment(\.pendingOpenURLs, OpenURLQueue(links: $pendingLinks, files: $pendingFiles))
                // Route milmil:// links into this (existing) window — without
                // the preferring/allowing pair every deep link spawns a fresh
                // window stuck on its own Home.
                .handlesExternalEvents(preferring: ["*"], allowing: ["*"])
        }
        .handlesExternalEvents(matching: ["*"])
        .windowStyle(.hiddenTitleBar)
        .windowToolbarStyle(.unified(showsTitle: false))
        .defaultSize(width: 1480, height: 940)
        // Navigation state is ours (Router); AppKit restoring NSTableView
        // selection would re-select a stale sidebar row on launch.
        .restorationBehavior(.disabled)
        .commands {
            AccountCommands(session: session)
            FileCommands(trailers: trailers) { pendingFiles.append(contentsOf: $0) }
            ViewCommands()
            GoCommands()
            PlaybackCommands(player: player)
            WindowCommands(player: player)
            HelpCommands(settings: settingsNavigator)
        }

        Settings {
            SettingsView()
                .environment(session)
                .environment(player)
                .environment(trailers)
                .environment(menuBar)
                .environment(settingsNavigator)
        }
        .windowResizability(.contentSize)

        // One player window, reused across episodes (one mpv instance).
        Window(String(localized: "播放器"), id: "player") {
            PlayerWindowView()
                .environment(session)
                .environment(player)
        }
        .windowStyle(.hiddenTitleBar)
        .defaultSize(width: 1024, height: 576)
        .restorationBehavior(.disabled)

        // Trailers /「開啟 URL」get their own small mpv instance.
        Window(String(localized: "預告片"), id: "trailer") {
            TrailerWindowView()
                .environment(trailers)
        }
        .windowStyle(.hiddenTitleBar)
        .defaultSize(width: 854, height: 480)
        .restorationBehavior(.disabled)
    }
}
