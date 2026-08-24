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
        guard renderLayer.frame != bounds else { return }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        renderLayer.frame = bounds
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

    // MARK: - Wake / visibility recovery

    /// While the display sleeps or the window sits on an inactive Space, CA
    /// stops servicing the GL layer and mpv's pending-frame flag can be
    /// consumed without a draw — playback then resumes as audio-only over a
    /// frozen frame. Kick the layer whenever the window becomes visible
    /// again or the screens wake.
    private var occlusionObserver: NSObjectProtocol?
    private var wakeObservers: [NSObjectProtocol] = []

    override public func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        removeRecoveryObservers()
        guard let window else { return }
        occlusionObserver = NotificationCenter.default.addObserver(
            forName: NSWindow.didChangeOcclusionStateNotification, object: window, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, let window = self.window else { return }
                if window.occlusionState.contains(.visible) {
                    self.renderLayer.isAsynchronous = false
                    self.renderLayer.forceRedraw()
                }
            }
        }
        let workspace = NSWorkspace.shared.notificationCenter
        for name in [NSWorkspace.didWakeNotification, NSWorkspace.screensDidWakeNotification] {
            wakeObservers.append(workspace.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated {
                    guard let self else { return }
                    self.renderLayer.isAsynchronous = false
                    self.renderLayer.forceRedraw()
                }
            })
        }
    }

    /// AppKit detaches a view from its window before dealloc, so
    /// `viewDidMoveToWindow` (window == nil) is the cleanup point — a
    /// nonisolated deinit cannot touch these MainActor properties anyway.
    private func removeRecoveryObservers() {
        if let occlusionObserver { NotificationCenter.default.removeObserver(occlusionObserver) }
        occlusionObserver = nil
        let workspace = NSWorkspace.shared.notificationCenter
        for observer in wakeObservers { workspace.removeObserver(observer) }
        wakeObservers = []
    }
}
