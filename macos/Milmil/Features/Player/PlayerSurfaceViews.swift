import AppKit
import MilmilPlayer
import SwiftUI

/// Hosts the controller's single `MPVRenderView`. Each host owns a plain
/// container; whichever host updated last adopts the render view, so
/// moving between the watch page and the pop-out window is a reparent,
/// and a stale host's teardown cannot pull the view out of the new one.
struct PlayerRenderHost: NSViewRepresentable {
    let renderView: MPVRenderView

    func makeNSView(context: Context) -> RenderContainerView {
        let container = RenderContainerView()
        adopt(into: container)
        return container
    }

    func updateNSView(_ container: RenderContainerView, context: Context) {
        adopt(into: container)
    }

    /// Flexible: AppKit's `fittingSize` would otherwise turn the render
    /// view's current frame into a minimum size and the surface could only grow.
    func sizeThatFits(_ proposal: ProposedViewSize, nsView: RenderContainerView, context: Context) -> CGSize? {
        proposal.replacingUnspecifiedDimensions(by: CGSize(width: 320, height: 180))
    }

    static func dismantleNSView(_ container: RenderContainerView, coordinator: ()) {
        // Only detach if we still own it; a newer host may have adopted it.
        for subview in container.subviews where subview is MPVRenderView {
            subview.removeFromSuperview()
        }
    }

    private func adopt(into container: RenderContainerView) {
        guard renderView.superview !== container else { return }
        renderView.removeFromSuperview()
        renderView.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(renderView)
        container.needsLayout = true
    }

    /// Keeps the render view glued to its bounds. The container is often
    /// 0×0 when the view is adopted (SwiftUI lays out after `makeNSView`),
    /// so autoresizing masks would scale from nothing.
    final class RenderContainerView: NSView {
        override init(frame: NSRect) {
            super.init(frame: frame)
            wantsLayer = true
            layer?.backgroundColor = CGColor(gray: 0, alpha: 1)
        }

        @available(*, unavailable)
        required init?(coder: NSCoder) {
            fatalError("init(coder:) is not supported")
        }

        override func layout() {
            super.layout()
            fitSubviews()
        }

        override func setFrameSize(_ newSize: NSSize) {
            super.setFrameSize(newSize)
            fitSubviews()
        }

        private func fitSubviews() {
            for subview in subviews where subview.frame != bounds {
                subview.frame = bounds
            }
        }
    }
}

/// Empty layer-hosting view above the picture, reserved for the danmaku
/// renderer (Phase 3). Keeping it in the tree now pins the z-order.
struct DanmakuOverlayHost: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        view.wantsLayer = true
        view.layer?.masksToBounds = true
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {}

    func sizeThatFits(_ proposal: ProposedViewSize, nsView: NSView, context: Context) -> CGSize? {
        proposal.replacingUnspecifiedDimensions(by: .zero)
    }
}

/// Transparent AppKit view that turns raw mouse events into player
/// gestures: hover (throttled), click/double-click, scroll-wheel seek /
/// volume, right-click menu, drag-and-drop subtitles.
struct PlayerInteractionView: NSViewRepresentable {
    var onMouseMoved: () -> Void
    var onMouseExited: () -> Void
    var onClick: () -> Void
    var onDoubleClick: () -> Void
    var onScrollSeek: (Double) -> Void
    var onScrollVolume: (Double) -> Void
    var onContextMenu: (NSView, NSEvent) -> Void
    var onDropFiles: ([URL]) -> Void

    func makeNSView(context: Context) -> InteractionNSView {
        let view = InteractionNSView()
        view.registerForDraggedTypes([.fileURL])
        update(view)
        return view
    }

    func updateNSView(_ nsView: InteractionNSView, context: Context) {
        update(nsView)
    }

    func sizeThatFits(_ proposal: ProposedViewSize, nsView: InteractionNSView, context: Context) -> CGSize? {
        proposal.replacingUnspecifiedDimensions(by: .zero)
    }

    private func update(_ view: InteractionNSView) {
        view.onMouseMoved = onMouseMoved
        view.onMouseExited = onMouseExited
        view.onClick = onClick
        view.onDoubleClick = onDoubleClick
        view.onScrollSeek = onScrollSeek
        view.onScrollVolume = onScrollVolume
        view.onContextMenu = onContextMenu
        view.onDropFiles = onDropFiles
    }

    final class InteractionNSView: NSView {
        var onMouseMoved: () -> Void = {}
        var onMouseExited: () -> Void = {}
        var onClick: () -> Void = {}
        var onDoubleClick: () -> Void = {}
        var onScrollSeek: (Double) -> Void = { _ in }
        var onScrollVolume: (Double) -> Void = { _ in }
        var onContextMenu: (NSView, NSEvent) -> Void = { _, _ in }
        var onDropFiles: ([URL]) -> Void = { _ in }

        private var lastMove: TimeInterval = 0
        private var pendingClick: DispatchWorkItem?
        private var scrollAccumulator: CGFloat = 0

        override var acceptsFirstResponder: Bool { false }
        override var mouseDownCanMoveWindow: Bool { false }

        override func updateTrackingAreas() {
            trackingAreas.forEach(removeTrackingArea)
            addTrackingArea(NSTrackingArea(rect: bounds, options: [.mouseMoved, .mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect], owner: self))
            super.updateTrackingAreas()
        }

        override func mouseMoved(with event: NSEvent) {
            let now = CACurrentMediaTime()
            guard now - lastMove > 0.08 else { return }
            lastMove = now
            onMouseMoved()
        }

        override func mouseExited(with event: NSEvent) {
            onMouseExited()
        }

        override func mouseDown(with event: NSEvent) {
            if event.clickCount == 2 {
                pendingClick?.cancel()
                pendingClick = nil
                onDoubleClick()
                return
            }
            let work = DispatchWorkItem { [weak self] in self?.onClick() }
            pendingClick = work
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.22, execute: work)
        }

        override func rightMouseDown(with event: NSEvent) {
            onContextMenu(self, event)
        }

        override func scrollWheel(with event: NSEvent) {
            let location = convert(event.locationInWindow, from: nil)
            let inVolumeZone = location.x > bounds.width * 0.7
            let delta = event.hasPreciseScrollingDeltas ? event.scrollingDeltaY / 10 : event.scrollingDeltaY
            if inVolumeZone || abs(event.scrollingDeltaY) > abs(event.scrollingDeltaX) {
                scrollAccumulator += delta
                guard abs(scrollAccumulator) >= 1 else { return }
                let steps = scrollAccumulator.rounded(.towardZero)
                scrollAccumulator -= steps
                if inVolumeZone { onScrollVolume(Double(steps) * 2) } else { onScrollSeek(Double(-steps) * 2) }
            } else {
                let horizontal = event.hasPreciseScrollingDeltas ? event.scrollingDeltaX / 10 : event.scrollingDeltaX
                scrollAccumulator += horizontal
                guard abs(scrollAccumulator) >= 1 else { return }
                let steps = scrollAccumulator.rounded(.towardZero)
                scrollAccumulator -= steps
                onScrollSeek(Double(-steps) * 2)
            }
        }

        override func draggingEntered(_ sender: any NSDraggingInfo) -> NSDragOperation {
            subtitleURLs(in: sender).isEmpty ? [] : .copy
        }

        override func performDragOperation(_ sender: any NSDraggingInfo) -> Bool {
            let urls = subtitleURLs(in: sender)
            guard !urls.isEmpty else { return false }
            onDropFiles(urls)
            return true
        }

        private func subtitleURLs(in info: any NSDraggingInfo) -> [URL] {
            let urls = info.draggingPasteboard.readObjects(forClasses: [NSURL.self]) as? [URL] ?? []
            return urls.filter { ["srt", "ass", "ssa", "vtt", "sub"].contains($0.pathExtension.lowercased()) }
        }
    }
}

/// Hands the hosting `NSWindow` to SwiftUI once it exists.
struct WindowAccessor: NSViewRepresentable {
    var onWindow: (NSWindow) -> Void

    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        DispatchQueue.main.async {
            if let window = view.window { onWindow(window) }
        }
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        if let window = nsView.window { onWindow(window) }
    }
}
