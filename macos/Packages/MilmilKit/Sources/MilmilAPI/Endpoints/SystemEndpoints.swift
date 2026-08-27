import Foundation

// Backend services management (Settings › 服務): the service registry,
// per-service enable / run, Jellyfin devices, and the system-level actions
// the panel gathers (transcode cache, sync, update check).
public extension APIClient {
    func systemServices() async throws -> BackendServices {
        try await get("/api/v1/system/services")
    }

    /// Flips a service on or off; `discoveryEnabled` only means anything for `jellyfin`.
    func updateService(id: String, enabled: Bool? = nil, discoveryEnabled: Bool? = nil) async throws -> BackendService {
        struct Body: Encodable {
            let enabled: Bool?
            let discoveryEnabled: Bool?
            enum CodingKeys: String, CodingKey {
                case enabled
                case discoveryEnabled = "discovery_enabled"
            }
        }
        return try await patch("/api/v1/system/services/\(id)", body: Body(enabled: enabled, discoveryEnabled: discoveryEnabled))
    }

    /// Runs a worker once, now. 409 while it is already running.
    func runService(id: String) async throws -> ServiceRunResult {
        try await post("/api/v1/system/services/\(id)/run")
    }

    func jellyfinDevices() async throws -> [JellyfinDevice] {
        struct Response: Decodable {
            let devices: [JellyfinDevice]?
        }
        let response: Response = try await get("/api/v1/system/services/jellyfin/devices")
        return response.devices ?? []
    }

    func revokeJellyfinDevice(id: String) async throws {
        try await delete("/api/v1/system/services/jellyfin/devices/\(id)")
    }

    func clearTranscodeCache() async throws {
        try await delete("/api/v1/system/transcode-cache")
    }

    func triggerSync() async throws {
        try await post("/api/v1/preferences/sync")
    }

    func updateCheck() async throws -> UpdateCheck {
        try await get("/api/v1/system/update-check")
    }
}
