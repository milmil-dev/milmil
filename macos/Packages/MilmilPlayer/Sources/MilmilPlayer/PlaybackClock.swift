import Foundation

/// Interpolates mpv's `time-pos` (which only ticks ~every frame and arrives
/// on another queue) against the host clock, so overlays like danmaku can
/// ask "where are we *right now*" at display rate.
public struct PlaybackClock: Sendable, Equatable {
    public private(set) var anchorPosition: Double = 0
    public private(set) var anchorHostTime: TimeInterval = 0
    public private(set) var speed: Double = 1
    public private(set) var isPaused = true

    public init() {}

    /// Feed a fresh `time-pos` sample.
    public mutating func update(position: Double, hostTime: TimeInterval) {
        anchorPosition = position
        anchorHostTime = hostTime
    }

    public mutating func setPaused(_ paused: Bool, hostTime: TimeInterval) {
        guard paused != isPaused else { return }
        anchorPosition = position(at: hostTime)
        anchorHostTime = hostTime
        isPaused = paused
    }

    public mutating func setSpeed(_ speed: Double, hostTime: TimeInterval) {
        anchorPosition = position(at: hostTime)
        anchorHostTime = hostTime
        self.speed = max(0, speed)
    }

    public func position(at hostTime: TimeInterval) -> Double {
        guard !isPaused else { return anchorPosition }
        return anchorPosition + max(0, hostTime - anchorHostTime) * speed
    }
}
