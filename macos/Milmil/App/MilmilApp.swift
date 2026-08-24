import MilmilAPI
import SwiftUI

@main
struct MilmilApp: App {
    @State private var session = SessionStore(tokenStore: DevSnapshot.tokenStore ?? KeychainTokenStore(), defaults: .standard)
    @State private var player = PlayerCoordinator()
    @State private var trailers = TrailerCoordinator()
    @State private var menuBar = MenuBarController()
    /// `milmil://…` links and dropped / double-clicked `.torrent` files that
    /// arrived before the shell was ready.
    @State private var pendingLinks: [URL] = []
    @State private var pendingFiles: [URL] = []

    var body: some Scene {
        WindowGroup(id: "main") {
            RootView()
                .environment(session)
                .environment(player)
                .environment(trailers)
                .task {
                    DevSnapshot.runIfRequested()
                    menuBar.attach(player: player)
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
        }
        .windowStyle(.hiddenTitleBar)
        .windowToolbarStyle(.unified(showsTitle: false))
        .defaultSize(width: 1280, height: 800)
        // Navigation state is ours (Router); AppKit restoring NSTableView
        // selection would re-select a stale sidebar row on launch.
        .restorationBehavior(.disabled)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("開啟 URL…") { trailers.showOpenURL = true }
                    .keyboardShortcut("o", modifiers: [.command, .shift])
            }
        }

        Settings {
            SettingsView()
                .environment(session)
                .environment(player)
                .environment(trailers)
                .environment(menuBar)
        }

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
        .defaultSize(width: 854, height: 480)
        .restorationBehavior(.disabled)
    }
}
