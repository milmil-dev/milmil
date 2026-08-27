import Foundation

/// The one seam between `APIClient` and the network, so tests can replay
/// canned responses without URLProtocol gymnastics.
public protocol HTTPTransport: Sendable {
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

/// Production transport over a `URLSession` tuned for a LAN media server.
public struct URLSessionTransport: HTTPTransport {
    private let session: URLSession

    public init(session: URLSession = .milmil) {
        self.session = session
    }

    public func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: request)
        } catch let error as URLError {
            throw APIError.transport(error.localizedDescription)
        }
        guard let http = response as? HTTPURLResponse else {
            throw APIError.transport("non-HTTP response")
        }
        return (data, http)
    }
}

public extension URLSession {
    /// Shared session for JSON calls. Media streaming goes through mpv, not here.
    static let milmil: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 20
        config.timeoutIntervalForResource = 60
        config.waitsForConnectivity = false
        config.httpAdditionalHeaders = ["User-Agent": UserAgent.value]
        return URLSession(configuration: config)
    }()
}

public enum UserAgent {
    /// `milmil-macos/0.1.0 (macOS 15.0)` — the server derives a device name
    /// from this when the login request omits one.
    public static let value: String = {
        let bundle = Bundle.main
        let version = bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "dev"
        let os = ProcessInfo.processInfo.operatingSystemVersion
        return "milmil-macos/\(version) (macOS \(os.majorVersion).\(os.minorVersion))"
    }()
}
