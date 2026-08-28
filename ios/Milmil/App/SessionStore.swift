import Foundation
import MilmilAPI
import Observation

enum SessionPhase: Equatable {
    case waiting
    case connecting(String)
    case ready(name: String, username: String, version: String)
    case failed(String)
}

/// Holds the paired server for the life of the app and across launches.
///
/// The token goes in the Keychain through `MilmilAPI`'s own store — the same
/// one the macOS client uses — so this file only remembers which server was
/// paired. Android needed a whole `EncryptedSharedPreferences` class for the
/// same job; on iOS the shared package already had it.
@Observable
@MainActor
final class SessionStore {
    private(set) var phase: SessionPhase = .waiting
    private(set) var client: APIClient?

    var username: String? { if case let .ready(_, username, _) = phase { username } else { nil } }
    var serverName: String? { if case let .ready(name, _, _) = phase { name } else { nil } }
    var version: String? { if case let .ready(_, _, version) = phase { version } else { nil } }

    private var pairedProfile: ServerProfile? {
        defaults.data(forKey: Self.profileKey).flatMap { try? JSONDecoder().decode(ServerProfile.self, from: $0) }
    }

    private let defaults: UserDefaults
    private let tokens: any TokenStore
    private static let profileKey = "pairedProfile"

    init(defaults: UserDefaults = .standard, tokens: any TokenStore = KeychainTokenStore()) {
        self.defaults = defaults
        self.tokens = tokens
    }

    /// A pairing already on this device, checked before offering the scanner.
    func restore() async {
        guard let data = defaults.data(forKey: Self.profileKey),
              let profile = try? JSONDecoder().decode(ServerProfile.self, from: data),
              let token = (try? tokens.token(for: profile.id)) ?? nil
        else { return }
        await connect(profile: profile, token: token, remember: false)
    }

    /// Forget this device's pairing. The token still exists server-side —
    /// only the Web tokens page can revoke it — so the wording has to say so
    /// rather than imply this signed anything out.
    func unpair() {
        if let profile = pairedProfile { try? tokens.setToken(nil, for: profile.id) }
        defaults.removeObject(forKey: Self.profileKey)
        client = nil
        phase = .waiting
    }

    func pair(_ request: PairRequest) async {
        let profile = ServerProfile(name: request.name, baseURL: request.url)
        await connect(profile: profile, token: request.token, remember: true)
    }

    private func connect(profile: ServerProfile, token: String, remember: Bool) async {
        phase = .connecting(profile.name)
        let client = APIClient(baseURL: profile.baseURL, token: token)
        self.client = client
        do {
            // A server that is off, or on a network this phone is no longer on,
            // otherwise leaves the app on a spinner with no way out.
            let (health, user) = try await withTimeout(seconds: 12) {
                try await (client.health(), client.me())
            }
            if remember {
                try? tokens.setToken(token, for: profile.id)
                defaults.set(try? JSONEncoder().encode(profile), forKey: Self.profileKey)
            }
            phase = .ready(name: profile.name, username: user.username, version: health.version)
        } catch APIError.unauthorized {
            // `mlml_` tokens never expire, so 401 means revoked — drop the
            // pairing or every later launch retries a dead one.
            try? tokens.setToken(nil, for: profile.id)
            defaults.removeObject(forKey: Self.profileKey)
            phase = .failed("配對碼已經失效，請喺 Web 版重新產生")
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }
}

/// Runs `work`, or throws `TimedOut` after `seconds`.
///
/// Neither URLSession's own timeout nor a cancelled task covers the case that
/// matters here: a server that accepts the connection and then never answers.
struct TimedOut: Error, LocalizedError {
    var errorDescription: String? { "連唔到伺服器，請確認佢開咗機同埋喺同一個網絡。" }
}

func withTimeout<Value: Sendable>(
    seconds: Double,
    _ work: @escaping @Sendable () async throws -> Value
) async throws -> Value {
    try await withThrowingTaskGroup(of: Value.self) { group in
        group.addTask { try await work() }
        group.addTask {
            try await Task.sleep(for: .seconds(seconds))
            throw TimedOut()
        }
        let result = try await group.next()!
        group.cancelAll()
        return result
    }
}
