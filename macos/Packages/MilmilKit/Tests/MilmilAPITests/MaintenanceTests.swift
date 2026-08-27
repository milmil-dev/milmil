import Foundation
import Testing
@testable import MilmilAPI

@Suite("Library maintenance models")
struct MaintenanceTests {
    let decoder = MilmilJSON.makeDecoder()

    @Test("audit rows decode the server's raw sql.NullString objects")
    func auditEntry() throws {
        let json = #"""
        {
          "id": "au1",
          "action_type": "match.apply",
          "target_type": {"String": "media_file", "Valid": true},
          "target_id": {"String": "", "Valid": false},
          "agent_label": null,
          "dry_run": 0,
          "undone_at": {"String": "", "Valid": false},
          "created_at": "2026-08-24T10:00:00Z"
        }
        """#
        let entry = try decoder.decode(AuditEntry.self, from: Data(json.utf8))
        #expect(entry.actionType == "match.apply")
        #expect(entry.targetType == "media_file")
        #expect(entry.targetID.isEmpty)
        #expect(entry.agentLabel.isEmpty)
        #expect(!entry.isUndone)
        #expect(entry.createdAt != nil)
    }

    @Test("an undone audit row surfaces isUndone")
    func auditEntryUndone() throws {
        let json = #"""
        {"id": "au2", "action_type": "librarie.delete", "undone_at": {"String": "2026-08-24T11:00:00Z", "Valid": true}}
        """#
        let entry = try decoder.decode(AuditEntry.self, from: Data(json.utf8))
        #expect(entry.isUndone)
    }

    @Test("duplicate sets tolerate missing optional fields")
    func dupSet() throws {
        let json = #"""
        {
          "episode_id": "ep1",
          "episode_number": 3,
          "preferred_id": "f1",
          "manually_set": 1,
          "wasted_bytes": 700,
          "files": [
            {"id": "f1", "filename": "a.mkv", "size_bytes": 1000, "resolution": 1080, "subgroup": "SubsPlease", "path": "/x/a.mkv"},
            {"id": "f2", "filename": "b.mkv", "size_bytes": 700}
          ]
        }
        """#
        let set = try decoder.decode(DupSet.self, from: Data(json.utf8))
        #expect(set.manuallySet)
        #expect(set.files.count == 2)
        #expect(set.files[1].subgroup.isEmpty)
        #expect(set.wastedBytes == 700)
    }

    @Test("rename plans round-trip so apply can POST the preview back")
    func renamePlanRoundTrip() throws {
        let json = #"""
        {"media_file_id": "m1", "old_path": "/a/b.mkv", "new_path": "/a/EP01.mkv", "status": "ok"}
        """#
        let plan = try decoder.decode(RenamePlan.self, from: Data(json.utf8))
        #expect(plan.isApplicable)
        let data = try MilmilJSON.makeEncoder().encode(plan)
        let back = try decoder.decode(RenamePlan.self, from: data)
        #expect(back.mediaFileID == "m1")
        #expect(back.newPath == "/a/EP01.mkv")
        #expect(back.status == "ok")
    }

    @Test("completeness reports decode fractional episode numbers")
    func completeness() throws {
        let json = #"""
        {"anime_id": "a1", "bangumi_id": 42, "title": "T", "total": 12,
         "have": [1, 2], "missing": [3, 4.5], "airing_pending": [], "unknown_total": false}
        """#
        let report = try decoder.decode(CompletenessReport.self, from: Data(json.utf8))
        #expect(report.missing == [3, 4.5])
        #expect(report.bangumiID == 42)
        #expect(!report.unknownTotal)
    }

    @Test("source config omits nil fields from the JSON")
    func sourceConfigEncoding() throws {
        let config = LibrarySourceConfig(host: "nas.local", port: 445, share: "media", accessKey: nil)
        let data = try MilmilJSON.makeEncoder().encode(config)
        let object = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(object["host"] as? String == "nas.local")
        #expect(object["port"] as? Int == 445)
        #expect(object.keys.sorted() == ["host", "port", "share"])
    }
}
