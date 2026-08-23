import Foundation

// Mirrors web/src/lib/api/preferences.ts.
public extension APIClient {
    func globalPreferences() async throws -> GlobalPreferences {
        let envelope: PreferenceEnvelope<GlobalPreferences> = try await get("/api/v1/user/preferences")
        return envelope.data
    }

    /// Writes the full set (known keys + preserved `extra`).
    func saveGlobalPreferences(_ preferences: GlobalPreferences) async throws {
        try await put("/api/v1/user/preferences", body: PreferenceEnvelope(data: preferences))
    }

    func seriesPreferences(seriesID: String) async throws -> SeriesPreferences {
        let envelope: PreferenceEnvelope<SeriesPreferences> = try await get("/api/v1/user/preferences/series/\(seriesID)")
        return envelope.data
    }

    func saveSeriesPreferences(_ preferences: SeriesPreferences, seriesID: String) async throws {
        try await put("/api/v1/user/preferences/series/\(seriesID)", body: PreferenceEnvelope(data: preferences))
    }
}
