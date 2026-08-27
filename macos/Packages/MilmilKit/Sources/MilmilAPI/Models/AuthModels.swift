import Foundation

/// `GET /health` (public).
public struct Health: Decodable, Sendable, Equatable {
    public let status: String
    public let version: String

    public init(status: String, version: String) {
        self.status = status
        self.version = version
    }
}

/// `GET /api/v1/setup/status` (public) — drives setup-vs-login routing.
public struct SetupStatus: Decodable, Sendable, Equatable {
    public let hasAdmin: Bool
    public let libraryCount: Int

    enum CodingKeys: String, CodingKey {
        case hasAdmin = "has_admin"
        case libraryCount = "library_count"
    }

    public init(hasAdmin: Bool, libraryCount: Int) {
        self.hasAdmin = hasAdmin
        self.libraryCount = libraryCount
    }
}

/// `GET /api/v1/auth/status` (public).
public struct AuthStatus: Decodable, Sendable, Equatable {
    public let initialized: Bool
}

public struct User: Codable, Sendable, Hashable, Identifiable {
    public let id: String
    public let username: String
    /// Server-relative (`/api/v1/users/<id>/avatar?v=…`); nil when the user
    /// has not set one. Resolve with `APIClient.avatarURL(_:size:)`.
    public let avatarURL: String?

    enum CodingKeys: String, CodingKey {
        case id, username
        case avatarURL = "avatar_url"
    }

    public init(id: String, username: String, avatarURL: String? = nil) {
        self.id = id
        self.username = username
        self.avatarURL = avatarURL
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        username = try c.decode(String.self, forKey: .username)
        avatarURL = try c.decodeIfPresent(String.self, forKey: .avatarURL).nonEmpty
    }
}

/// `PUT /auth/me/avatar` answer.
public struct AvatarResponse: Decodable, Sendable, Equatable {
    public let avatarURL: String?

    enum CodingKeys: String, CodingKey {
        case avatarURL = "avatar_url"
    }
}

/// `PUT /auth/me/avatar` JSON form: copy an image the server can fetch
/// (a Bangumi character portrait) instead of uploading bytes.
public struct AvatarSourceRequest: Encodable, Sendable {
    public let sourceURL: String

    enum CodingKeys: String, CodingKey {
        case sourceURL = "source_url"
    }

    public init(sourceURL: String) {
        self.sourceURL = sourceURL
    }
}

/// A successful login: the opaque `mlml_…` token plus who it belongs to.
public struct LoginSession: Decodable, Sendable, Equatable {
    public let token: String
    public let user: User
}

/// `POST /api/v1/auth/login` either returns a session or asks for TOTP.
public enum LoginOutcome: Sendable, Equatable {
    case session(LoginSession)
    case twoFactorRequired(userID: String)
}

extension LoginOutcome: Decodable {
    private enum CodingKeys: String, CodingKey {
        case token, user
        case requires2FA = "requires_2fa"
        case userID = "user_id"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if try container.decodeIfPresent(Bool.self, forKey: .requires2FA) == true {
            self = .twoFactorRequired(userID: try container.decode(String.self, forKey: .userID))
        } else {
            self = .session(LoginSession(
                token: try container.decode(String.self, forKey: .token),
                user: try container.decode(User.self, forKey: .user)
            ))
        }
    }
}

struct LoginRequest: Encodable, Sendable {
    let username: String
    let password: String
    let deviceName: String?

    enum CodingKeys: String, CodingKey {
        case username, password
        case deviceName = "device_name"
    }
}

struct TwoFactorRequest: Encodable, Sendable {
    let userID: String
    let code: String
    let deviceName: String?

    enum CodingKeys: String, CodingKey {
        case code
        case userID = "user_id"
        case deviceName = "device_name"
    }
}

/// `GET /api/v1/api-tokens` — every device/session holding a token.
public struct APIToken: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let name: String
    public let tokenPrefix: String
    public let lastUsedAt: Date?
    public let lastIP: String
    public let lastUserAgent: String
    public let createdAt: Date
    public let isCurrent: Bool

    enum CodingKeys: String, CodingKey {
        case id, name
        case tokenPrefix = "token_prefix"
        case lastUsedAt = "last_used_at"
        case lastIP = "last_ip"
        case lastUserAgent = "last_user_agent"
        case createdAt = "created_at"
        case isCurrent = "is_current"
    }
}

/// `GET /api/v1/ws/ticket` — single-use, 60 s, redeemed on the upgrade URL.
public struct WebSocketTicket: Decodable, Sendable, Equatable {
    public let ticket: String
    public let expiresIn: Int

    enum CodingKeys: String, CodingKey {
        case ticket
        case expiresIn = "expires_in"
    }
}
