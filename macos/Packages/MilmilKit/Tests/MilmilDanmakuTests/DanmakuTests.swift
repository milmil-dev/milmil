import Foundation
import Testing
@testable import MilmilDanmaku

@Suite("Danmaku parsing")
struct ParsingTests {
    @Test("DandanPlay p-string: time, mode, colour; garbage degrades like the web worker")
    func dandanplay() {
        let ok = DanmakuParser.comment(from: DandanPlayComment(cid: 7, p: "12.5,5,16711680,abc", m: "頂部 紅字"))
        #expect(ok?.id == "ddp:7")
        #expect(ok?.time == 12.5)
        #expect(ok?.mode == .top)
        #expect(ok?.color == RGB(red: 255, green: 0, blue: 0))

        let bottom = DanmakuParser.comment(from: DandanPlayComment(cid: 1, p: "3,4,255", m: "x"))
        #expect(bottom?.mode == .bottom)
        #expect(bottom?.color == RGB(red: 0, green: 0, blue: 255))

        let reverse = DanmakuParser.comment(from: DandanPlayComment(cid: 2, p: "1,6,16777215", m: "逆向"))
        #expect(reverse?.mode == .scroll)

        let garbled = DanmakuParser.comment(from: DandanPlayComment(cid: 0, p: "nope", m: "still here"))
        #expect(garbled?.time == 0)
        #expect(garbled?.mode == .scroll)
        #expect(garbled?.color == .white)
        #expect(garbled?.id.hasPrefix("ddp:") == true)

        let overflow = DanmakuParser.comment(from: DandanPlayComment(cid: 3, p: "1,1,99999999999", m: "clamp"))
        #expect(overflow?.color == .white)

        #expect(DanmakuParser.comment(from: DandanPlayComment(cid: 4, p: "1,1,1", m: "   ")) == nil)
    }

    @Test("external comments decode both the web shape and numeric fallbacks")
    func external() throws {
        let json = """
        [{"source":"bilibili","count":2,"saved":1,"comments":[
          {"text":"hi","time":1.5,"mode":"top","color":"#00ff00"},
          {"text":"num","time":2,"mode":4,"color":255}
        ]}]
        """
        let imported = try JSONDecoder().decode([ImportedDanmaku].self, from: Data(json.utf8))
        #expect(imported.count == 1)
        #expect(imported[0].saved)
        let comments = DanmakuParser.comments(from: imported[0])
        #expect(comments.count == 2)
        #expect(comments[0].mode == .top)
        #expect(comments[0].color == RGB(red: 0, green: 255, blue: 0))
        #expect(comments[1].mode == .bottom)
        #expect(comments[1].color == RGB(red: 0, green: 0, blue: 255))
        #expect(comments[0].source == .external("bilibili"))
        #expect(comments[0].id != comments[1].id)
    }

    @Test("colours round-trip between int and hex")
    func colours() {
        #expect(RGB(hex: "#A78BFA").intValue == 0xA78BFA)
        #expect(RGB(int: 0xA78BFA).hexString == "#A78BFA")
        #expect(RGB(hex: "fff") == .white)
        #expect(RGB(hex: "zzz") == .white)
    }
}

@Suite("Danmaku pipeline")
struct PipelineTests {
    private func make(_ n: Int, time: Double, mode: DanmakuComment.Mode = .scroll, text: String = "t") -> DanmakuComment {
        DanmakuComment(id: "c\(n)", time: time, mode: mode, color: .white, text: text, source: .dandanplay)
    }

    @Test("thinning keeps the first N per 6-second bucket")
    func thinning() {
        let input = (0..<100).map { make($0, time: Double($0) * 0.1) } // 0…9.9 s → buckets [0,6) and [6,12)
        var options = DanmakuPipeline.Options()
        options.density = .low // 20
        let timeline = DanmakuPipeline(options: options).process(input)
        #expect(timeline.count == 40)
        #expect(timeline.comments.filter { $0.time < 6 }.count == 20)
        options.density = .unlimited
        #expect(DanmakuPipeline(options: options).process(input).count == 100)
    }

    @Test("mode toggles, keyword and regex blocks, conversion hook")
    func filters() {
        let input = [
            make(1, time: 1, mode: .top, text: "top"),
            make(2, time: 2, mode: .bottom, text: "bottom"),
            make(3, time: 3, text: "Spoiler ahead"),
            make(4, time: 4, text: "第12集神回"),
            make(5, time: 5, text: "后面"),
        ]
        var options = DanmakuPipeline.Options()
        options.showTop = false
        options.blockKeywords = ["spoiler", "/第\\d+集/"]
        options.convert = { $0.replacingOccurrences(of: "后", with: "後") }
        let out = DanmakuPipeline(options: options).process(input)
        #expect(out.comments.map(\.id) == ["c2", "c5"])
        #expect(out.comments.last?.text == "後面")
    }

    @Test("timeline binary search")
    func timeline() {
        let input = [make(1, time: 5), make(2, time: 1), make(3, time: 3), make(4, time: 3)]
        let timeline = DanmakuPipeline(options: .init()).process(input)
        #expect(timeline.comments.map(\.time) == [1, 3, 3, 5])
        #expect(timeline.index(atOrAfter: 3) == 1)
        #expect(timeline.index(atOrAfter: 3.1) == 3)
        #expect(timeline.comments(from: 2, to: 5).map(\.id) == ["c3", "c4"])
        #expect(timeline.comments(from: 9, to: 10).isEmpty)
    }
}

@Suite("Lane scheduler")
struct SchedulerTests {
    private func comment(_ n: Int, time: Double, mode: DanmakuComment.Mode = .scroll) -> DanmakuComment {
        DanmakuComment(id: "c\(n)", time: time, mode: mode, color: .white, text: "x", source: .dandanplay)
    }

    @Test("scroll comments at the same instant take distinct lanes and a later one reuses a freed lane")
    func lanes() {
        var scheduler = LaneScheduler(stage: .init(width: 1000, height: 500, area: 1, speed: 200)) // duration 5 s
        let a = scheduler.place(comment(1, time: 0), width: 200, height: 30, now: 0)
        let b = scheduler.place(comment(2, time: 0), width: 200, height: 30, now: 0)
        #expect(a?.y == 0)
        #expect(b?.y == 30)
        // 6 s later both have left the stage: lane 0 is free again.
        let c = scheduler.place(comment(3, time: 6), width: 200, height: 30, now: 6)
        #expect(c?.y == 0)
    }

    @Test("top stacks from the top, bottom stacks from the bottom, and expire after fixedDuration")
    func fixed() {
        var scheduler = LaneScheduler(stage: .init(width: 800, height: 400))
        let t1 = scheduler.place(comment(1, time: 0, mode: .top), width: 100, height: 20, now: 0)
        let t2 = scheduler.place(comment(2, time: 0, mode: .top), width: 100, height: 20, now: 0)
        #expect(t1?.y == 0)
        #expect(t2?.y == 20)
        let b1 = scheduler.place(comment(3, time: 0, mode: .bottom), width: 100, height: 20, now: 0)
        let b2 = scheduler.place(comment(4, time: 0, mode: .bottom), width: 100, height: 20, now: 0)
        #expect(b1?.y == 380)
        #expect(b2?.y == 360)
        let t3 = scheduler.place(comment(5, time: 5, mode: .top), width: 100, height: 20, now: 5)
        #expect(t3?.y == 0)
    }

    @Test("no two scroll comments overlap at any time (randomised)")
    func noOverlap() {
        var generator = SeededGenerator(seed: 42)
        var scheduler = LaneScheduler(stage: .init(width: 1280, height: 720, area: 1, speed: 144))
        var placements: [DanmakuPlacement] = []
        var time = 0.0
        for n in 0..<1000 {
            time += Double.random(in: 0...0.3, using: &generator)
            let width = Double.random(in: 40...400, using: &generator)
            if let placement = scheduler.place(comment(n, time: time), width: width, height: 28, now: time) {
                placements.append(placement)
            }
        }
        #expect(placements.count > 300)
        // Same lane → check horizontal separation at every 50 ms while both are on stage.
        for (i, first) in placements.enumerated() {
            for second in placements[(i + 1)...] where abs(second.y - first.y) < 28 {
                let start = max(first.startTime, second.startTime)
                let end = min(first.startTime + first.duration, second.startTime + second.duration)
                var t = start
                while t <= end {
                    let x1 = scheduler.scrollX(for: first, at: t)
                    let x2 = scheduler.scrollX(for: second, at: t)
                    let overlap = x1 < x2 + second.width && x2 < x1 + first.width
                    #expect(!overlap, "overlap at \(t): \(first) vs \(second)")
                    if overlap { return }
                    t += 0.05
                }
            }
        }
    }

    @Test("area limits usable height and overlap mode wraps instead of dropping")
    func area() {
        var strict = LaneScheduler(stage: .init(width: 1000, height: 100, area: 0.5))
        #expect(strict.place(comment(1, time: 0), width: 100, height: 30, now: 0) != nil)
        #expect(strict.place(comment(2, time: 0), width: 100, height: 30, now: 0) == nil)
        var loose = LaneScheduler(stage: .init(width: 1000, height: 100, area: 0.5))
        #expect(loose.place(comment(1, time: 0), width: 100, height: 30, now: 0) != nil)
        let wrapped = loose.place(comment(2, time: 0), width: 100, height: 30, now: 0, allowOverlap: true)
        #expect(wrapped != nil)
        #expect((wrapped?.y ?? 99) < 50)
    }

    @Test("reset after a seek frees every lane")
    func seek() {
        var scheduler = LaneScheduler(stage: .init(width: 1000, height: 100))
        _ = scheduler.place(comment(1, time: 0), width: 100, height: 30, now: 0)
        scheduler.reset()
        #expect(scheduler.place(comment(2, time: 0.1), width: 100, height: 30, now: 0.1)?.y == 0)
    }
}

struct SeededGenerator: RandomNumberGenerator {
    private var state: UInt64
    init(seed: UInt64) { state = seed &+ 0x9E37_79B9_7F4A_7C15 }
    mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}
