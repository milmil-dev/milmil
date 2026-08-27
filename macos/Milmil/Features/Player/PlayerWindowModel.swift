import AppKit
import Observation

/// Window-level UI state for the player: chrome visibility, panels,
/// fullscreen / mini mode, and the AppKit window it drives.
@Observable
final class PlayerWindowModel: PlayerWindowActions {
    var controlsVisible = true
    var inspectorShown = false
    var helpShown = false
    var techInfoShown = false
    var danmakuSettingsShown = false
    var isFullscreen = false
    var isMini = false
    var hoveringControls = false
    var showTimeRemaining = false
    /// Pinch zoom on the picture, 1 = fit; applied through mpv `video-zoom`
    /// so the picture is resampled at source resolution.
    var videoZoom: CGFloat = 1
    /// Brief "縮放 1.5×" pill after a pinch.
    var zoomHintShown = false
    private var zoomHintTask: Task<Void, Never>?
    static let maxVideoZoom: CGFloat = 4
    /// Embedded in the main window (watch page) vs. the pop-out window.
    private(set) var embedded = false
    /// Watch-page-only actions the surface routes back to its owner.
    var embeddedHandler: ((EmbeddedAction) -> Void)?

    enum EmbeddedAction {
        case theater
        case popOut
        case composeDanmaku
    }

    weak var controller: PlayerController?
    private(set) weak var window: NSWindow?
    private var hideTask: Task<Void, Never>?
    private var keyMonitor: Any?
    private var normalFrame: NSRect?
    private var fullscreenObservers: [Any] = []

    // MARK: Window wiring

    func attach(window: NSWindow, controller: PlayerController, embedded: Bool = false) {
        guard self.window !== window else { return }
        if self.window != nil { detach() }
        self.window = window
        self.controller = controller
        self.embedded = embedded
        if !embedded {
            window.title = controller.state.mediaTitle
            window.titlebarAppearsTransparent = true
            window.titleVisibility = .hidden
            window.styleMask.insert(.fullSizeContentView)
            window.isMovableByWindowBackground = true
            window.backgroundColor = .black
            window.collectionBehavior.insert(.fullScreenPrimary)
            window.setFrameAutosaveName("PlayerWindow")
            window.minSize = NSSize(width: 480, height: 270)
            window.tabbingMode = .disallowed
        }
        isFullscreen = window.styleMask.contains(.fullScreen)
        let center = NotificationCenter.default
        fullscreenObservers = [
            center.addObserver(forName: NSWindow.didEnterFullScreenNotification, object: window, queue: .main) { [weak self] _ in
                Task { @MainActor in self?.isFullscreen = true }
            },
            center.addObserver(forName: NSWindow.didExitFullScreenNotification, object: window, queue: .main) { [weak self] _ in
                Task { @MainActor in self?.isFullscreen = false }
            },
        ]
        installKeyMonitor()
        scheduleHide()
    }

    func detach() {
        hideTask?.cancel()
        if let keyMonitor { NSEvent.removeMonitor(keyMonitor) }
        keyMonitor = nil
        fullscreenObservers.forEach(NotificationCenter.default.removeObserver)
        fullscreenObservers = []
        window = nil
    }

    func updateTitle(_ title: String) {
        guard !embedded else { return }
        window?.title = title
    }

    /// Lock the window's aspect to the video once its size is known.
    func applyVideoSize(_ size: CGSize) {
        guard !embedded, let window, size.width > 0, size.height > 0, !isFullscreen else { return }
        window.contentAspectRatio = size
        if isMini {
            resizeMini()
        } else if let content = window.contentView {
            let width = content.frame.width
            let height = width * size.height / size.width
            var frame = window.frame
            let delta = height - content.frame.height
            frame.size.height += delta
            frame.origin.y -= delta
            window.setFrame(frame, display: true, animate: true)
        }
    }

    // MARK: Video zoom

    func zoom(by magnification: CGFloat) {
        let next = min(Self.maxVideoZoom, max(1, videoZoom * (1 + magnification)))
        guard next != videoZoom else { return }
        videoZoom = next
        controller?.setVideoZoom(Double(next))
        showZoomHint()
    }

    func resetZoom() {
        guard videoZoom != 1 else { return }
        videoZoom = 1
        controller?.setVideoZoom(1)
        showZoomHint()
    }

    private func showZoomHint() {
        zoomHintShown = true
        zoomHintTask?.cancel()
        zoomHintTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(900))
            guard !Task.isCancelled else { return }
            self?.zoomHintShown = false
        }
    }

    // MARK: Chrome auto-hide

    func pokeControls() {
        controlsVisible = true
        if !embedded { window?.standardWindowButton(.closeButton)?.superview?.isHidden = false }
        NSCursor.unhide()
        scheduleHide()
    }

    func hideControlsNow() {
        guard !hoveringControls, !(controller?.state.paused ?? true), !helpShown, !DevSnapshot.keepsPlayerChrome else { return }
        controlsVisible = false
        if isFullscreen { NSCursor.setHiddenUntilMouseMoves(true) }
        if !embedded { window?.standardWindowButton(.closeButton)?.superview?.isHidden = true }
    }

    private func scheduleHide() {
        hideTask?.cancel()
        hideTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(2500))
            guard !Task.isCancelled else { return }
            self?.hideControlsNow()
        }
    }

    // MARK: Modes

    func toggleFullscreen() {
        window?.toggleFullScreen(nil)
    }

    func toggleMini() {
        if embedded {
            embeddedHandler?(.popOut)
            return
        }
        guard let window else { return }
        if isFullscreen {
            // Leave fullscreen first; the frame we would save is the screen's.
            window.toggleFullScreen(nil)
            return
        }
        isMini.toggle()
        if isMini {
            normalFrame = window.frame
            window.level = .floating
            window.collectionBehavior.insert(.canJoinAllSpaces)
            inspectorShown = false
            resizeMini()
        } else {
            window.level = .normal
            window.collectionBehavior.remove(.canJoinAllSpaces)
            if let normalFrame { window.setFrame(normalFrame, display: true, animate: true) }
        }
    }

    private func resizeMini() {
        guard let window, let screen = window.screen ?? NSScreen.main else { return }
        var aspect: CGFloat = 16 / 9
        if let size = controller?.state.videoSize, size.width > 0, size.height > 0 {
            aspect = size.width / size.height
        }
        let width: CGFloat = 480
        let size = NSSize(width: width, height: width / aspect)
        let visible = screen.visibleFrame
        let origin = NSPoint(x: visible.maxX - size.width - 24, y: visible.minY + 24)
        window.setFrame(NSRect(origin: origin, size: size), display: true, animate: true)
    }

    // MARK: Keyboard

    private func installKeyMonitor() {
        guard keyMonitor == nil else { return }
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self, let window, event.window === window else { return event }
            return handleKeyDown(event) ? nil : event
        }
    }

    private func handleKeyDown(_ event: NSEvent) -> Bool {
        // Let text fields (danmaku compose, inspector search) keep their keys.
        if let responder = window?.firstResponder, responder is NSTextView || responder is NSTextField { return false }
        guard let controller else { return false }
        if event.keyCode == 53 { // Escape
            if helpShown { helpShown = false; return true }
            if techInfoShown { techInfoShown = false; return true }
            if isFullscreen { toggleFullscreen(); return true }
            return false
        }
        guard let chord = KeyChord(event: event), let action = controller.keymap.action(for: chord) else { return false }
        pokeControls()
        return controller.perform(action, window: self)
    }

    func perform(_ action: PlayerAction) {
        switch action {
        case .fullscreen: toggleFullscreen()
        case .miniPlayer: toggleMini()
        case .help: helpShown.toggle()
        case .techInfo: techInfoShown.toggle()
        case .inspector:
            if embedded { embeddedHandler?(.theater) } else { inspectorShown.toggle() }
        case .theater:
            if embedded { embeddedHandler?(.theater) }
        case .danmakuSettings:
            danmakuSettingsShown.toggle()
        case .danmakuCompose:
            if embedded { embeddedHandler?(.composeDanmaku) } else { inspectorShown = true }
        default: break
        }
    }
}
