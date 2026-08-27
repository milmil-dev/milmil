import Foundation

/// Typed client for the milmil `/api/v1` surface. One instance per server.
///
/// Paths are passed in full (`/api/v1/auth/login`) to keep a 1:1 reading with
/// `web/src/lib/api/*.ts`. The token is an opaque, non-expiring `mlml_…`
/// string sent as a bearer header; there is no refresh flow — a 401 means the
/// token was revoked and the user has to log in again.
public actor APIClient {
    public let baseURL: URL
    private let transport: any HTTPTransport
    private let decoder = MilmilJSON.makeDecoder()
    private let encoder = MilmilJSON.makeEncoder()
    private var token: String?
    /// UI language sent as `X-Milmil-Locale` so the API localizes titles and
    /// synopses to what this client is showing, not the server-wide
    /// `appearance.language` the web picked. Defaults to the bundle's
    /// resolved localization (`en`, `zh-Hant`, `zh-HK`, …).
    private let locale: String?

    public init(
        baseURL: URL,
        token: String? = nil,
        locale: String? = Bundle.main.preferredLocalizations.first,
        transport: any HTTPTransport = URLSessionTransport()
    ) {
        self.baseURL = ServerProfile.normalize(baseURL)
        self.token = token
        self.locale = locale
        self.transport = transport
    }

    public var hasToken: Bool { token != nil }

    public func setToken(_ token: String?) {
        self.token = token
    }

    /// The current token, for callers that must put it in a query string
    /// (thumbnail sprite URLs). Prefer the header everywhere else.
    public func currentToken() -> String? { token }

    // MARK: - Verbs

    public func get<T: Decodable & Sendable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
        let request = try makeRequest(method: "GET", path: path, query: query, body: nil as Data?)
        return try decode(try await perform(request))
    }

    /// A decoded GET together with its raw body, for callers that keep a
    /// stale-while-revalidate copy on disk and paint from it next time.
    public func getSnapshot<T: Decodable & Sendable>(_ path: String, query: [URLQueryItem] = []) async throws -> Snapshot<T> {
        let request = try makeRequest(method: "GET", path: path, query: query, body: nil as Data?)
        let data = try await perform(request)
        return Snapshot(value: try decode(data), data: data)
    }

    /// Decodes a body captured earlier by `getSnapshot` with the same lenient
    /// decoder the live path uses.
    public func decode<T: Decodable & Sendable>(_ type: T.Type, from data: Data) throws -> T {
        try decode(data)
    }

    public func post<T: Decodable & Sendable>(_ path: String, body: some Encodable & Sendable) async throws -> T {
        let request = try makeRequest(method: "POST", path: path, query: [], body: try encoder.encode(body))
        return try decode(try await perform(request))
    }

    public func post<T: Decodable & Sendable>(_ path: String) async throws -> T {
        let request = try makeRequest(method: "POST", path: path, query: [], body: nil as Data?)
        return try decode(try await perform(request))
    }

    /// POST that expects 204 / an empty body.
    public func post(_ path: String, body: (some Encodable & Sendable)? = Optional<EmptyBody>.none) async throws {
        let data = try body.map { try encoder.encode($0) }
        let request = try makeRequest(method: "POST", path: path, query: [], body: data)
        _ = try await perform(request)
    }

    public func put<T: Decodable & Sendable>(_ path: String, body: some Encodable & Sendable) async throws -> T {
        let request = try makeRequest(method: "PUT", path: path, query: [], body: try encoder.encode(body))
        return try decode(try await perform(request))
    }

    public func put(_ path: String, body: some Encodable & Sendable) async throws {
        let request = try makeRequest(method: "PUT", path: path, query: [], body: try encoder.encode(body))
        _ = try await perform(request)
    }

    public func patch<T: Decodable & Sendable>(_ path: String, body: some Encodable & Sendable) async throws -> T {
        let request = try makeRequest(method: "PATCH", path: path, query: [], body: try encoder.encode(body))
        return try decode(try await perform(request))
    }

    /// For handlers that answer `204 No Content` — decoding an empty body
    /// would throw even for an "empty" response type.
    public func patch(_ path: String, body: some Encodable & Sendable) async throws {
        let request = try makeRequest(method: "PATCH", path: path, query: [], body: try encoder.encode(body))
        _ = try await perform(request)
    }

    public func delete(_ path: String, query: [URLQueryItem] = []) async throws {
        let request = try makeRequest(method: "DELETE", path: path, query: query, body: nil as Data?)
        _ = try await perform(request)
    }

    /// One-file `multipart/form-data` PUT (avatars). The body is built by
    /// `multipartBody` so tests can check the framing without a transport.
    public func upload<T: Decodable & Sendable>(
        _ path: String, method: String = "PUT", fileField: String, data: Data, filename: String, mimeType: String
    ) async throws -> T {
        var request = try makeRequest(method: method, path: path, query: [], body: nil as Data?)
        let boundary = "milmil-" + UUID().uuidString
        request.httpBody = Self.multipartBody(fileField: fileField, data: data, filename: filename, mimeType: mimeType, boundary: boundary)
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        return try decode(try await perform(request))
    }

    nonisolated public static func multipartBody(fileField: String, data: Data, filename: String, mimeType: String, boundary: String) -> Data {
        var body = Data()
        body.append(Data("--\(boundary)\r\n".utf8))
        body.append(Data("Content-Disposition: form-data; name=\"\(fileField)\"; filename=\"\(filename)\"\r\n".utf8))
        body.append(Data("Content-Type: \(mimeType)\r\n\r\n".utf8))
        body.append(data)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        return body
    }

    // MARK: - Plumbing

    public struct EmptyBody: Encodable, Sendable {
        public init() {}
    }

    /// A decoded response plus the bytes it came from.
    public struct Snapshot<T: Sendable>: Sendable {
        public let value: T
        public let data: Data
    }

    /// Status + body without the JSON/error mapping, for endpoints that
    /// answer with a non-JSON 200 (HLS playlists).
    public func raw(_ method: String, _ path: String, query: [URLQueryItem] = []) async throws -> (status: Int, data: Data) {
        let request = try makeRequest(method: method, path: path, query: query, body: nil)
        let (data, response) = try await transport.send(request)
        if response.statusCode == 401 { throw APIError.unauthorized(message: serverMessage(in: data)) }
        return (response.statusCode, data)
    }

    private func makeRequest(method: String, path: String, query: [URLQueryItem], body: Data?) throws -> URLRequest {
        let trimmed = path.hasPrefix("/") ? String(path.dropFirst()) : path
        var components = URLComponents(url: baseURL.appending(path: trimmed), resolvingAgainstBaseURL: false)
        if !query.isEmpty { components?.queryItems = query }
        guard let url = components?.url else { throw APIError.invalidURL(baseURL.absoluteString + "/" + trimmed) }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let locale, !locale.isEmpty { request.setValue(locale, forHTTPHeaderField: "X-Milmil-Locale") }
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return request
    }

    private func perform(_ request: URLRequest) async throws -> Data {
        let (data, response) = try await transport.send(request)
        switch response.statusCode {
        case 200..<300:
            return data
        case 401:
            throw APIError.unauthorized(message: serverMessage(in: data))
        case 429:
            let retry = response.value(forHTTPHeaderField: "Retry-After").flatMap(TimeInterval.init)
            throw APIError.rateLimited(retryAfter: retry)
        case 502, 503:
            throw APIError.serverUnavailable(status: response.statusCode, message: serverMessage(in: data))
        default:
            throw APIError.http(status: response.statusCode, message: serverMessage(in: data))
        }
    }

    private func decode<T: Decodable>(_ data: Data) throws -> T {
        do {
            return try decoder.decode(T.self, from: data)
        } catch let error as DecodingError {
            throw APIError.decoding(error.compactDescription)
        }
    }

    /// Echo's default error handler writes `{"message": "..."}`; anything
    /// else (an HTML 502 from a proxy) degrades to an empty message.
    private func serverMessage(in data: Data) -> String {
        struct Envelope: Decodable { let message: String }
        return (try? decoder.decode(Envelope.self, from: data))?.message ?? ""
    }
}

extension DecodingError {
    var compactDescription: String {
        switch self {
        case let .keyNotFound(key, context): "missing key \(key.stringValue) at \(context.codingPath.map(\.stringValue).joined(separator: "."))"
        case let .typeMismatch(type, context): "type mismatch for \(type) at \(context.codingPath.map(\.stringValue).joined(separator: "."))"
        case let .valueNotFound(type, context): "null for \(type) at \(context.codingPath.map(\.stringValue).joined(separator: "."))"
        case let .dataCorrupted(context): context.debugDescription
        @unknown default: String(describing: self)
        }
    }
}
