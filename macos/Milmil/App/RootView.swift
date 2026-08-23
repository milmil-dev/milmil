import SwiftUI

struct RootView: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        Group {
            switch session.phase {
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
        .preferredColorScheme(.dark)
        .animation(.snappy(duration: 0.25), value: phaseKey)
    }

    /// Animate only between screens, not on every profile mutation.
    private var phaseKey: Int {
        switch session.phase {
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
