import AppKit
import SwiftUI

/// Debug-only self-screenshot: launch with `MILMIL_SNAPSHOT=/tmp/x.png`
/// (optionally `MILMIL_SNAPSHOT_DELAY=4`) and the app renders its key window
/// to that PNG and quits. Needs no Screen Recording permission because an app
/// may always capture its own windows. Used by agents and CI to eyeball UI.
enum DevSnapshot {
    /// `MILMIL_SNAPSHOT_DESTINATION=schedule` lands the shell on that tab.
    static var initialDestination: Destination? {
        #if DEBUG
        ProcessInfo.processInfo.environment["MILMIL_SNAPSHOT_DESTINATION"].flatMap(Destination.init(rawValue:))
        #else
        nil
        #endif
    }

    /// `MILMIL_SNAPSHOT_ANIME=530725` pushes that series on top of the tab.
    static var initialAnime: Int? {
        #if DEBUG
        ProcessInfo.processInfo.environment["MILMIL_SNAPSHOT_ANIME"].flatMap(Int.init)
        #else
        nil
        #endif
    }

    /// `MILMIL_SNAPSHOT_PLAY=530725` opens the player on that series' resume episode.
    static var initialPlayback: Int? {
        #if DEBUG
        ProcessInfo.processInfo.environment["MILMIL_SNAPSHOT_PLAY"].flatMap(Int.init)
        #else
        nil
        #endif
    }

    /// `MILMIL_SNAPSHOT_CHROME=1` stops the player OSC from auto-hiding.
    static var keepsPlayerChrome: Bool {
        #if DEBUG
        ProcessInfo.processInfo.environment["MILMIL_SNAPSHOT_CHROME"] == "1"
        #else
        false
        #endif
    }

    #if DEBUG
    static func runIfRequested() {
        let env = ProcessInfo.processInfo.environment
        guard let path = env["MILMIL_SNAPSHOT"], !path.isEmpty else { return }
        let delay = env["MILMIL_SNAPSHOT_DELAY"].flatMap(Double.init) ?? 4

        Task { @MainActor in
            try? await Task.sleep(for: .seconds(delay))
            var windows = NSApp.windows.filter { $0.isVisible && $0.frame.width > 200 }
            for window in NSApp.windows {
                let id = window.identifier?.rawValue ?? "-"
                let frame = window.frame
                let line = "📸 window \(id) '\(window.title)' visible=\(window.isVisible) \(Int(frame.width))×\(Int(frame.height))\n"
                FileHandle.standardError.write(Data(line.utf8))
            }
            // MILMIL_SNAPSHOT_WINDOW=player picks the player scene instead of the biggest window.
            if let wanted = env["MILMIL_SNAPSHOT_WINDOW"], !wanted.isEmpty {
                windows = windows.filter { $0.identifier?.rawValue == wanted }
            }
            guard let window = windows.max(by: { $0.frame.width * $0.frame.height < $1.frame.width * $1.frame.height }),
                  let view = window.contentView else {
                FileHandle.standardError.write(Data("📸 snapshot: no visible window\n".utf8))
                NSApp.terminate(nil)
                return
            }
            // Default: a flattened `cacheDisplay` render — exact layout, text
            // and images, but no 3D transforms / materials / blurs.
            // MILMIL_SNAPSHOT_COMPOSITE=1 captures through the window server
            // instead (CGWindowListCreateImage is gone from the macOS 27 SDK but
            // still exported; own windows need no Screen Recording access).
            // That path occasionally catches the window mid-animation, so keep
            // it opt-in.
            // The window server hands back a low-res thumbnail for windows that
            // are not frontmost; bring ours forward before a composite capture.
            if env["MILMIL_SNAPSHOT_COMPOSITE"] == "1" {
                NSApp.activate()
                window.makeKeyAndOrderFront(nil)
                try? await Task.sleep(for: .milliseconds(700))
            }
            let rep: NSBitmapImageRep
            if env["MILMIL_SNAPSHOT_COMPOSITE"] == "1", let cgImage = Self.windowServerImage(of: window) {
                rep = NSBitmapImageRep(cgImage: cgImage)
            } else {
                let bounds = view.bounds
                guard let cached = view.bitmapImageRepForCachingDisplay(in: bounds) else {
                    NSApp.terminate(nil)
                    return
                }
                view.cacheDisplay(in: bounds, to: cached)
                rep = cached
            }
            if let png = rep.representation(using: .png, properties: [:]) {
                do {
                    try png.write(to: URL(fileURLWithPath: path))
                    FileHandle.standardError.write(Data("📸 snapshot: wrote \(path) (\(Int(rep.pixelsWide))×\(Int(rep.pixelsHigh)))\n".utf8))
                } catch {
                    FileHandle.standardError.write(Data("📸 snapshot: \(error)\n".utf8))
                }
            }
            NSApp.terminate(nil)
        }
    }

    private typealias CreateImageFn = @convention(c) (CGRect, UInt32, UInt32, UInt32) -> Unmanaged<CGImage>?

    private static func windowServerImage(of window: NSWindow) -> CGImage? {
        guard let symbol = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "CGWindowListCreateImage") else { return nil }
        let create = unsafeBitCast(symbol, to: CreateImageFn.self)
        let optionIncludingWindow: UInt32 = 1 << 3
        let bestResolution: UInt32 = 1 << 3
        let boundsIgnoreFraming: UInt32 = 1 << 0
        return create(.null, optionIncludingWindow, UInt32(window.windowNumber), bestResolution | boundsIgnoreFraming)?.takeRetainedValue()
    }
    #else
    static func runIfRequested() {}
    #endif
}
