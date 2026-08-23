import Foundation

/// Where a file is being played from. Ordered from best to worst.
public enum StreamStage: String, Sendable, Equatable, CaseIterable {
    /// Server path mapped to a local mount — zero server I/O.
    case localFile
    /// `GET /stream/{id}/direct` with Range support.
    case direct
    /// `GET /stream/{id}/remux` (fragmented MP4, no re-encode).
    case remux
    /// `POST /stream/{id}/transcode` → HLS.
    case hls

    public var label: String {
        switch self {
        case .localFile: "本機檔案"
        case .direct: "直接串流"
        case .remux: "Remux"
        case .hls: "轉碼 (HLS)"
        }
    }
}

/// The ladder mpv walks down when a stage fails to open or decode.
public struct StreamFallback: Sendable, Equatable {
    public private(set) var stages: [StreamStage]
    public private(set) var index = 0

    public init(hasLocalFile: Bool, canRemux: Bool = true, canTranscode: Bool = true) {
        var stages: [StreamStage] = []
        if hasLocalFile { stages.append(.localFile) }
        stages.append(.direct)
        if canRemux { stages.append(.remux) }
        if canTranscode { stages.append(.hls) }
        self.stages = stages
    }

    public var current: StreamStage { stages[index] }
    public var hasNext: Bool { index + 1 < stages.count }

    /// Move to the next stage, or return nil when the ladder is exhausted.
    @discardableResult
    public mutating func advance() -> StreamStage? {
        guard hasNext else { return nil }
        index += 1
        return current
    }

    public mutating func reset() { index = 0 }
}
