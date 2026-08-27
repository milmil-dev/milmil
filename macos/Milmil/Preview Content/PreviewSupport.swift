#if DEBUG
import MilmilAPI
import SwiftUI

/// Fixtures for `#Preview`. Open any view file in Xcode and press ⌥⌘↩ —
/// the canvas re-renders as you type, no rebuild or relaunch needed.
enum Preview {
    static let profile = ServerProfile(
        id: UUID(uuidString: "00000000-0000-0000-0000-000000000001")!,
        name: "home-server",
        baseURL: URL(string: "http://192.168.50.178:8080")!,
        userID: "usr_preview",
        username: "admin",
        lastKnownVersion: "0.1.17"
    )

    static let secondProfile = ServerProfile(
        id: UUID(uuidString: "00000000-0000-0000-0000-000000000002")!,
        name: "seedbox",
        baseURL: URL(string: "https://seed.example.net:8443")!,
        lastKnownVersion: "0.1.15"
    )

    static let user = User(id: "usr_preview", username: "admin")

    /// Real AniList CDN covers so the poster wall previews with images
    /// (the canvas has network access); gradients show if offline.
    static let covers: [URL] = [
        "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx185874-aU3e6tBT6wwA.jpg",
        "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-gHSraOSa0nBG.jpg",
        "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx153518-8aAUMWGSGMxK.jpg",
        "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-YCDoj1EkAxFn.jpg",
        "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx16498-73IhOXpJZiMF.jpg",
        "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx127230-FlochcFsyoF4.jpg",
    ].compactMap(URL.init(string:))

    /// A store frozen in `phase`, wired to a client that never hits the network
    /// (every request fails fast), so previews stay deterministic.
    @MainActor
    static func session(_ phase: SessionPhase, covers: [URL] = Preview.covers, profiles: [ServerProfile] = []) -> SessionStore {
        let store = SessionStore(
            tokenStore: InMemoryTokenStore(),
            defaults: UserDefaults(suiteName: "dev.milmil.macos.preview")!,
            makeClient: { url, token in APIClient(baseURL: url, token: token, transport: OfflineTransport()) }
        )
        store.applyPreview(phase: phase, covers: covers, profiles: profiles)
        return store
    }
}

struct OfflineTransport: HTTPTransport {
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        throw APIError.transport("preview: no network")
    }
}

/// Wraps a view in the environment every screen expects.
struct PreviewHost<Content: View>: View {
    let phase: SessionPhase
    var covers: [URL] = Preview.covers
    var profiles: [ServerProfile] = []
    /// Override to check another localization's text lengths in the canvas.
    /// `Text`/`Label` literals re-resolve; strings built with
    /// `String(localized:)` keep the app language — use the scheme's App
    /// Language for a full-app pass.
    var locale: Locale?
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .environment(Preview.session(phase, covers: covers, profiles: profiles))
            .environment(\.locale, locale ?? .autoupdatingCurrent)
            .frame(width: 1280, height: 800)
            .background(Theme.background)
            .preferredColorScheme(.dark)
    }
}
#endif
