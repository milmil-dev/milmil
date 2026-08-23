import Foundation

/// One milmil server the user has added. The token lives in the Keychain,
/// keyed by `id`; everything else is plain preferences data.
public struct ServerProfile: Codable, Sendable, Hashable, Identifiable {
    public var id: UUID
    public var name: String
    public var baseURL: URL
    public var userID: String?
    public var username: String?
    public var lastKnownVersion: String?

    public init(id: UUID = UUID(), name: String, baseURL: URL, userID: String? = nil, username: String? = nil, lastKnownVersion: String? = nil) {
        self.id = id
        self.name = name
        self.baseURL = ServerProfile.normalize(baseURL)
        self.userID = userID
        self.username = username
        self.lastKnownVersion = lastKnownVersion
    }

    /// Strips a trailing slash and a pasted `/api/v1` suffix so `baseURL` is
    /// always the origin (plus any reverse-proxy prefix).
    public static func normalize(_ url: URL) -> URL {
        var path = url.path
        while path.hasSuffix("/") { path.removeLast() }
        if path.hasSuffix("/api/v1") { path.removeLast("/api/v1".count) }
        var components = URLComponents(url: url, resolvingAgainstBaseURL: false) ?? URLComponents()
        components.path = path
        components.query = nil
        components.fragment = nil
        return components.url ?? url
    }

    /// Parses what a person types into the server field: bare hosts get
    /// `http://`, `https` is kept, and anything unparsable returns nil.
    public static func parseUserInput(_ text: String) -> URL? {
        var trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        if !trimmed.contains("://") { trimmed = "http://" + trimmed }
        guard let url = URL(string: trimmed), let scheme = url.scheme, ["http", "https"].contains(scheme), url.host() != nil else {
            return nil
        }
        return normalize(url)
    }
}
