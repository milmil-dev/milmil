import Foundation
import MilmilAPI
import Observation

/// Which screen the window shows. One server is "current" at a time; the
/// token for it is read from the `TokenStore` on connect.
enum SessionPhase: Equatable {
    case noServer
    case connecting(ServerProfile)
    case connectionFailed(ServerProfile, message: String)
    case needsSetup(ServerProfile)
    case login(ServerProfile, version: String)
    case twoFactor(ServerProfile, userID: String)
    case ready(ServerProfile, user: User, version: String)

    var profile: ServerProfile? {
        switch self {
        case .noServer: nil
        case let .connecting(p), let .connectionFailed(p, _), let .needsSetup(p), let .login(p, _), let .twoFactor(p, _), let .ready(p, _, _): p
        }
    }
}

@Observable
final class SessionStore {
    private(set) var profiles: [ServerProfile] = []
    private(set) var phase: SessionPhase = .noServer
    private(set) var client: APIClient?
    /// Covers for the onboarding poster wall; loaded once per connect.
    private(set) var trendingCovers: [URL] = []

    private let tokenStore: any TokenStore
    private let defaults: UserDefaults
    private let makeClient: (URL, String?) -> APIClient

    private static let profilesKey = "servers"
    private static let currentKey = "currentServerID"

    init(
        tokenStore: any TokenStore,
        defaults: UserDefaults,
        makeClient: @escaping (URL, String?) -> APIClient = { APIClient(baseURL: $0, token: $1) }
    ) {
        self.tokenStore = tokenStore
        self.defaults = defaults
        self.makeClient = makeClient
    }

    // MARK: - Lifecycle

    func bootstrap() async {
        profiles = loadProfiles()
        guard let id = defaults.string(forKey: Self.currentKey).flatMap(UUID.init(uuidString:)),
              let profile = profiles.first(where: { $0.id == id }) else {
            phase = .noServer
            return
        }
        await connect(profile)
    }

    /// Adds (or updates) a server and connects to it.
    func addServer(name: String, url: URL) async {
        var profile = ServerProfile(name: name, baseURL: url)
        if let existing = profiles.first(where: { $0.baseURL == profile.baseURL }) {
            profile = existing
        } else {
            profiles.append(profile)
            persistProfiles()
        }
        await connect(profile)
    }

    func removeServer(_ profile: ServerProfile) {
        profiles.removeAll { $0.id == profile.id }
        try? tokenStore.setToken(nil, for: profile.id)
        persistProfiles()
        if phase.profile?.id == profile.id {
            phase = .noServer
            client = nil
            defaults.removeObject(forKey: Self.currentKey)
        }
    }

    func connect(_ profile: ServerProfile) async {
        phase = .connecting(profile)
        defaults.set(profile.id.uuidString, forKey: Self.currentKey)
        let token = (try? tokenStore.token(for: profile.id)) ?? nil
        let client = makeClient(profile.baseURL, token)
        self.client = client

        do {
            let health = try await client.health()
            var updated = profile
            updated.lastKnownVersion = health.version
            update(updated)
            loadTrendingCovers(from: client)

            if token != nil {
                do {
                    let user = try await client.me()
                    phase = .ready(updated, user: user, version: health.version)
                    return
                } catch APIError.unauthorized {
                    try? tokenStore.setToken(nil, for: profile.id)
                    await client.setToken(nil)
                }
            }

            let setup = try await client.setupStatus()
            phase = setup.hasAdmin ? .login(updated, version: health.version) : .needsSetup(updated)
        } catch {
            phase = .connectionFailed(profile, message: error.localizedDescription)
        }
    }

    func retry() async {
        guard let profile = phase.profile else { return }
        await connect(profile)
    }

    func switchToNoServer() {
        phase = .noServer
        client = nil
        defaults.removeObject(forKey: Self.currentKey)
    }

    // MARK: - Auth

    func login(username: String, password: String) async throws {
        guard let client, case let .login(profile, version) = phase else { return }
        let outcome = try await client.login(username: username, password: password, deviceName: DeviceName.current())
        switch outcome {
        case let .session(session):
            try await install(session, for: profile, version: version)
        case let .twoFactorRequired(userID):
            phase = .twoFactor(profile, userID: userID)
        }
    }

    func completeTwoFactor(code: String) async throws {
        guard let client, case let .twoFactor(profile, userID) = phase else { return }
        let session = try await client.completeTwoFactor(userID: userID, code: code, deviceName: DeviceName.current())
        try await install(session, for: profile, version: profile.lastKnownVersion ?? "")
    }

    func cancelTwoFactor() {
        guard case let .twoFactor(profile, _) = phase else { return }
        phase = .login(profile, version: profile.lastKnownVersion ?? "")
    }

    func logout() async {
        guard let client, let profile = phase.profile else { return }
        try? await client.logout()
        await client.setToken(nil)
        try? tokenStore.setToken(nil, for: profile.id)
        phase = .login(profile, version: profile.lastKnownVersion ?? "")
    }

    private func install(_ session: LoginSession, for profile: ServerProfile, version: String) async throws {
        try tokenStore.setToken(session.token, for: profile.id)
        await client?.setToken(session.token)
        var updated = profile
        updated.userID = session.user.id
        updated.username = session.user.username
        update(updated)
        phase = .ready(updated, user: session.user, version: version)
    }

    /// Best-effort and public, so it never gates the login flow.
    private func loadTrendingCovers(from client: APIClient) {
        guard trendingCovers.isEmpty else { return }
        Task {
            guard let items = try? await client.trending(page: 1) else { return }
            let covers = items.compactMap(\.coverImage)
            guard !covers.isEmpty, self.client === client else { return }
            trendingCovers = covers
        }
    }

    // MARK: - Previews

    #if DEBUG
    /// Puts the store straight into a phase without touching the network or
    /// the Keychain. Only for `#Preview` and UI tests.
    func applyPreview(phase: SessionPhase, covers: [URL] = [], profiles: [ServerProfile] = []) {
        self.profiles = profiles.isEmpty ? [phase.profile].compactMap { $0 } : profiles
        self.phase = phase
        trendingCovers = covers
        if let profile = phase.profile {
            client = makeClient(profile.baseURL, nil)
        }
    }
    #endif

    // MARK: - Persistence

    private func update(_ profile: ServerProfile) {
        if let index = profiles.firstIndex(where: { $0.id == profile.id }) {
            profiles[index] = profile
        } else {
            profiles.append(profile)
        }
        persistProfiles()
    }

    private func loadProfiles() -> [ServerProfile] {
        guard let data = defaults.data(forKey: Self.profilesKey) else { return [] }
        return (try? JSONDecoder().decode([ServerProfile].self, from: data)) ?? []
    }

    private func persistProfiles() {
        if let data = try? JSONEncoder().encode(profiles) {
            defaults.set(data, forKey: Self.profilesKey)
        }
    }
}
