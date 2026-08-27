import AppKit
import MilmilAPI
import SwiftUI

/// Quick Look for posters: Space over a hovered card floats a panel with the
/// cover, titles, season · genres, next episode (local time), how many
/// episodes are waiting if the series is in the library, and 播放 / 作品頁.
/// Space or Esc closes it. Cards register the summary under the cursor; the
/// key monitor lives here so no grid needs focus handling.
@MainActor
@Observable
final class QuickLookController {
    static let shared = QuickLookController()

    /// The poster the cursor is over, if any.
    var hovered: AnimeSummary?
    private(set) var shown: AnimeSummary?
    private var panel: NSPanel?
    private var monitor: Any?

    func install() {
        guard monitor == nil else { return }
        monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            // NSEvent is not Sendable; only its scalars cross into the actor.
            let keyCode = event.keyCode
            let flags = event.modifierFlags
            let handled = MainActor.assumeIsolated { self?.handle(keyCode: keyCode, flags: flags) ?? false }
            return handled ? nil : event
        }
    }

    /// Space toggles (only when no text field is typing); Esc closes.
    private func handle(keyCode: UInt16, flags: NSEvent.ModifierFlags) -> Bool {
        let typing = NSApp.keyWindow?.firstResponder is NSTextView
        switch keyCode {
        case 49 where !typing && flags.isDisjoint(with: [.command, .option, .control]):
            if shown != nil {
                dismiss()
                return true
            }
            guard let hovered else { return false }
            show(hovered)
            return true
        case 53 where shown != nil:
            dismiss()
            return true
        default:
            return false
        }
    }

    func show(_ anime: AnimeSummary) {
        guard let session = CurrentSession.shared.session else { return }
        shown = anime
        let host = NSHostingView(rootView: QuickLookCardView(anime: anime).environment(session))
        host.frame.size = host.fittingSize
        let panel = self.panel ?? Self.makePanel()
        panel.contentView = host
        panel.setContentSize(host.fittingSize)
        if let parent = NSApp.keyWindow ?? NSApp.mainWindow {
            let frame = parent.frame
            panel.setFrameOrigin(NSPoint(x: frame.midX - panel.frame.width / 2, y: frame.midY - panel.frame.height / 2))
        } else {
            panel.center()
        }
        self.panel = panel
        panel.alphaValue = 0
        panel.orderFront(nil)
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.18
            panel.animator().alphaValue = 1
        }
    }

    func dismiss() {
        guard let panel else { return }
        shown = nil
        NSAnimationContext.runAnimationGroup({ context in
            context.duration = 0.15
            panel.animator().alphaValue = 0
        }, completionHandler: {
            Task { @MainActor in panel.orderOut(nil) }
        })
    }

    private static func makePanel() -> NSPanel {
        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 640, height: 360),
            styleMask: [.titled, .fullSizeContentView, .nonactivatingPanel, .utilityWindow],
            backing: .buffered, defer: false
        )
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.hidesOnDeactivate = true
        panel.isMovableByWindowBackground = true
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = true
        panel.standardWindowButton(.closeButton)?.isHidden = true
        panel.standardWindowButton(.miniaturizeButton)?.isHidden = true
        panel.standardWindowButton(.zoomButton)?.isHidden = true
        return panel
    }
}

/// The card: the hover preview plus the two actions and the library line.
private struct QuickLookCardView: View {
    @Environment(ServerSession.self) private var session
    let anime: AnimeSummary

    @State private var unwatched: Int?
    @State private var inLibrary = false

    var body: some View {
        VStack(spacing: 0) {
            AnimeHoverPreview(anime: anime)
            HStack(spacing: 10) {
                if let airTime = anime.airTime, let next = anime.nextEpisode, next > 0 {
                    let local = Formatters.localTime(fromJST: airTime) ?? airTime
                    Label(String(localized: "下一集 EP\(next) · \(local)"), systemImage: "clock")
                }
                if inLibrary, let unwatched {
                    Label(unwatched > 0 ? String(localized: "\(unwatched) 集未看") : String(localized: "全部看完"), systemImage: "checkmark.circle")
                }
                Spacer()
                if inLibrary {
                    Button("播放", systemImage: "play.fill") { open("milmil://watch/\(anime.bangumiID)") }
                        .glassProminentButtonStyle()
                    Button("保留整套", systemImage: "arrow.down.circle") {
                        Task { await OfflineStore.shared.keep(bangumiID: anime.bangumiID, title: anime.title) }
                    }
                    .glassButtonStyle()
                    .help("保留喺呢部 Mac，冇網絡都可以睇")
                }
                if anime.bangumiID > 0 {
                    Button("作品頁", systemImage: "info.circle") { open("milmil://anime/\(anime.bangumiID)") }
                        .glassButtonStyle()
                }
                Text("Space")
                    .font(.system(size: 10, weight: .semibold, design: .rounded))
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 4))
                    .foregroundStyle(.white.opacity(0.4))
            }
            .font(.system(size: 12))
            .foregroundStyle(.white.opacity(0.7))
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
            .background(Color.black.opacity(0.55))
        }
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(.white.opacity(0.12)))
        .environment(\.colorScheme, .dark)
        .task {
            guard anime.bangumiID > 0, let playable = try? await session.client.playableEpisodes(bangumiID: anime.bangumiID) else { return }
            inLibrary = playable.episodes.contains(where: \.hasFile)
            unwatched = playable.episodes.filter { $0.hasFile && $0.progress?.completed != true }.count
        }
    }

    private func open(_ string: String) {
        guard let url = URL(string: string) else { return }
        QuickLookController.shared.dismiss()
        NSApp.activate()
        SystemNotifier.shared.openURL?(url)
    }
}
