import AppKit
import MilmilAPI
import MilmilDanmaku
import MilmilPlayer
import QuartzCore
import SwiftUI

/// Core Animation danmaku renderer. One pre-rasterized `CALayer` per
/// comment; scrolling is a linear `CABasicAnimation` on `position.x`, so
/// the GPU composites and pause / playback rate are just the container
/// layer's `speed`. A display link ticks the scheduler against the
/// interpolated `PlaybackClock` so comments appear on the frame they are due.
@MainActor
final class DanmakuLayerView: NSView {
    private let container = CALayer()
    private var displayLink: CADisplayLink?
    private var scheduler: LaneScheduler
    private var active: [String: CALayer] = [:]
    private var fixedExpiry: [String: Double] = [:]
    private var lastTime: Double = -1
    private var lastFed = -1
    private var paused = true
    private var rate: Double = 1
    private let cache = NSCache<NSString, CGImage>()
    private var lineHeight: Double = 28

    var timeline: DanmakuTimeline = .empty {
        didSet { if timeline != oldValue { reseed() } }
    }

    var style = RasterStyle() {
        didSet { if style != oldValue { styleChanged() } }
    }

    /// Source of truth for "now"; set on every mpv time-pos.
    var clock = PlaybackClock()
    var reduceMotion = false

    override init(frame: NSRect) {
        scheduler = LaneScheduler(stage: .init(width: max(1, frame.width), height: max(1, frame.height)))
        super.init(frame: frame)
        wantsLayer = true
        layer?.masksToBounds = true
        layer?.addSublayer(container)
        container.masksToBounds = true
        cache.countLimit = 2000
        container.speed = 0
        container.timeOffset = CACurrentMediaTime()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    override var isOpaque: Bool { false }
    override func hitTest(_ point: NSPoint) -> NSView? { nil }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        if window != nil { startDisplayLink() } else { stopDisplayLink() }
    }

    override func layout() {
        super.layout()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        let usable = bounds.height * min(1, max(0.1, style.effectiveArea))
        container.frame = CGRect(x: 0, y: bounds.height - usable, width: bounds.width, height: usable)
        CATransaction.commit()
        let stage = LaneScheduler.Stage(width: bounds.width, height: usable, area: 1, speed: style.speed)
        if stage != scheduler.stage {
            scheduler.resize(stage)
            reseed()
        }
    }

    // MARK: - Playback state

    func setPaused(_ paused: Bool) {
        guard paused != self.paused else { return }
        self.paused = paused
        if paused {
            let pausedTime = container.convertTime(CACurrentMediaTime(), from: nil)
            container.speed = 0
            container.timeOffset = pausedTime
        } else {
            let pausedTime = container.timeOffset
            container.speed = Float(rate)
            container.timeOffset = 0
            container.beginTime = 0
            let sincePause = container.convertTime(CACurrentMediaTime(), from: nil) - pausedTime
            container.beginTime = sincePause
        }
    }

    func setRate(_ rate: Double) {
        self.rate = max(0.05, rate)
        if !paused { container.speed = Float(self.rate) }
    }

    // MARK: - Ticking

    private func startDisplayLink() {
        guard displayLink == nil else { return }
        let link = displayLink(target: self, selector: #selector(tick))
        link.add(to: .main, forMode: .common)
        displayLink = link
    }

    private func stopDisplayLink() {
        displayLink?.invalidate()
        displayLink = nil
    }

    @objc private func tick() {
        guard !timeline.isEmpty, bounds.width > 0 else { return }
        let now = clock.position(at: CACurrentMediaTime())
        if lastTime < 0 || now < lastTime - 0.5 || now > lastTime + 2 {
            reseed(at: now)
            return
        }
        if !paused { feed(from: lastTime, to: now) }
        lastTime = now
        expireFixed(at: now)
    }

    /// Emit every comment due in (from, to].
    private func feed(from: Double, to: Double) {
        let start = lastFed + 1
        let end = timeline.index(atOrAfter: to + 0.0001)
        guard end > start else { return }
        for index in start..<end {
            let comment = timeline.comments[index]
            if comment.time > from || lastFed < 0 { show(comment, at: comment.time, now: to) }
        }
        lastFed = end - 1
    }

    /// Seek / first frame: clear and rebuild the on-stage set for `now`.
    private func reseed(at time: Double? = nil) {
        let now = time ?? clock.position(at: CACurrentMediaTime())
        clear()
        scheduler.reset()
        lastTime = now
        let scrollWindow = scheduler.stage.scrollDuration
        let from = now - max(scrollWindow, scheduler.fixedDuration)
        let start = timeline.index(atOrAfter: from)
        let end = timeline.index(atOrAfter: now + 0.0001)
        for index in start..<end {
            let comment = timeline.comments[index]
            let age = now - comment.time
            if comment.mode == .scroll, age > scrollWindow { continue }
            if comment.mode != .scroll, age > scheduler.fixedDuration { continue }
            show(comment, at: comment.time, now: now)
        }
        lastFed = end - 1
    }

    private func clear() {
        for layer in active.values { layer.removeFromSuperlayer() }
        active.removeAll()
        fixedExpiry.removeAll()
    }

    private func expireFixed(at now: Double) {
        for (id, expiry) in fixedExpiry where now >= expiry {
            active[id]?.removeFromSuperlayer()
            active[id] = nil
            fixedExpiry[id] = nil
        }
    }

    // MARK: - Placement

    private func show(_ comment: DanmakuComment, at startTime: Double, now: Double) {
        guard let image = raster(for: comment) else { return }
        let scale = style.contentsScale
        let width = Double(image.width) / scale
        let height = Double(image.height) / scale
        let mode: DanmakuComment.Mode = reduceMotion && comment.mode == .scroll ? .top : comment.mode
        let probe = mode == comment.mode
            ? comment
            : DanmakuComment(id: comment.id, time: comment.time, mode: mode, color: comment.color, text: comment.text, source: comment.source)
        guard let placement = scheduler.place(probe, width: width, height: height, now: startTime, allowOverlap: style.allowOverlap) else { return }

        let layer = CALayer()
        layer.contents = image
        layer.contentsScale = scale
        layer.bounds = CGRect(x: 0, y: 0, width: width, height: height)
        layer.anchorPoint = CGPoint(x: 0, y: 0)
        layer.opacity = Float(style.opacity)
        layer.isOpaque = false
        // Core Animation's y grows upward inside a flipped-less layer tree;
        // placements are top-origin, so convert.
        let stageHeight = scheduler.stage.height
        let y = stageHeight - placement.y - height
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        if mode == .scroll {
            let total = scheduler.stage.width + width
            let elapsed = max(0, now - startTime)
            let startX = scheduler.stage.width
            layer.position = CGPoint(x: startX, y: y)
            let animation = CABasicAnimation(keyPath: "position.x")
            animation.fromValue = startX
            animation.toValue = -width
            animation.duration = placement.duration
            animation.timingFunction = CAMediaTimingFunction(name: .linear)
            animation.fillMode = .forwards
            animation.isRemovedOnCompletion = false
            // Already part-way when seeded after a seek.
            animation.timeOffset = min(placement.duration, elapsed * total / total)
            animation.beginTime = container.convertTime(CACurrentMediaTime(), from: nil)
            layer.add(animation, forKey: "scroll")
            fixedExpiry[comment.id] = startTime + placement.duration + 0.1
        } else {
            layer.position = CGPoint(x: (scheduler.stage.width - width) / 2, y: y)
            if reduceMotion {
                let fade = CABasicAnimation(keyPath: "opacity")
                fade.fromValue = 0
                fade.toValue = style.opacity
                fade.duration = 0.3
                layer.add(fade, forKey: "fade")
            }
            fixedExpiry[comment.id] = startTime + placement.duration
        }
        container.addSublayer(layer)
        CATransaction.commit()
        active[comment.id] = layer
    }

    private func styleChanged() {
        cache.removeAllObjects()
        lineHeight = style.fontSize * 1.35
        needsLayout = true
        reseed()
    }

    // MARK: - Rasterization

    struct RasterStyle: Equatable {
        var fontFamily = "sans-serif"
        var fontSize: Double = 20
        var opacity: Double = 1
        var bold = false
        var stroke: DanmakuStroke = .shadow
        var colorOverride: String = "#FFFFFF"
        var area: Double = 1
        var antiSubtitle = false
        var speed: Double = 144
        var allowOverlap = false
        var contentsScale: Double = 2

        var effectiveArea: Double { antiSubtitle ? min(area, 0.85) : area }
    }

    private func raster(for comment: DanmakuComment) -> CGImage? {
        let color = style.colorOverride.uppercased() == "#FFFFFF" ? comment.color : RGB(hex: style.colorOverride)
        let key = "\(comment.text)|\(color.hexString)|\(style.fontSize)|\(style.bold)|\(style.stroke)|\(style.fontFamily)|\(style.contentsScale)" as NSString
        if let cached = cache.object(forKey: key) { return cached }
        guard let image = DanmakuRasterizer.render(text: comment.text, color: color, style: style) else { return nil }
        cache.setObject(image, forKey: key)
        return image
    }
}

enum DanmakuRasterizer {
    nonisolated(unsafe) private static var fontCache: [String: NSFont] = [:]

    static func font(family: String, size: Double, bold: Bool) -> NSFont {
        let key = "\(family)|\(size)|\(bold)"
        if let cached = fontCache[key] { return cached }
        let weight: NSFont.Weight = bold ? .bold : .semibold
        var font: NSFont?
        if !family.isEmpty, family != "sans-serif", family != "system" {
            font = NSFont(name: family, size: size)
            if bold, let base = font { font = NSFontManager.shared.convert(base, toHaveTrait: .boldFontMask) }
        }
        let resolved = font ?? NSFont.systemFont(ofSize: size, weight: weight)
        fontCache[key] = resolved
        return resolved
    }

    static func render(text: String, color: RGB, style: DanmakuLayerView.RasterStyle) -> CGImage? {
        let font = font(family: style.fontFamily, size: style.fontSize, bold: style.bold)
        let fill = NSColor(red: CGFloat(color.red) / 255, green: CGFloat(color.green) / 255, blue: CGFloat(color.blue) / 255, alpha: 1)
        var attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: fill]
        let shadow = NSShadow()
        switch style.stroke {
        case .stroke:
            attributes[.strokeColor] = NSColor.black
            attributes[.strokeWidth] = -3.0 // negative = fill + stroke
        case .shadow:
            shadow.shadowColor = NSColor.black.withAlphaComponent(0.8)
            shadow.shadowOffset = NSSize(width: 1, height: -1)
            shadow.shadowBlurRadius = 2
            attributes[.shadow] = shadow
        case .none:
            break
        }
        let string = NSAttributedString(string: text, attributes: attributes)
        let textSize = string.size()
        let padding: CGFloat = 3
        let size = NSSize(width: ceil(textSize.width) + padding * 2, height: ceil(textSize.height) + padding * 2)
        guard size.width > 0, size.height > 0 else { return nil }
        let scale = CGFloat(style.contentsScale)
        guard let context = CGContext(
            data: nil, width: Int(size.width * scale), height: Int(size.height * scale), bitsPerComponent: 8, bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }
        context.scaleBy(x: scale, y: scale)
        let graphics = NSGraphicsContext(cgContext: context, flipped: false)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = graphics
        string.draw(at: NSPoint(x: padding, y: padding))
        NSGraphicsContext.restoreGraphicsState()
        return context.makeImage()
    }
}

/// SwiftUI host for the renderer, fed by the player controller.
struct DanmakuOverlayView: NSViewRepresentable {
    let store: DanmakuStore?
    let state: PlayerState
    let enabled: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeNSView(context: Context) -> DanmakuLayerView {
        let view = DanmakuLayerView(frame: .zero)
        update(view)
        return view
    }

    func updateNSView(_ view: DanmakuLayerView, context: Context) {
        update(view)
    }

    func sizeThatFits(_ proposal: ProposedViewSize, nsView: DanmakuLayerView, context: Context) -> CGSize? {
        proposal.replacingUnspecifiedDimensions(by: .zero)
    }

    private func update(_ view: DanmakuLayerView) {
        view.isHidden = !enabled || store == nil
        view.reduceMotion = reduceMotion
        view.clock = state.clock
        view.setRate(state.speed)
        view.setPaused(state.paused || !state.status.isActive)
        if let store {
            var raster = DanmakuLayerView.RasterStyle()
            raster.fontFamily = store.style.fontFamily
            raster.fontSize = store.style.fontSize
            raster.opacity = store.style.opacity
            raster.bold = store.style.bold
            raster.stroke = store.style.stroke
            raster.colorOverride = store.style.colorOverride
            raster.area = store.style.area
            raster.antiSubtitle = store.style.antiSubtitle
            raster.speed = store.style.speed
            raster.contentsScale = Double(view.window?.backingScaleFactor ?? 2)
            view.style = raster
            view.timeline = store.timeline
        } else {
            view.timeline = .empty
        }
    }
}
