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
}
