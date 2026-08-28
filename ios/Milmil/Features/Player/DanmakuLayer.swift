import MilmilDanmaku
import SwiftUI

/// Danmaku over the video, drawn on one Canvas driven by the display link.
///
/// Media time comes from the engine every frame rather than from the engine's
/// published state, which ticks once a second: a comment placed on a
/// one-second grid visibly stutters. Lane allocation is `MilmilDanmaku`'s,
/// unchanged — the macOS client lays the same episode out identically.
struct DanmakuLayer: View {
    let comments: [DanmakuComment]
    let engine: AVPlaybackEngine
    let settings: DanmakuSettings

    var body: some View {
        TimelineView(.animation) { _ in
            Canvas { context, size in
                draw(in: &context, size: size)
            }
        }
    }

    private func draw(in context: inout GraphicsContext, size: CGSize) {
        let runtime = Runtime.shared
        let now = engine.positionNow()
        let stage = LaneScheduler.Stage(
            width: size.width,
            height: size.height,
            area: settings.area,
            speed: settings.speed
        )
        runtime.sync(comments: comments, stage: stage, now: now, settings: settings, context: context)

        // One shadow filter for the whole layer rather than four extra draws
        // per comment: an end card is nearly white, and white comments vanish
        // on it otherwise.
        var shadowed = context
        shadowed.addFilter(.shadow(color: .black.opacity(0.9), radius: 2, y: 1))

        for placed in runtime.active {
            let x: Double = switch placed.comment.mode {
            case .scroll: runtime.scheduler.scrollX(for: placed.placement, at: now)
            // Fixed comments are centred, as every other client centres them.
            default: (size.width - placed.placement.width) / 2
            }
            shadowed.draw(placed.text, at: CGPoint(x: x, y: placed.placement.y), anchor: .topLeading)
        }
    }
}

/// Per-frame bookkeeping. A class rather than SwiftUI state because a Canvas
/// draws outside the update phase, and state written there is not applied.
@MainActor
private final class Runtime {
    static let shared = Runtime()

    struct Placed {
        let comment: DanmakuComment
        let placement: DanmakuPlacement
        let text: GraphicsContext.ResolvedText
    }

    var scheduler = LaneScheduler(stage: .init(width: 1, height: 1))
    var active: [Placed] = []
    private var cursor = 0
    private var lastTime = -1.0
    private var identity: (count: Int, first: String)?

    func sync(
        comments: [DanmakuComment],
        stage: LaneScheduler.Stage,
        now: Double,
        settings: DanmakuSettings,
        context: GraphicsContext
    ) {
        let key = (comments.count, comments.first?.id ?? "")
        if identity?.count != key.0 || identity?.first != key.1 {
            identity = key
            rewind(comments, now: now)
        }
        if scheduler.stage != stage {
            scheduler.resize(stage)
            active.removeAll()
        }
        // A seek in either direction invalidates every lane and the cursor.
        if lastTime < 0 || now < lastTime - 1 || now > lastTime + 2 {
            rewind(comments, now: now)
        }
        lastTime = now

        while cursor < comments.count, comments[cursor].time <= now {
            let comment = comments[cursor]
            cursor += 1
            let resolved = context.resolve(
                Text(comment.text)
                    .font(.system(size: settings.fontSize, weight: .medium))
                    .foregroundStyle(color(for: comment, opacity: settings.opacity))
            )
            let measured = resolved.measure(in: CGSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude))
            guard let placement = scheduler.place(
                comment,
                width: measured.width,
                height: measured.height,
                now: now
            ) else { continue }
            active.append(Placed(comment: comment, placement: placement, text: resolved))
        }
        active.removeAll { now > $0.placement.startTime + $0.placement.duration }
    }

    private func rewind(_ comments: [DanmakuComment], now: Double) {
        active.removeAll()
        scheduler.reset()
        cursor = comments.firstIndex { $0.time >= now } ?? comments.count
    }

    private func color(for comment: DanmakuComment, opacity: Double) -> Color {
        Color(
            red: Double(comment.color.red) / 255,
            green: Double(comment.color.green) / 255,
            blue: Double(comment.color.blue) / 255
        )
        .opacity(opacity)
    }
}
