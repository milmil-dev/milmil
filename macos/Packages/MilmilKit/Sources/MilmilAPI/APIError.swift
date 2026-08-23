import Foundation

/// Errors surfaced by `APIClient`. The server's error body is always
/// `{"message": "<string>"}`, so there is no structured code to match on —
/// callers branch on the HTTP status carried here.
public enum APIError: Error, Sendable, Equatable {
    /// The base URL and path could not be combined into a URL.
    case invalidURL(String)
    /// The request never produced an HTTP response (DNS, TLS, timeout…).
    case transport(String)
    /// 401 — missing, malformed or revoked token.
    case unauthorized(message: String)
    /// 429 — the global limiter (100 req/s) or the credential limiter tripped.
    case rateLimited(retryAfter: TimeInterval?)
    /// 502/503 — an upstream provider or storage backend is down.
    case serverUnavailable(status: Int, message: String)
    /// Any other non-2xx status.
    case http(status: Int, message: String)
    /// The body did not match the expected shape.
    case decoding(String)

    public var statusCode: Int? {
        switch self {
        case .unauthorized: 401
        case .rateLimited: 429
        case let .serverUnavailable(status, _), let .http(status, _): status
        case .invalidURL, .transport, .decoding: nil
        }
    }

    /// The server-provided message, when there was one.
    public var serverMessage: String? {
        switch self {
        case let .unauthorized(message), let .serverUnavailable(_, message), let .http(_, message): message
        case .invalidURL, .transport, .rateLimited, .decoding: nil
        }
    }
}

extension APIError: LocalizedError {
    public var errorDescription: String? {
        switch self {
        case let .invalidURL(url):
            String(localized: "無效的伺服器網址：\(url)")
        case let .transport(detail):
            String(localized: "無法連線到伺服器（\(detail)）")
        case let .unauthorized(message):
            message.isEmpty ? String(localized: "登入已失效，請重新登入") : message
        case .rateLimited:
            String(localized: "請求過於頻繁，請稍後再試")
        case let .serverUnavailable(_, message):
            message.isEmpty ? String(localized: "伺服器暫時無法使用") : message
        case let .http(status, message):
            message.isEmpty ? String(localized: "伺服器回應錯誤（HTTP \(status)）") : message
        case let .decoding(detail):
            String(localized: "無法解析伺服器回應（\(detail)）")
        }
    }
}
