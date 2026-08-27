import Foundation

/// `GET /settings` — every section keyed by name. Sections are free-form
/// JSON; the ones the app edits have typed accessors below. Secrets come
/// back as stored (the server does not mask them), so never log this.
public struct ServerSettings: Decodable, Sendable {
    public let sections: [String: [String: JSONValue]]

    public init(from decoder: any Decoder) throws {
        let raw = try decoder.singleValueContainer().decode([String: JSONValue].self)
        sections = raw.compactMapValues { value in
            if case let .object(dict) = value { return dict }
            return nil
        }
    }

    public func string(_ section: String, _ key: String) -> String {
        if case let .string(s) = sections[section]?[key] { return s }
        return ""
    }

    public func bool(_ section: String, _ key: String) -> Bool? {
        if case let .bool(b) = sections[section]?[key] { return b }
        return nil
    }

    /// Web locale code (`zh-TW`, `en`, …) shared with the web's General panel;
    /// empty when never set.
    public var appearanceLanguage: String { string("appearance", "language") }

    public var autoAddToCollection: Bool { bool("collection", "auto_add_to_collection") ?? true }

    public var dandanplay: DandanPlayCredentials {
        DandanPlayCredentials(appID: string("dandanplay", "app_id"), appSecret: string("dandanplay", "app_secret"))
    }

    public var tmdb: TMDBCredentials {
        TMDBCredentials(apiKey: string("tmdb_api_key", "api_key"), accessToken: string("tmdb_api_key", "access_token"))
    }

    public func oauth(_ provider: String) -> OAuthCredentials {
        OAuthCredentials(clientID: string("\(provider)_oauth", "client_id"), clientSecret: string("\(provider)_oauth", "client_secret"))
    }

    /// The web treats a stored `access_token` as "connected" for AniList / Bangumi.
    public func hasToken(_ provider: String) -> Bool {
        !string("\(provider)_token", "access_token").isEmpty
    }
}

public struct DandanPlayCredentials: Codable, Sendable, Equatable {
    public var appID: String
    public var appSecret: String

    public init(appID: String, appSecret: String) {
        self.appID = appID
        self.appSecret = appSecret
    }

    enum CodingKeys: String, CodingKey {
        case appID = "app_id"
        case appSecret = "app_secret"
    }
}

public struct TMDBCredentials: Codable, Sendable, Equatable {
    public var apiKey: String
    public var accessToken: String

    public init(apiKey: String, accessToken: String) {
        self.apiKey = apiKey
        self.accessToken = accessToken
    }

    enum CodingKeys: String, CodingKey {
        case apiKey = "api_key"
        case accessToken = "access_token"
    }
}

public struct OAuthCredentials: Codable, Sendable, Equatable {
    public var clientID: String
    public var clientSecret: String

    public init(clientID: String, clientSecret: String) {
        self.clientID = clientID
        self.clientSecret = clientSecret
    }

    enum CodingKeys: String, CodingKey {
        case clientID = "client_id"
        case clientSecret = "client_secret"
    }
}

// MARK: Sync / integrations

public struct SyncProviderStatus: Decodable, Sendable, Identifiable, Hashable {
    public let provider: String
    public let connected: Bool
    public let lastSync: String
    public let pending: Int
    public let lastErrors: [SyncError]

    public var id: String { provider }

    public struct SyncError: Decodable, Sendable, Hashable {
        public let animeID: String
        public let error: String
        public let at: String

        enum CodingKeys: String, CodingKey {
            case error, at
            case animeID = "anime_id"
        }
    }

    enum CodingKeys: String, CodingKey {
        case provider, connected, pending
        case lastSync = "last_sync"
        case lastErrors = "last_errors"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        provider = try c.decode(String.self, forKey: .provider)
        connected = try c.decodeIfPresent(Bool.self, forKey: .connected) ?? false
        lastSync = try c.decodeIfPresent(String.self, forKey: .lastSync) ?? ""
        pending = try c.decodeIfPresent(Int.self, forKey: .pending) ?? 0
        lastErrors = try c.decodeIfPresent([SyncError].self, forKey: .lastErrors) ?? []
    }
}

public struct PullResult: Decodable, Sendable {
    public let provider: String
    public let checked: Int
    public let updatedLocal: Int
    public let skipped: Int
    public let errors: [String]

    enum CodingKeys: String, CodingKey {
        case provider, checked, skipped, errors
        case updatedLocal = "updated_local"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        provider = try c.decodeIfPresent(String.self, forKey: .provider) ?? ""
        checked = try c.decodeIfPresent(Int.self, forKey: .checked) ?? 0
        updatedLocal = try c.decodeIfPresent(Int.self, forKey: .updatedLocal) ?? 0
        skipped = try c.decodeIfPresent(Int.self, forKey: .skipped) ?? 0
        errors = try c.decodeIfPresent([String].self, forKey: .errors) ?? []
    }
}

public struct TraktDeviceCode: Decodable, Sendable {
    public let userCode: String
    public let verificationURL: String
    public let expiresIn: Int
    public let pollInterval: Int

    enum CodingKeys: String, CodingKey {
        case userCode = "user_code"
        case verificationURL = "verification_url"
        case expiresIn = "expires_in"
        case pollInterval = "poll_interval"
    }
}

// MARK: Notification settings

public struct NotificationSettings: Codable, Sendable, Equatable {
    public var providers: Providers
    /// event id → providers that receive it.
    public var events: [String: [String]]
    public var bot: Bots

    public struct Providers: Codable, Sendable, Equatable {
        public var discord: DiscordWebhookConfig
        public var telegram: TelegramNotifyConfig
        public var webhook: WebhookNotifyConfig
    }

    public struct Bots: Codable, Sendable, Equatable {
        public var telegram: TelegramBotConfig
        public var discord: DiscordBotConfig
    }

    enum CodingKeys: String, CodingKey { case providers, events, bot }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        providers = try c.decode(Providers.self, forKey: .providers)
        events = try c.decodeIfPresent([String: [String]].self, forKey: .events) ?? [:]
        bot = try c.decode(Bots.self, forKey: .bot)
    }

    public static let eventIDs = [
        "download.started", "download.completed", "download.failed", "library.scan_complete",
        "system.error", "auth.login", "anime.airing", "anime.daily_digest", "anime.episode_ready", "system.service_failed"
    ]
    public static let providerNames = ["discord", "telegram", "webhook"]
}

public struct DiscordWebhookConfig: Codable, Sendable, Equatable {
    public var enabled: Bool
    public var webhookURL: String
    enum CodingKeys: String, CodingKey {
        case enabled
        case webhookURL = "webhook_url"
    }
}

public struct TelegramNotifyConfig: Codable, Sendable, Equatable {
    public var enabled: Bool
    public var botToken: String
    public var chatID: String
    enum CodingKeys: String, CodingKey {
        case enabled
        case botToken = "bot_token"
        case chatID = "chat_id"
    }
}

public struct WebhookNotifyConfig: Codable, Sendable, Equatable {
    public var enabled: Bool
    public var url: String
    public var secret: String
}

public struct TelegramBotConfig: Codable, Sendable, Equatable {
    public var enabled: Bool
    public var botToken: String
    public var webhookURL: String
    public var allowedChatIDs: [Int]
    public var reportInterval: String
    public var language: String
    public var airingReminderMinutes: Int
    public var dailyDigestTime: String

    enum CodingKeys: String, CodingKey {
        case enabled, language
        case botToken = "bot_token"
        case webhookURL = "webhook_url"
        case allowedChatIDs = "allowed_chat_ids"
        case reportInterval = "report_interval"
        case airingReminderMinutes = "airing_reminder_minutes"
        case dailyDigestTime = "daily_digest_time"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        enabled = try c.decodeIfPresent(Bool.self, forKey: .enabled) ?? false
        botToken = try c.decodeIfPresent(String.self, forKey: .botToken) ?? ""
        webhookURL = try c.decodeIfPresent(String.self, forKey: .webhookURL) ?? ""
        allowedChatIDs = try c.decodeIfPresent([Int].self, forKey: .allowedChatIDs) ?? []
        reportInterval = try c.decodeIfPresent(String.self, forKey: .reportInterval) ?? ""
        language = try c.decodeIfPresent(String.self, forKey: .language) ?? ""
        airingReminderMinutes = try c.decodeIfPresent(Int.self, forKey: .airingReminderMinutes) ?? 0
        dailyDigestTime = try c.decodeIfPresent(String.self, forKey: .dailyDigestTime) ?? ""
    }
}

public struct DiscordBotConfig: Codable, Sendable, Equatable {
    public var enabled: Bool
    public var botToken: String
    public var applicationID: String
    public var allowedGuildIDs: [String]

    enum CodingKeys: String, CodingKey {
        case enabled
        case botToken = "bot_token"
        case applicationID = "application_id"
        case allowedGuildIDs = "allowed_guild_ids"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        enabled = try c.decodeIfPresent(Bool.self, forKey: .enabled) ?? false
        botToken = try c.decodeIfPresent(String.self, forKey: .botToken) ?? ""
        applicationID = try c.decodeIfPresent(String.self, forKey: .applicationID) ?? ""
        allowedGuildIDs = try c.decodeIfPresent([String].self, forKey: .allowedGuildIDs) ?? []
    }
}

public struct NotificationProviderStatus: Decodable, Sendable, Equatable {
    /// `ok` | `error` | `unconfigured` | `disabled`
    public let status: String
    public let lastSentAt: String?
    public let lastError: String?

    enum CodingKeys: String, CodingKey {
        case status
        case lastSentAt = "last_sent_at"
        case lastError = "last_error"
    }
}

public struct TestResult: Decodable, Sendable {
    public let success: Bool
    public let error: String?
    public let botUsername: String?

    enum CodingKeys: String, CodingKey {
        case success, ok, error
        case botUsername = "bot_username"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        success = try c.decodeIfPresent(Bool.self, forKey: .success) ?? c.decodeIfPresent(Bool.self, forKey: .ok) ?? false
        error = try c.decodeIfPresent(String.self, forKey: .error)
        botUsername = try c.decodeIfPresent(String.self, forKey: .botUsername)
    }
}

// MARK: Account

public struct TwoFactorSetup: Decodable, Sendable {
    public let secret: String
    /// Data URL (`data:image/png;base64,…`) of the QR code.
    public let qrCode: String
    public let url: String

    enum CodingKeys: String, CodingKey {
        case secret, url
        case qrCode = "qr_code"
    }
}
