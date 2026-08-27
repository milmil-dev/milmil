import Foundation

// Mirrors web/src/hooks/use-auth.ts and web/src/lib/api/setup.ts.
public extension APIClient {
    func health() async throws -> Health {
        try await get("/health")
    }

    func setupStatus() async throws -> SetupStatus {
        try await get("/api/v1/setup/status")
    }

    func authStatus() async throws -> AuthStatus {
        try await get("/api/v1/auth/status")
    }

    /// `device_name` is what shows up in the token list; pass
    /// `DeviceName.current()` so it reads "milmil for macOS — <hostname>".
    func login(username: String, password: String, deviceName: String?) async throws -> LoginOutcome {
        try await post("/api/v1/auth/login", body: LoginRequest(username: username, password: password, deviceName: deviceName))
    }

    func completeTwoFactor(userID: String, code: String, deviceName: String?) async throws -> LoginSession {
        try await post("/api/v1/auth/login/2fa", body: TwoFactorRequest(userID: userID, code: code, deviceName: deviceName))
    }

    func me() async throws -> User {
        try await get("/api/v1/auth/me")
    }

    // MARK: Avatar

    /// Upload an image (png / jpeg / webp, ≤ 2 MB after the client's downscale).
    func uploadAvatar(_ data: Data, filename: String, mimeType: String) async throws -> AvatarResponse {
        try await upload("/api/v1/auth/me/avatar", fileField: "file", data: data, filename: filename, mimeType: mimeType)
    }

    /// Have the server copy an image it can reach (a character portrait).
    func setAvatar(sourceURL: URL) async throws -> AvatarResponse {
        try await put("/api/v1/auth/me/avatar", body: AvatarSourceRequest(sourceURL: sourceURL.absoluteString))
    }

    func deleteAvatar() async throws {
        try await delete("/api/v1/auth/me/avatar")
    }

    /// `avatar_url` is server-relative; `size` picks the 128 / 512 variant.
    nonisolated func avatarURL(_ path: String?, size: Int? = nil) -> URL? {
        guard let path, !path.isEmpty, var components = URLComponents(string: path) else { return nil }
        if let size {
            var items = components.queryItems ?? []
            items.removeAll { $0.name == "size" }
            items.append(URLQueryItem(name: "size", value: String(size)))
            components.queryItems = items
        }
        return components.url(relativeTo: baseURL)?.absoluteURL
    }

    /// Deletes the current token row server-side. Clear the local copy after.
    func logout() async throws {
        try await post("/api/v1/auth/logout")
    }

    func apiTokens() async throws -> [APIToken] {
        try await get("/api/v1/api-tokens")
    }

    func revokeAPIToken(id: String) async throws {
        try await delete("/api/v1/api-tokens/\(id)")
    }

    func webSocketTicket() async throws -> WebSocketTicket {
        try await get("/api/v1/ws/ticket")
    }
}

public enum DeviceName {
    /// "milmil for macOS — Pie" (truncated server-side to 100 chars).
    public static func current() -> String {
        let host = Host.current().localizedName ?? ProcessInfo.processInfo.hostName
        return "milmil for macOS — \(host)"
    }
}
