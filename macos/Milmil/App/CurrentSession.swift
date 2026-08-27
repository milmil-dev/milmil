import Observation

/// The logged-in session, for AppKit entry points that have no SwiftUI
/// environment (the Dock menu, App Intents, Spotlight continuation).
/// `MainShellView` registers it when the shell starts and clears it on
/// sign-out; everything inside the view tree keeps using the environment.
@Observable
@MainActor
final class CurrentSession {
    static let shared = CurrentSession()
    var session: ServerSession?
}
