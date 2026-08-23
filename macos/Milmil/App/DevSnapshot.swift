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
            // `cacheDisplay` flattens the layer tree: layout, text and images are
            // exact, but 3D transforms, materials and blurs are not applied.
            // (Window-server capture needs Screen Recording — use `screencapture -l`
            // from a terminal that has it when the real composite matters.)
            let bounds = view.bounds
            guard let rep = view.bitmapImageRepForCachingDisplay(in: bounds) else {
                NSApp.terminate(nil)
                return
            }
            view.cacheDisplay(in: bounds, to: rep)
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
    #else
    static func runIfRequested() {}
    #endif
}
