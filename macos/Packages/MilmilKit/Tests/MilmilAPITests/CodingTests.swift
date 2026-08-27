import Foundation
import Testing
@testable import MilmilAPI

@Suite("Lenient coding")
struct CodingTests {
    struct Row: Decodable {
        @LenientBool var enabled: Bool
        @LenientBool var completed: Bool
        @LenientStringArray var genres: [String]
    }

    @Test("0/1, true/false and strings all decode as Bool; missing keys default to false")
    func lenientBool() throws {
        let decoder = MilmilJSON.makeDecoder()
        let a = try decoder.decode(Row.self, from: Data(#"{"enabled":1,"completed":false,"genres":[]}"#.utf8))
        #expect(a.enabled && !a.completed)
        let b = try decoder.decode(Row.self, from: Data(#"{"enabled":"true","genres":null}"#.utf8))
        #expect(b.enabled && !b.completed)
    }

    @Test("genres decode from an array or a JSON-encoded string")
    func lenientStringArray() throws {
        let decoder = MilmilJSON.makeDecoder()
        let array = try decoder.decode(Row.self, from: Data(#"{"genres":["奇幻","冒險"]}"#.utf8))
        #expect(array.genres == ["奇幻", "冒險"])
        let string = try decoder.decode(Row.self, from: Data(#"{"genres":"[\"奇幻\",\"冒險\"]"}"#.utf8))
        #expect(string.genres == ["奇幻", "冒險"])
    }

    @Test("date parser accepts Go nanoseconds, plain ISO, SQLite and date-only")
    func dates() {
        #expect(MilmilDate.parse("2026-08-23T08:00:00.123456789Z") != nil)
        #expect(MilmilDate.parse("2026-08-23T08:00:00Z") != nil)
        #expect(MilmilDate.parse("2026-08-23T08:00:00+08:00") != nil)
        #expect(MilmilDate.parse("2026-08-23 08:00:00") != nil)
        #expect(MilmilDate.parse("2026-08-23") != nil)
        #expect(MilmilDate.parse("yesterday") == nil)
    }
}

@Suite("ServerProfile")
struct ServerProfileTests {
    @Test("user input gets a scheme and loses trailing slashes and /api/v1")
    func parseUserInput() {
        #expect(ServerProfile.parseUserInput("milmil.home.arpa")?.absoluteString == "http://milmil.home.arpa")
        #expect(ServerProfile.parseUserInput("https://nas.local:8443/")?.absoluteString == "https://nas.local:8443")
        #expect(ServerProfile.parseUserInput("https://nas.local/milmil/api/v1/")?.absoluteString == "https://nas.local/milmil")
        #expect(ServerProfile.parseUserInput("   ") == nil)
        #expect(ServerProfile.parseUserInput("ftp://nope") == nil)
    }
}

@Suite("TokenStore")
struct TokenStoreTests {
    @Test("in-memory store round-trips and clears")
    func inMemory() throws {
        let store = InMemoryTokenStore()
        let id = UUID()
        #expect(try store.token(for: id) == nil)
        try store.setToken("mlml_x", for: id)
        #expect(try store.token(for: id) == "mlml_x")
        try store.setToken(nil, for: id)
        #expect(try store.token(for: id) == nil)
    }

    @Test("timestamps decode from RFC 3339, null, a sql.NullString object, or a missing key")
    func lenientDate() throws {
        struct Row: Decodable {
            @LenientDate var at: Date?
            @LenientDate var other: Date?
        }
        let decoder = MilmilJSON.makeDecoder()
        let iso = try decoder.decode(Row.self, from: Data(#"{"at":"2026-08-23T16:33:49Z","other":null}"#.utf8))
        #expect(iso.at != nil && iso.other == nil)
        let nullString = try decoder.decode(Row.self, from: Data(#"{"at":{"String":"","Valid":false}}"#.utf8))
        #expect(nullString.at == nil && nullString.other == nil)
        let valid = try decoder.decode(Row.self, from: Data(#"{"at":{"String":"2026-08-23 08:00:00","Valid":true}}"#.utf8))
        #expect(valid.at != nil)
    }

    @Test("feed and rule rows decode as the server emits them")
    func rssRows() throws {
        let decoder = MilmilJSON.makeDecoder()
        let feed = try decoder.decode(RSSFeed.self, from: Data(#"""
        {"id":"f1","name":"Mikan","url":"https://mikanani.me/RSS/Bangumi?bangumiId=3141","type":"mikan","enabled":1,
         "fetch_interval_minutes":30,"last_fetched_at":{"String":"","Valid":false},"created_at":"2026-08-23T16:33:49Z"}
        """#.utf8))
        #expect(feed.enabled && feed.lastFetchedAt == nil && feed.createdAt != nil)
        let rule = try decoder.decode(DownloadRule.self, from: Data(#"""
        {"id":"r1","name":"芙莉蓮 1080p","enabled":1,"rss_feed_id":"f1","filter_regex":".*芙莉蓮.*","exclude_regex":"","save_dir":"",
         "episode_offset":0,"last_triggered_at":null,"created_at":"2026-08-23T16:33:49Z","resolution_filter":"1080p","subgroup_filter":"",
         "min_seeders":0,"library_id":null,"bangumi_id":null,"match_mode":"fuzzy","episode_filter":"all","episode_range":""}
        """#.utf8))
        #expect(rule.resolutionFilter == "1080p" && rule.libraryID == nil && rule.lastTriggeredAt == nil)
        let encoded = try MilmilJSON.makeEncoder().encode(DownloadRuleInput(rule))
        let json = try #require(try JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        #expect(json["enabled"] as? Int == 1 && json["library_id"] as? String == "" && json["rss_feed_id"] as? String == "f1")
    }

    @Test("download rows decode rule_id as string or Go NullString")
    func downloadRuleID() throws {
        let decoder = MilmilJSON.makeDecoder()
        let plain = try decoder.decode(Download.self, from: Data(#"""
        {"id":"d1","gid":"g1","url":"magnet:?x","name":"n","status":"active","total_bytes":10,"completed_bytes":5,
         "speed_bytes":1,"save_dir":"","rule_id":"r1","created_at":"2026-08-23T16:38:03Z","updated_at":"2026-08-23T16:41:07Z"}
        """#.utf8))
        #expect(plain.ruleID == "r1")
        let nullObject = try decoder.decode(Download.self, from: Data(#"""
        {"id":"d2","gid":"g2","url":"u","name":"n","status":"complete","total_bytes":10,"completed_bytes":10,
         "speed_bytes":0,"save_dir":"","rule_id":{"String":"r2","Valid":true},"created_at":"2026-08-23T16:38:03Z","updated_at":"2026-08-23T16:41:07Z"}
        """#.utf8))
        #expect(nullObject.ruleID == "r2")
        let invalid = try decoder.decode(Download.self, from: Data(#"""
        {"id":"d3","gid":"g3","url":"u","name":"n","status":"waiting","total_bytes":0,"completed_bytes":0,
         "speed_bytes":0,"save_dir":"","rule_id":{"String":"","Valid":false}}
        """#.utf8))
        #expect(invalid.ruleID == nil)
    }
}
