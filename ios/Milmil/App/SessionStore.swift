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

    func pair(_ request: PairRequest) async {
        let profile = ServerProfile(name: request.name, baseURL: request.url)
        await connect(profile: profile, token: request.token, remember: true)
    }

    private func connect(profile: ServerProfile, token: String, remember: Bool) async {
        phase = .connecting(profile.name)
        let client = APIClient(baseURL: profile.baseURL, token: token)
        self.client = client
        do {
            let health = try await client.health()
            let user = try await client.me()
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
