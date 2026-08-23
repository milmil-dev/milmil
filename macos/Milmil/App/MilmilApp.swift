import MilmilAPI
import SwiftUI

@main
struct MilmilApp: App {
    @State private var session = SessionStore(tokenStore: KeychainTokenStore(), defaults: .standard)
    @State private var player = PlayerCoordinator()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .environment(player)
                .task {
                    DevSnapshot.runIfRequested()
                    await session.bootstrap()
                }
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
