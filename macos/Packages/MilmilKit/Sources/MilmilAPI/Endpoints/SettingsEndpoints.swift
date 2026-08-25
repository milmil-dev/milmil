import Foundation

public extension APIClient {
    // MARK: Server settings sections

    func serverSettings() async throws -> ServerSettings {
        try await get("/api/v1/settings")
    }

    /// Replaces the whole `appearance` section, so merge the existing keys in
    /// before calling (the web's General panel does the same).
    func saveAppearance(_ section: [String: JSONValue]) async throws {
        try await put("/api/v1/settings/appearance", body: section)
    }

    func saveCollection(autoAddToCollection: Bool) async throws {
        struct Body: Encodable {
            let autoAddToCollection: Bool
            enum CodingKeys: String, CodingKey {
                case autoAddToCollection = "auto_add_to_collection"
            }
        }
        try await put("/api/v1/settings/collection", body: Body(autoAddToCollection: autoAddToCollection))
    }

    func saveDandanPlay(_ credentials: DandanPlayCredentials) async throws {
        try await put("/api/v1/settings/dandanplay", body: credentials)
    }

    func saveTMDB(_ credentials: TMDBCredentials) async throws {
        try await put("/api/v1/settings/tmdb_api_key", body: credentials)
    }

    func testTMDB(_ credentials: TMDBCredentials) async throws -> TestResult {
        try await post("/api/v1/integrations/tmdb/test", body: credentials)
    }

    /// `anilist` / `bangumi` OAuth app credentials.
    func saveOAuth(provider: String, _ credentials: OAuthCredentials) async throws {
        try await put("/api/v1/settings/\(provider)_oauth", body: credentials)
    }

    // MARK: Sync providers

    func syncStatus() async throws -> [SyncProviderStatus] {
        let rows: [SyncProviderStatus]? = try await get("/api/v1/sync/status")
        return rows ?? []
    }

    /// The browser URL that starts the provider's OAuth dance; the server
    /// handles the callback itself.
    func integrationAuthURL(provider: String) async throws -> URL {
        struct Envelope: Decodable { let url: String }
        let envelope: Envelope = try await get("/api/v1/integrations/\(provider)/auth-url")
        guard let url = URL(string: envelope.url) else { throw APIError.invalidURL(envelope.url) }
        return url
    }

    func disconnectIntegration(provider: String) async throws {
        try await delete("/api/v1/integrations/\(provider)")
    }

    /// Push queued local changes to the provider now.
    func flushSync(provider: String) async throws -> Int {
        struct Envelope: Decodable { let enqueued: Int? }
        let envelope: Envelope = try await post("/api/v1/integrations/\(provider)/sync")
        return envelope.enqueued ?? 0
    }

    func pullSync(provider: String) async throws -> PullResult {
        try await post("/api/v1/sync/\(provider)/pull", body: EmptyBody())
    }

    func setPullEnabled(provider: String, _ enabled: Bool) async throws {
        struct Body: Encodable { let enabled: Bool }
        try await post("/api/v1/sync/\(provider)/pull-enabled", body: Body(enabled: enabled))
    }

    func traktDeviceCode() async throws -> TraktDeviceCode {
        try await post("/api/v1/integrations/trakt/device-code", body: EmptyBody())
    }

    /// `pending` | `approved` | `expired` | `denied`
    func traktPoll() async throws -> String {
        struct Envelope: Decodable { let status: String }
        let envelope: Envelope = try await post("/api/v1/integrations/trakt/poll", body: EmptyBody())
        return envelope.status
    }

    // MARK: Notifications

    func notificationSettings() async throws -> NotificationSettings {
        try await get("/api/v1/settings/notifications")
    }

    func saveNotificationSettings(_ settings: NotificationSettings) async throws {
        try await put("/api/v1/settings/notifications", body: settings)
    }

    func notificationProviderStatus() async throws -> [String: NotificationProviderStatus] {
        let rows: [String: NotificationProviderStatus]? = try await get("/api/v1/settings/notifications/status")
        return rows ?? [:]
    }

    func testNotificationProvider(_ provider: String) async throws -> TestResult {
        struct Body: Encodable { let provider: String }
        return try await post("/api/v1/settings/notifications/test", body: Body(provider: provider))
    }

    func testBot(platform: String) async throws -> TestResult {
        struct Body: Encodable { let platform: String }
        return try await post("/api/v1/settings/notifications/test-bot", body: Body(platform: platform))
    }

    // MARK: Account

    func changePassword(current: String, new: String) async throws {
        struct Body: Encodable {
            let currentPassword: String
            let newPassword: String
            enum CodingKeys: String, CodingKey {
                case currentPassword = "current_password"
                case newPassword = "new_password"
            }
        }
        try await put("/api/v1/auth/password", body: Body(currentPassword: current, newPassword: new))
    }

    func twoFactorEnabled() async throws -> Bool {
        struct Envelope: Decodable { let enabled: Bool? }
        let envelope: Envelope = try await get("/api/v1/auth/2fa/status")
        return envelope.enabled ?? false
    }

    func twoFactorSetup() async throws -> TwoFactorSetup {
        try await post("/api/v1/auth/2fa/setup", body: EmptyBody())
    }

    func twoFactorVerify(code: String) async throws {
        struct Body: Encodable { let code: String }
        try await post("/api/v1/auth/2fa/verify", body: Body(code: code))
    }

    func twoFactorDisable() async throws {
        try await delete("/api/v1/auth/2fa")
    }
}
