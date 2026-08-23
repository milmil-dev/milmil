import MilmilAPI
import SwiftUI

@main
struct MilmilApp: App {
    @State private var session = SessionStore(tokenStore: KeychainTokenStore(), defaults: .standard)

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
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
    }
}
