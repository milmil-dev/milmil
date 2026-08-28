import Foundation
import Testing
@testable import MilmilAPI

@Suite("Stream fallback")
struct StreamFallbackTests {
    @Test("walks local → direct → remux → hls and then stops")
    func ladder() {
        var fallback = StreamFallback(hasLocalFile: true)
        #expect(fallback.current == .localFile)
        #expect(fallback.advance() == .direct)
        #expect(fallback.advance() == .remux)
        #expect(fallback.advance() == .hls)
        #expect(fallback.advance() == nil)
        #expect(fallback.current == .hls)
    }

    @Test("skips stages the server cannot offer")
    func noTranscode() {
        var fallback = StreamFallback(hasLocalFile: false, canRemux: false, canTranscode: false)
        #expect(fallback.current == .direct)
        #expect(!fallback.hasNext)
        #expect(fallback.advance() == nil)
    }
}

struct OfflineLadderTests {
    @Test func offlineCopyLeadsTheLadder() {
        var ladder = StreamFallback(hasOfflineCopy: true, hasLocalFile: true, canRemux: false, canTranscode: false)
        #expect(ladder.current == .offlineCopy)
        #expect(ladder.advance() == .localFile)
        #expect(ladder.advance() == .direct)
        #expect(ladder.advance() == nil)
    }

    @Test func defaultLadderIsUnchanged() {
        let ladder = StreamFallback(hasLocalFile: false)
        #expect(ladder.stages == [.direct, .remux, .hls])
    }
}

@Suite("Resume candidate")
struct ResumeCandidateTests {
    /// Decoded rather than constructed: these models are `Decodable`-only, and
    /// a fixture keeps the test honest about the shape the server sends.
    private func response(_ episodes: String) throws -> PlayableEpisodesResponse {
        let json = """
        {"anime_id":"a","watch_status":"watching","episodes":[\(episodes)]}
        """
        return try MilmilJSON.makeDecoder().decode(PlayableEpisodesResponse.self, from: Data(json.utf8))
    }

    private func episode(_ sort: Int, position: Int, duration: Int) -> String {
        """
        {"episode_id":"e\(sort)","sort":\(sort),
         "media_file":{"id":"f\(sort)","filename":"x.mkv"},
         "progress":{"position_seconds":\(position),"duration_seconds":\(duration),"completed":0}}
        """
    }

    @Test("an episode watched to 99% is not offered as a resume")
    func nearlyFinished() throws {
        // Seven seconds from the end: resuming there plays the credits and
        // stops, which is exactly what an iOS run did.
        let payload = try response([
            episode(41, position: 1423, duration: 1430),
            episode(42, position: 0, duration: 0),
        ].joined(separator: ","))
        #expect(payload.resumeCandidate?.sort == 42)
    }

    @Test("a genuinely part-watched episode still wins")
    func partWatched() throws {
        let payload = try response([
            episode(41, position: 725, duration: 1430),
            episode(42, position: 0, duration: 0),
        ].joined(separator: ","))
        #expect(payload.resumeCandidate?.sort == 41)
    }
}

@Suite("Notification message")
struct NotificationMessageTests {
    private func notification(_ message: String) throws -> MilmilNotification {
        let json = """
        {"id":"n1","type":"download.complete","title":"Download Complete",
         "message":"\(message)","severity":"info","read":0}
        """
        return try MilmilJSON.makeDecoder().decode(MilmilNotification.self, from: Data(json.utf8))
    }

    @Test("a download notification shows the torrent name, not the magnet")
    func magnet() throws {
        // The server names a fresh download by its magnet, which renders as six
        // lines of percent-encoding in the notification list.
        let row = try notification("magnet:?xt=urn:btih:abc&dn=%5BYameii%5D+The+Elusive+Samurai&tr=x")
        #expect(row.displayMessage == "[Yameii] The Elusive Samurai")
        #expect(try notification("Milmil").displayMessage == "Milmil")
        #expect(try notification("magnet:?xt=urn:btih:abc").displayMessage == "種子")
    }
}
