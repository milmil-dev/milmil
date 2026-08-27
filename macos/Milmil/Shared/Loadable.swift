import Foundation

/// Async page state. `loaded` keeps its value while a refresh runs.
enum Loadable<Value: Sendable>: Sendable {
    case idle
    case loading
    case loaded(Value)
    case failed(String)

    var value: Value? {
        if case let .loaded(value) = self { return value }
        return nil
    }

    var isLoading: Bool {
        if case .loading = self { return true }
        return false
    }

    var errorMessage: String? {
        if case let .failed(message) = self { return message }
        return nil
    }
}

extension Loadable {
    /// The state to show while `work` runs: keep a loaded value, else spin.
    var reloading: Loadable<Value> {
        value == nil ? .loading : self
    }

    /// Runs `work` and returns the resulting state. Usage:
    /// `items = items.reloading; items = await items.reloaded { … }`.
    func reloaded(_ work: () async throws -> Value) async -> Loadable<Value> {
        do {
            return .loaded(try await work())
        } catch is CancellationError {
            // A superseded `.task(id:)` cancels the fetch in flight; that is
            // not a failure, and turning it into one blanked rows (the Home
            // page's 繼續觀看 flickered on every realtime event).
            return self
        } catch {
            if Task.isCancelled { return self }
            return .failed(error.localizedDescription)
        }
    }
}
