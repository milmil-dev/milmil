import Foundation

/// Where a comment goes on the stage. `y` is the top edge in stage
/// coordinates (origin top-left); scroll comments start just past the
/// right edge and exit past the left edge `duration` seconds later.
public struct DanmakuPlacement: Sendable, Hashable {
    public let y: Double
    public let width: Double
    public let height: Double
    /// Media time the comment appears.
    public let startTime: Double
    /// Seconds on stage (scroll: stage width / speed; fixed: `fixedDuration`).
    public let duration: Double
}

/// Lane allocation ported from the web's `danmaku` engine (`allocate.js`):
/// per mode it keeps a list of occupied vertical ranges; a new comment takes
/// the first gap tall enough, or stacks after the last range it would
/// collide with. Pure value type; the renderer drives it with media time.
public struct LaneScheduler: Sendable {
    public struct Stage: Sendable, Equatable {
        public var width: Double
        public var height: Double
        /// Fraction of the height comments may use (web `danmakuArea`, 0.25…1).
        public var area: Double
        /// px/s, the web's `danmakuSpeed` (default 144).
        public var speed: Double

        public init(width: Double, height: Double, area: Double = 1, speed: Double = 144) {
            self.width = width
            self.height = height
            self.area = area
            self.speed = speed
        }

        /// The web engine gives every scroll comment the same travel time.
        public var scrollDuration: Double { speed > 0 ? width / speed : 4 }
        public var usableHeight: Double { max(0, height * min(1, max(0.1, area))) }
    }

    /// Top / bottom comments stay this long (web engine `duration` for fixed modes = scroll duration; we use 4 s like the design).
    public var fixedDuration: Double = 4

    private struct Range: Sendable {
        var range: Double
        var time: Double
        var width: Double
        var height: Double
    }

    public private(set) var stage: Stage
    private var space: [DanmakuComment.Mode: [Range]] = [:]

    public init(stage: Stage) {
        self.stage = stage
        reset()
    }

    public mutating func resize(_ stage: Stage) {
        self.stage = stage
        reset()
    }

    /// Forget every active comment (seek, settings change).
    public mutating func reset() {
        for mode in DanmakuComment.Mode.allCases {
            space[mode] = [Range(range: 0, time: -1, width: 0, height: 0)]
        }
    }

    private func duration(for mode: DanmakuComment.Mode) -> Double {
        mode == .scroll ? stage.scrollDuration : fixedDuration
    }

    /// Place `comment` at media time `now` given its rendered size.
    /// Returns nil when there is no free lane and `allowOverlap` is false.
    public mutating func place(
        _ comment: DanmakuComment, width: Double, height: Double, now: Double, allowOverlap: Bool = false
    ) -> DanmakuPlacement? {
        guard stage.usableHeight >= height, width > 0 else { return nil }
        let duration = duration(for: comment.mode)
        var lanes = space[comment.mode] ?? []
        var last = 0
        var current = 0
        var index = 1
        while index < lanes.count {
            let lane = lanes[index]
            var required = height
            if comment.mode != .scroll { required += lane.height }
            if lane.range - lane.height - lanes[last].range >= required {
                current = index
                break
            }
            if willCollide(existing: lane, width: width, mode: comment.mode, now: now, duration: duration) {
                last = index
            }
            index += 1
        }
        let channel = lanes[last].range
        let bottomEdge = channel + height
        let fits = bottomEdge <= stage.usableHeight
        if !fits, !allowOverlap { return nil }
        let entry = Range(range: bottomEdge, time: now, width: width, height: height)
        let removeCount = current > last ? current - last - 1 : 0
        lanes.replaceSubrange((last + 1)..<(last + 1 + removeCount), with: [entry])
        space[comment.mode] = lanes

        let usable = stage.usableHeight
        let y: Double
        if !fits {
            // Overlap mode: wrap like the web engine (`channel % (height - cmtHeight)`).
            let span = max(1, usable - height)
            y = channel.truncatingRemainder(dividingBy: span)
        } else {
            y = channel
        }
        let top = comment.mode == .bottom ? usable - height - y : y
        return DanmakuPlacement(y: max(0, top), width: width, height: height, startTime: now, duration: duration)
    }

    /// `allocate.js` `willCollide`, with media time as the timeline.
    private func willCollide(existing lane: Range, width: Double, mode: DanmakuComment.Mode, now: Double, duration: Double) -> Bool {
        if mode != .scroll {
            return now - lane.time < duration
        }
        let laneTotal = stage.width + lane.width
        let laneElapsed = laneTotal * (now - lane.time) / duration
        if lane.width > laneElapsed { return true } // tail not fully on stage yet
        let laneLeftTime = duration + lane.time - now // when its right end leaves the stage
        let newTotal = stage.width + width
        let newArrivalTime = duration * stage.width / newTotal // when the new one's left end reaches the left edge
        return laneLeftTime > newArrivalTime
    }

    /// Horizontal position of a scroll comment's left edge at `time`.
    public func scrollX(for placement: DanmakuPlacement, at time: Double) -> Double {
        let total = stage.width + placement.width
        let elapsed = max(0, time - placement.startTime)
        return stage.width - total * elapsed / placement.duration
    }
}
