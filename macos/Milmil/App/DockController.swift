import AppKit
import MilmilAPI
import MilmilRealtime

/// Dock feedback for background work: a bounce when a download or a followed
/// series' episode lands while the app is not frontmost, and a thin progress
/// bar along the bottom of the icon while downloads are running.
@MainActor
final class DockController {
    static let shared = DockController()

    /// `download:progress` rows — the worker batches every tracked download.
    private struct Progress: Decodable {
        let gid: String
        let status: String
        let totalBytes: Int64
        let completedBytes: Int64

        enum CodingKeys: String, CodingKey {
            case gid, status
            case totalBytes = "total_bytes"
            case completedBytes = "completed_bytes"
        }
    }

    private var bar: DockProgressView?
    /// Progress owned by the app itself (offline copies), shown when the
    /// server has no active downloads to report.
    private var externalFraction: Double?
    private var serverFraction: Double?

    /// A finished download or a ready episode: bounce once if the user is
    /// elsewhere. Informational, so it stops on its own when they come back.
    func noticed(_ notification: MilmilNotification) {
        guard notification.type == "download.completed" || notification.type == "anime.episode_ready" else { return }
        guard !NSApp.isActive else { return }
        NSApp.requestUserAttention(.informationalRequest)
    }

    /// Aggregate progress of active downloads; hides the bar once none are left.
    func downloadProgress(_ event: ServerEvent) {
        guard let rows: [Progress] = try? event.decode() else { return }
        let active = rows.filter { $0.status == "active" && $0.totalBytes > 0 }
        if active.isEmpty {
            serverFraction = nil
        } else {
            let total = active.reduce(Int64(0)) { $0 + $1.totalBytes }
            let done = active.reduce(Int64(0)) { $0 + $1.completedBytes }
            serverFraction = Double(done) / Double(total)
        }
        render()
    }

    /// Aggregate fraction of the app's own transfers; nil when idle.
    func setExternal(fraction: Double?) {
        externalFraction = fraction
        render()
    }

    private func render() {
        if let fraction = serverFraction ?? externalFraction {
            show(fraction: fraction)
        } else {
            clear()
        }
    }

    private func show(fraction: Double) {
        let tile = NSApp.dockTile
        if bar == nil {
            let view = DockProgressView(frame: NSRect(origin: .zero, size: tile.size))
            bar = view
            tile.contentView = view
        }
        bar?.fraction = min(max(fraction, 0), 1)
        tile.display()
    }

    private func clear() {
        guard bar != nil else { return }
        bar = nil
        NSApp.dockTile.contentView = nil
        NSApp.dockTile.display()
    }
}

/// The app icon with a rounded bar across its bottom edge.
private final class DockProgressView: NSView {
    var fraction: Double = 0 { didSet { needsDisplay = true } }

    override func draw(_ dirtyRect: NSRect) {
        NSApp.applicationIconImage.draw(in: bounds)
        let inset = bounds.width * 0.14
        let height = max(bounds.height * 0.075, 6)
        let track = NSRect(x: inset, y: bounds.height * 0.06, width: bounds.width - inset * 2, height: height)
        NSColor.black.withAlphaComponent(0.55).setFill()
        NSBezierPath(roundedRect: track, xRadius: height / 2, yRadius: height / 2).fill()
        var fill = track.insetBy(dx: 1.5, dy: 1.5)
        fill.size.width *= fraction
        NSColor(red: 0.65, green: 0.55, blue: 0.98, alpha: 1).setFill()
        NSBezierPath(roundedRect: fill, xRadius: fill.height / 2, yRadius: fill.height / 2).fill()
    }
}
