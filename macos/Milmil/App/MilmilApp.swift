import MilmilAPI
import SwiftUI

@main
struct MilmilApp: App {
    @State private var session = SessionStore(tokenStore: KeychainTokenStore(), defaults: .standard)
    @State private var player = PlayerCoordinator()
    /// `milmil://…` links and dropped / double-clicked `.torrent` files that
    /// arrived before the shell was ready.
    @State private var pendingLinks: [URL] = []
    @State private var pendingFiles: [URL] = []

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .environment(player)
                .task {
                    DevSnapshot.runIfRequested()
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
            CommandGroup(replacing: .newItem) {}
        }

        Settings {
            SettingsView()
                .environment(session)
                .environment(player)
        }

        // One player window, reused across episodes (one mpv instance).
        Window("播放器", id: "player") {
            PlayerWindowView()
                .environment(session)
                .environment(player)
        }
        .windowStyle(.hiddenTitleBar)
        .defaultSize(width: 1024, height: 576)
        .restorationBehavior(.disabled)
    }
}
