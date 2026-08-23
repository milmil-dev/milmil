import Foundation

// Mirrors web/src/lib/api/discover.ts. All public (no token needed) except
// `/torrents`, which lands with the downloads work.
public extension APIClient {
    /// `GET /api/v1/discover/trending?page=` — 1-based, provider-paged.
    func trending(page: Int = 1) async throws -> [AnimeSummary] {
        try await get("/api/v1/discover/trending", query: [URLQueryItem(name: "page", value: String(page))])
    }
}
