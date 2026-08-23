import MilmilAPI
import SwiftUI

@main
struct MilmilApp: App {
    @State private var session = SessionStore(tokenStore: KeychainTokenStore(), defaults: .standard)

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .task { await session.bootstrap() }
        }
        .windowStyle(.hiddenTitleBar)
        .windowToolbarStyle(.unified(showsTitle: false))
        .defaultSize(width: 1280, height: 800)
        .commands {
            CommandGroup(replacing: .newItem) {}
        }
    }
}
