import Foundation
import Testing
@testable import MilmilAPI

@Suite("APIClient")
struct APIClientTests {
    let base = URL(string: "https://milmil.home.arpa")!

    @Test("login sends device_name and returns a session")
    func loginReturnsSession() async throws {
        let transport = FakeTransport()
        transport.stub("POST /api/v1/auth/login", json: try Fixtures.string("login_ok"))
        let client = APIClient(baseURL: base, transport: transport)

        let outcome = try await client.login(username: "admin", password: "hunter22", deviceName: "milmil for macOS — Pie")

        guard case let .session(session) = outcome else {
            Issue.record("expected a session, got \(outcome)")
            return
        }
        #expect(session.token.hasPrefix("mlml_"))
        #expect(session.user == User(id: "usr_01J8ZPXZ8Q9R0S1T2U3V4W5X6Y", username: "admin"))

        let request = try #require(transport.requests.first)
        #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
        #expect(request.value(forHTTPHeaderField: "Authorization") == nil)
        let body = try JSONSerialization.jsonObject(with: try #require(request.httpBody)) as? [String: Any]
        #expect(body?["device_name"] as? String == "milmil for macOS — Pie")
        #expect(body?["username"] as? String == "admin")
    }

    @Test("login surfaces the 2FA challenge")
    func loginRequiresTwoFactor() async throws {
        let transport = FakeTransport()
        transport.stub("POST /api/v1/auth/login", json: try Fixtures.string("login_2fa"))
        let client = APIClient(baseURL: base, transport: transport)

        let outcome = try await client.login(username: "admin", password: "x", deviceName: nil)

        #expect(outcome == .twoFactorRequired(userID: "usr_01J8ZPXZ8Q9R0S1T2U3V4W5X6Y"))
    }

    @Test("bearer token is attached once set")
    func bearerHeader() async throws {
        let transport = FakeTransport()
        transport.stub("GET /api/v1/auth/me", json: #"{"id":"u1","username":"admin"}"#)
        let client = APIClient(baseURL: base, token: "mlml_abc", transport: transport)

        let user = try await client.me()

        #expect(user.username == "admin")
        #expect(transport.requests.first?.value(forHTTPHeaderField: "Authorization") == "Bearer mlml_abc")
    }

    @Test("the server's {message} envelope becomes the error message")
    func errorEnvelope() async throws {
        let transport = FakeTransport()
        transport.stub("POST /api/v1/auth/login", status: 401, json: #"{"message":"invalid credentials"}"#)
        let client = APIClient(baseURL: base, transport: transport)

        await #expect(throws: APIError.unauthorized(message: "invalid credentials")) {
            _ = try await client.login(username: "a", password: "b", deviceName: nil)
        }
    }

    @Test("429 carries Retry-After; 503 is serverUnavailable")
    func statusMapping() async throws {
        let transport = FakeTransport()
        transport.stub("GET /health", status: 429, json: "", headers: ["Retry-After": "12"])
        transport.stub("GET /api/v1/setup/status", status: 503, json: #"{"message":"storage offline"}"#)
        let client = APIClient(baseURL: base, transport: transport)

        await #expect(throws: APIError.rateLimited(retryAfter: 12)) { _ = try await client.health() }
        await #expect(throws: APIError.serverUnavailable(status: 503, message: "storage offline")) { _ = try await client.setupStatus() }
    }

    @Test("api tokens decode Go RFC3339Nano and SQLite timestamps, and null last_used_at")
    func apiTokensDecode() async throws {
        let transport = FakeTransport()
        transport.stub("GET /api/v1/api-tokens", json: try Fixtures.string("api_tokens"))
        let client = APIClient(baseURL: base, token: "mlml_abc", transport: transport)

        let tokens = try await client.apiTokens()

        #expect(tokens.count == 2)
        #expect(tokens[0].isCurrent)
        #expect(tokens[0].lastUsedAt != nil)
        #expect(tokens[0].lastIP == "192.168.1.20")
        #expect(tokens[1].lastUsedAt == nil)
        let components = Calendar(identifier: .gregorian).dateComponents(in: TimeZone(secondsFromGMT: 0)!, from: tokens[1].createdAt)
        #expect(components.year == 2026 && components.month == 8 && components.day == 20 && components.hour == 22)
    }

    @Test("paths are appended to a base URL with a reverse-proxy prefix")
    func baseURLPrefix() async throws {
        let transport = FakeTransport()
        transport.stub("GET /milmil/health", json: #"{"status":"ok","version":"0.1.17"}"#)
        let client = APIClient(baseURL: URL(string: "https://nas.local/milmil/")!, transport: transport)

        let health = try await client.health()

        #expect(health.version == "0.1.17")
        #expect(transport.requests.first?.url?.absoluteString == "https://nas.local/milmil/health")
    }
}
