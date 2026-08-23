import AppKit
import MilmilPlayer
import SwiftUI

/// mpv's picture. The view is created once per controller and kept alive
/// across episode switches (the layer owns the GL context).
struct MPVRenderRepresentable: NSViewRepresentable {
    let player: MPVPlayer

    func makeNSView(context: Context) -> MPVRenderView {
        MPVRenderView(player: player)
    }

    func updateNSView(_ nsView: MPVRenderView, context: Context) {}
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
