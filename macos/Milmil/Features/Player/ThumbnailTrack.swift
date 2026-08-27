import Foundation

/// Seek-bar preview thumbnails: the server's WebVTT of
/// `sprite.jpg#xywh=x,y,w,h` cues.
struct ThumbnailTrack: Sendable, Equatable {
    struct Cue: Sendable, Equatable {
        let start: Double
        let end: Double
        let rect: CGRect
    }

    let spriteURL: URL
    let cues: [Cue]

    func cue(at seconds: Double) -> Cue? {
        // Cues are sorted by start; binary search the last one starting ≤ t.
        var low = 0
        var high = cues.count - 1
        var best: Cue?
        while low <= high {
            let mid = (low + high) / 2
            if cues[mid].start <= seconds {
                best = cues[mid]
                low = mid + 1
            } else {
                high = mid - 1
            }
        }
        return best
    }

    /// Parse the VTT. Sprite references are resolved against `spriteURL`
    /// (the server emits a bare `sprite.jpg`, which needs our token).
    static func parse(_ text: String, spriteURL: URL) -> ThumbnailTrack? {
        var cues: [Cue] = []
        let lines = text.components(separatedBy: .newlines)
        var index = 0
        while index < lines.count {
            let line = lines[index].trimmingCharacters(in: .whitespaces)
            if line.contains("-->") {
                let parts = line.components(separatedBy: "-->").map { $0.trimmingCharacters(in: .whitespaces) }
                guard parts.count == 2, let start = timestamp(parts[0]), let end = timestamp(parts[1].components(separatedBy: " ").first ?? "") else {
                    index += 1
                    continue
                }
                var next = index + 1
                while next < lines.count, lines[next].trimmingCharacters(in: .whitespaces).isEmpty { next += 1 }
                if next < lines.count, let rect = xywh(lines[next]) {
                    cues.append(Cue(start: start, end: end, rect: rect))
                }
                index = next + 1
            } else {
                index += 1
            }
        }
        guard !cues.isEmpty else { return nil }
        return ThumbnailTrack(spriteURL: spriteURL, cues: cues.sorted { $0.start < $1.start })
    }

    static func timestamp(_ raw: String) -> Double? {
        let parts = raw.split(separator: ":").map(String.init)
        guard parts.count == 2 || parts.count == 3 else { return nil }
        let seconds = Double(parts.last ?? "") ?? 0
        let minutes = Double(parts[parts.count - 2]) ?? 0
        let hours = parts.count == 3 ? (Double(parts[0]) ?? 0) : 0
        return hours * 3600 + minutes * 60 + seconds
    }

    static func xywh(_ line: String) -> CGRect? {
        guard let range = line.range(of: "#xywh=") else { return nil }
        let numbers = line[range.upperBound...].split(separator: ",").compactMap { Double($0) }
        guard numbers.count == 4 else { return nil }
        return CGRect(x: numbers[0], y: numbers[1], width: numbers[2], height: numbers[3])
    }
}
