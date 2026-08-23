import SwiftUI

// Hot reload via InjectionIII / InjectionNext (https://github.com/johnno1962).
//
// Debug only. The app loads the injection bundle at launch; when the
// InjectionIII app recompiles a saved file and swaps it in, it posts
// INJECTION_BUNDLE_NOTIFICATION and every view holding `@ObserveInjection`
// re-evaluates `body` with the new code — state, navigation and the live
// server session stay put. Release builds compile all of this away.
//
// Setup: `brew install --cask injectioniii`, launch it, run the app from
// Xcode (⌘R — it reads Xcode's build logs), then just save files.

#if DEBUG
import Combine

@MainActor
final class InjectionObserver: ObservableObject {
    static let shared = InjectionObserver()

    @Published private(set) var generation = 0
    private var subscription: AnyCancellable?

    private init() {
        Self.loadBundle()
        subscription = NotificationCenter.default
            .publisher(for: Notification.Name("INJECTION_BUNDLE_NOTIFICATION"))
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.generation += 1 }
    }

    private static func loadBundle() {
        let candidates = [
            "/Applications/InjectionNext.app/Contents/Resources/macOSInjection.bundle",
            "/Applications/InjectionIII.app/Contents/Resources/macOSInjection.bundle",
        ]
        for path in candidates where FileManager.default.fileExists(atPath: path) {
            if Bundle(path: path)?.load() == true {
                print("💉 hot reload: loaded \(path)")
                return
            }
        }
        print("💉 hot reload: InjectionIII not found (brew install --cask injectioniii); running without it")
    }
}

/// Add `@ObserveInjection private var inject` to a view to have it re-render
/// after injection. Reading it is not required; installing it is.
@propertyWrapper
struct ObserveInjection: DynamicProperty {
    @ObservedObject private var observer = InjectionObserver.shared

    var wrappedValue: Int { observer.generation }
}
#else
@propertyWrapper
struct ObserveInjection: DynamicProperty {
    var wrappedValue: Int { 0 }
}
#endif
