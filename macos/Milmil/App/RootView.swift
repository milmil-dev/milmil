import SwiftUI

struct RootView: View {
    @Environment(SessionStore.self) private var session
    @Environment(TrailerCoordinator.self) private var trailers
    @Environment(\.openWindow) private var openWindow
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
        .task {
            if let url = DevSnapshot.trailerURL {
                trailers.play(url: url, title: url.host() ?? "trailer")
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
