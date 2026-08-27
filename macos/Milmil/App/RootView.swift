import SwiftUI

struct RootView: View {
    @Environment(SessionStore.self) private var session
    @Environment(TrailerCoordinator.self) private var trailers
    @Environment(PlayerCoordinator.self) private var player
    @Environment(\.pendingOpenURLs) private var pendingOpenURLs
    @Environment(\.openWindow) private var openWindow
    @State private var cheatSheet = ShortcutCheatSheet.shared
    @AppStorage(DesktopDefaults.theme) private var theme = Theme.Preference.dark.rawValue
    @ObserveInjection private var inject

    var body: some View {
        Group {
            switch session.phase {
            case .launching:
                // One quiet frame while the stored session is restored;
                // showing any onboarding screen here reads as a login flash.
                Color.clear
            case .noServer:
                ServerPickerView()
            case let .connecting(profile):
                OnboardingCard(title: profile.name, subtitle: profile.baseURL.absoluteString) {
                    ProgressView("連線中…")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                }
            case let .connectionFailed(profile, message):
                ConnectionErrorView(profile: profile, message: message)
            case let .needsSetup(profile):
                SetupRedirectView(profile: profile)
            case .login:
                LoginView()
            case .twoFactor:
                TwoFactorView()
            case let .ready(profile, user, version):
                MainShellView(profile: profile, user: user, version: version)
            }
        }
        .background(Theme.background)
        .preferredColorScheme((Theme.Preference(rawValue: theme) ?? .dark).colorScheme)
        .animation(.snappy(duration: 0.25), value: phaseKey)
        .sheet(isPresented: Binding(get: { trailers.showOpenURL }, set: { trailers.showOpenURL = $0 })) {
            OpenURLSheet()
        }
        // Hold ⌘: the shortcut sheet. Player rows join while something plays.
        .overlay {
            if cheatSheet.shown {
                ShortcutCheatSheetView(playerActive: player.controller?.episode != nil)
            }
        }
        .animation(.easeOut(duration: 0.2), value: cheatSheet.shown)
        // A magnet / .torrent link dropped anywhere becomes a download and
        // lands you on 下載 (the Downloads page's own drop zone wins there).
        .onDrop(of: [.url, .plainText, .utf8PlainText], isTargeted: nil) { providers in
            DroppedDownloadLinks.handle(providers) { links in
                guard let client = session.client, !links.isEmpty else { return }
                Task {
                    for link in links { _ = try? await client.addDownload(url: link) }
                    if let url = URL(string: "milmil://downloads") { pendingOpenURLs.links.wrappedValue.append(url) }
                }
            }
        }
        .task {
            ShortcutCheatSheet.shared.install()
            QuickLookController.shared.install()
            if let url = DevSnapshot.trailerURL {
                trailers.play(url: url, title: url.host() ?? "trailer", caption: url.absoluteString)
                openWindow(id: "trailer")
            }
        }
    }

    /// Animate only between screens, not on every profile mutation.
    private var phaseKey: Int {
        switch session.phase {
        case .launching: -1
        case .noServer: 0
        case .connecting: 1
        case .connectionFailed: 2
        case .needsSetup: 3
        case .login: 4
        case .twoFactor: 5
        case .ready: 6
        }
    }
}

#if DEBUG
#Preview("Root · connecting") {
    PreviewHost(phase: .connecting(Preview.profile)) { RootView() }
}
#endif

/// Pulls magnet: and *.torrent links out of dropped text / URLs; anything
/// else is left to whoever else wants the drop.
enum DroppedDownloadLinks {
    static func links(in text: String) -> [String] {
        text.split(whereSeparator: \.isWhitespace)
            .map(String.init)
            .filter { $0.hasPrefix("magnet:") || ($0.hasPrefix("http") && $0.lowercased().hasSuffix(".torrent")) }
    }

    /// Returns true when a provider carried something we take.
    @discardableResult
    static func handle(_ providers: [NSItemProvider], completion: @escaping @MainActor ([String]) -> Void) -> Bool {
        var claimed = false
        for provider in providers {
            if provider.canLoadObject(ofClass: NSURL.self) {
                claimed = true
                _ = provider.loadObject(ofClass: NSURL.self) { object, _ in
                    guard let url = object as? URL else { return }
                    let found = links(in: url.absoluteString)
                    Task { @MainActor in completion(found) }
                }
            } else if provider.canLoadObject(ofClass: NSString.self) {
                claimed = true
                _ = provider.loadObject(ofClass: NSString.self) { object, _ in
                    guard let text = object as? String else { return }
                    let found = links(in: text)
                    Task { @MainActor in completion(found) }
                }
            }
        }
        return claimed
    }
}
