import AppKit
import SwiftUI

/// Debug-only self-screenshot: launch with `MILMIL_SNAPSHOT=/tmp/x.png`
/// (optionally `MILMIL_SNAPSHOT_DELAY=4`) and the app renders its key window
/// to that PNG and quits. Needs no Screen Recording permission because an app
/// may always capture its own windows. Used by agents and CI to eyeball UI.
enum DevSnapshot {
    #if DEBUG
    static func runIfRequested() {
        let env = ProcessInfo.processInfo.environment
        guard let path = env["MILMIL_SNAPSHOT"], !path.isEmpty else { return }
        let delay = env["MILMIL_SNAPSHOT_DELAY"].flatMap(Double.init) ?? 4

        Task { @MainActor in
            try? await Task.sleep(for: .seconds(delay))
            let windows = NSApp.windows.filter { $0.isVisible && $0.frame.width > 200 }
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
