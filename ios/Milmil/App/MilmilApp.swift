import SwiftUI

@main
struct MilmilApp: App {
    @State private var session = SessionStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .preferredColorScheme(.dark)
                .task {
                    #if DEBUG
                    // Debug-only pairing hook, the iOS twin of the macOS
                    // client's MILMIL_SNAPSHOT_* env hooks. iOS 26 puts a
                    // system "Open in …?" prompt in front of `simctl openurl`,
                    // which a headless run cannot answer, so verification
                    // needs a way in that does not go through SpringBoard.
                    if let raw = ProcessInfo.processInfo.environment["MILMIL_PAIR_LINK"],
                       let link = URL(string: raw), let request = PairRequest(link: link) {
                        await session.pair(request)
                        return
                    }
                    #endif
                    await session.restore()
                }
                .onOpenURL { url in
                    guard let request = PairRequest(link: url) else { return }
                    Task { await session.pair(request) }
                }
        }
    }
}

struct RootView: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        switch session.phase {
        case .ready:
            if let client = session.client { Shell(client: client) }
        default:
            PairView()
        }
    }
}
