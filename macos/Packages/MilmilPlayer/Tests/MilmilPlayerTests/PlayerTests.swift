import Foundation
import Testing
@testable import MilmilPlayer

@Suite("MPV options")
struct OptionsTests {
    @Test("default table pins the libmpv essentials")
    func defaults() {
        let table = MPVOptions().table
        let dict = Dictionary(uniqueKeysWithValues: table.map { ($0.key, $0.value) })
        #expect(dict["vo"] == "libmpv")
        #expect(dict["hwdec"] == "videotoolbox")
        #expect(dict["keep-open"] == "yes")
        #expect(dict["input-default-bindings"] == "no")
        #expect(dict["slang"] == "zh-TW,zh-Hant,zh,en")
        #expect(dict["http-header-fields"] == nil)
    }

    @Test("HTTP headers are joined in a stable order")
    func headers() {
        var options = MPVOptions()
        options.httpHeaders = ["X-Device": "mac", "Authorization": "Bearer mlml_x"]
        let dict = Dictionary(uniqueKeysWithValues: options.table.map { ($0.key, $0.value) })
        #expect(dict["http-header-fields"] == "Authorization: Bearer mlml_x,X-Device: mac")
    }
}

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

@Suite("Playback clock")
struct PlaybackClockTests {
    @Test("interpolates while playing and freezes while paused")
    func interpolation() {
        var clock = PlaybackClock()
        clock.update(position: 10, hostTime: 100)
        clock.setPaused(false, hostTime: 100)
        #expect(clock.position(at: 101.5) == 11.5)
        clock.setSpeed(2, hostTime: 101.5)
        #expect(clock.position(at: 102) == 12.5)
        clock.setPaused(true, hostTime: 102)
        #expect(clock.position(at: 110) == 12.5)
    }

    @Test("never runs backwards when the host clock jitters")
    func monotonic() {
        var clock = PlaybackClock()
        clock.update(position: 5, hostTime: 50)
        clock.setPaused(false, hostTime: 50)
        #expect(clock.position(at: 49.9) == 5)
    }
}

@Suite("Track parsing")
struct TrackTests {
    @Test("builds tracks and chapters from node trees")
    func parse() {
        let tracks = MPVNode.array([
            .map(["id": .int(1), "type": .string("video"), "codec": .string("hevc"), "selected": .flag(true)]),
            .map(["id": .int(2), "type": .string("audio"), "lang": .string("jpn"), "codec": .string("aac"), "demux-channel-count": .int(2)]),
            .map(["id": .int(1), "type": .string("sub"), "title": .string("繁體"), "lang": .string("zh-TW"), "external": .flag(true)]),
            .map(["id": .int(9), "type": .string("bogus")]),
        ])
        let parsed = MediaTrack.parseList(tracks)
        #expect(parsed.count == 3)
        #expect(parsed[1].displayName == "日本語 (AAC, 2ch)")
        #expect(parsed[2].displayName == "繁體 · 繁體中文 (external)")

        let chapters = MediaChapter.parseList(.array([
            .map(["title": .string("OP"), "time": .double(90)]),
            .map(["title": .string("Part A"), "time": .double(180)]),
        ]))
        #expect(chapters.count == 2)
        #expect(chapters[0].segmentKind == "op")
        #expect(chapters[1].segmentKind == nil)
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
