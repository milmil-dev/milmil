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
