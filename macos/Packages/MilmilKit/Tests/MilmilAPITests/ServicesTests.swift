import Foundation
import Testing
@testable import MilmilAPI

@Suite("Backend service models")
struct ServicesTests {
    let decoder = MilmilJSON.makeDecoder()

    @Test("services list decodes workers, extras and the system block")
    func servicesList() throws {
        let json = #"""
        {
          "services": [
            {"id": "worker.rss_refresh", "kind": "worker", "name": "RSS refresh", "enabled": true, "controllable": true,
             "runnable": true, "running": false, "interval_seconds": 300, "last_run_at": "2026-08-26T03:00:00Z",
             "last_duration_ms": 1200, "last_error": "", "next_run_at": "2026-08-26T03:05:00Z", "summary": "5 feeds", "extra": null},
            {"id": "jellyfin", "kind": "api", "name": "Jellyfin", "enabled": true, "controllable": true,
             "extra": {"address": "http://10.0.0.2:18080/jellyfin", "discovery_enabled": true, "discovery_port": 7359, "device_count": 2}},
            {"id": "worker.library_reconcile", "kind": "worker", "name": "Reconcile", "enabled": false, "last_error": "scan: permission denied"}
          ],
          "system": {"version": "0.1.17", "uptime_seconds": 86400, "started_at": "2026-08-25T03:00:00Z"}
        }
        """#
        let list = try decoder.decode(BackendServices.self, from: Data(json.utf8))
        #expect(list.services.count == 3)
        let rss = try #require(list.services.first)
        #expect(rss.kind == .worker && rss.isWorker && rss.runnable && rss.controllable)
        #expect(rss.intervalSeconds == 300 && rss.lastDurationMs == 1200)
        #expect(rss.lastRunAt != nil && rss.nextRunAt != nil)
        #expect(!rss.hasFailure && rss.extra.isEmpty)
        let jellyfin = list.services[1]
        #expect(jellyfin.extraString("address") == "http://10.0.0.2:18080/jellyfin")
        #expect(jellyfin.extraBool("discovery_enabled") == true)
        #expect(jellyfin.extraInt("device_count") == 2 && jellyfin.extraInt("discovery_port") == 7359)
        let reconcile = list.services[2]
        #expect(!reconcile.enabled && reconcile.hasFailure && reconcile.kind == .worker)
        #expect(list.system?.version == "0.1.17" && list.system?.uptimeSeconds == 86400)
    }

    @Test("unknown kinds and missing optionals fall back safely")
    func lenientService() throws {
        let service = try decoder.decode(BackendService.self, from: Data(#"{"id": "thing", "kind": "widget"}"#.utf8))
        #expect(service.kind == .unknown && service.name == "thing" && service.enabled)
        #expect(!service.runnable && !service.running && service.summary.isEmpty && service.lastError.isEmpty)
    }

    @Test("devices, run result and update check decode")
    func auxiliaryModels() throws {
        let device = try decoder.decode(JellyfinDevice.self, from: Data(#"""
        {"device_id": "d1", "client": "Infuse", "device_name": "Apple TV",
         "first_seen": "2026-08-20T00:00:00Z", "last_seen": "2026-08-26T01:00:00Z", "revoked": false}
        """#.utf8))
        #expect(device.id == "d1" && device.client == "Infuse" && device.lastSeen != nil && !device.revoked)
        let run = try decoder.decode(ServiceRunResult.self, from: Data(#"{"started": true}"#.utf8))
        #expect(run.started)
        let update = try decoder.decode(UpdateCheck.self, from: Data(#"""
        {"current": "0.1.17", "latest": "0.1.18", "has_update": true, "release_url": "https://github.com/milmil-dev/milmil/releases/tag/v0.1.18", "stale": false}
        """#.utf8))
        #expect(update.hasUpdate && update.latest == "0.1.18" && update.releaseURL?.host() == "github.com")
        let none = try decoder.decode(UpdateCheck.self, from: Data(#"{"current": "0.1.17"}"#.utf8))
        #expect(!none.hasUpdate && none.latest == nil)
    }
}
