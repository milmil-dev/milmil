import AppKit

/// Layer-hosting host for `MPVRenderLayer`. All it does is wiring:
/// backing scale, live-resize mode, and keeping the layer the backing layer.
@MainActor
public final class MPVRenderView: NSView {
    public let renderLayer: MPVRenderLayer

    public init(player: MPVPlayer) {
        renderLayer = MPVRenderLayer(player: player)
        super.init(frame: .zero)
        wantsLayer = true
        layerContentsRedrawPolicy = .duringViewResize
        layer = renderLayer
        renderLayer.contentsScale = NSScreen.main?.backingScaleFactor ?? 2
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    override public var isOpaque: Bool { true }
    override public var acceptsFirstResponder: Bool { false }
    override public var mouseDownCanMoveWindow: Bool { false }

    /// Layer-hosting views do not get their root layer resized by AppKit in
    /// every hierarchy (SwiftUI containers included) — pin it explicitly.
    override public func setFrameSize(_ newSize: NSSize) {
        super.setFrameSize(newSize)
        syncLayerFrame()
    }

    override public func layout() {
        super.layout()
        syncLayerFrame()
    }

    private func syncLayerFrame() {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        if renderLayer.frame != bounds { renderLayer.frame = bounds }
        CATransaction.commit()
        renderLayer.setNeedsDisplay()
    }

    override public func viewDidChangeBackingProperties() {
        super.viewDidChangeBackingProperties()
        if let scale = window?.backingScaleFactor {
            renderLayer.contentsScale = scale
        }
    }

    override public func viewWillStartLiveResize() {
        super.viewWillStartLiveResize()
        renderLayer.isAsynchronous = true
    }

    override public func viewDidEndLiveResize() {
        super.viewDidEndLiveResize()
        renderLayer.isAsynchronous = false
        renderLayer.setNeedsDisplay()
    }
}
