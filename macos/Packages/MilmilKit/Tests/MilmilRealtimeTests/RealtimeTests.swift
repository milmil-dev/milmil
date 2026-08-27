import Foundation
import MilmilAPI
import Testing
@testable import MilmilRealtime

@Suite("Realtime")
struct RealtimeTests {
    @Test("socket URL swaps the scheme, keeps a proxy prefix and carries the ticket")
    func socketURL() {
        let local = RealtimeClient.socketURL(for: URL(string: "http://127.0.0.1:18080")!, ticket: "abc")
        #expect(local.absoluteString == "ws://127.0.0.1:18080/ws?ticket=abc")
        let proxied = RealtimeClient.socketURL(for: URL(string: "https://nas.local/milmil/")!, ticket: nil)
        #expect(proxied.absoluteString == "wss://nas.local/milmil/ws")
    }

    @Test("envelopes parse, including scalar and null data")
    func parse() throws {
        let scanFrame = #"{"type":"scan:progress","data":{"library_id":"lib1","files_found":12,"files_total":40,"current_file":"a.mkv"}}"#
        let scan = try #require(ServerEvent.parse(scanFrame))
        #expect(scan.type == ServerEventType.scanProgress)
        let progress: ScanProgress = try scan.decode()
        #expect(progress.libraryID == "lib1" && progress.filesFound == 12 && progress.filesTotal == 40)

        let bare = try #require(ServerEvent.parse(#"{"type":"anidb:refreshed"}"#))
        #expect(bare.data == nil)

        let nulled = try #require(ServerEvent.parse(#"{"type":"test","data":null}"#))
        #expect(nulled.data == nil)

        let transcode = try #require(ServerEvent.parse(#"{"type":"transcode:ready","data":{"token":"t1","file_id":"mf_1"}}"#))
        let payload: TranscodeEvent = try transcode.decode()
        #expect(payload.fileID == "mf_1")

        #expect(ServerEvent.parse("not json") == nil)
        #expect(ServerEvent.parse(#"{"data":1}"#) == nil)
    }

    @Test("download:progress arrives as an array and decodes as one")
    func arrayPayload() throws {
        let event = try #require(ServerEvent.parse(#"{"type":"download:progress","data":[{"gid":"g1","completed_length":5,"total_length":10}]}"#))
        struct Row: Decodable { let gid: String }
        let rows: [Row] = try event.decode()
        #expect(rows.map(\.gid) == ["g1"])
    }

    @Test("backoff grows to 30 s and stays there")
    func backoff() {
        #expect(RealtimeClient.backoff.first == 1)
        #expect(RealtimeClient.backoff.last == 30)
        #expect(RealtimeClient.backoff == RealtimeClient.backoff.sorted())
    }
}
