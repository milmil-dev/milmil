import AppKit
import MilmilAPI
import SwiftUI

/// 選單列: Now Playing controls plus a live download summary, so progress is
/// visible without bringing the app forward. Toggleable in 設定 › 播放.
struct MenuBarExtraView: View {
    @Environment(PlayerCoordinator.self) private var player
    @Environment(\.openWindow) private var openWindow
    @State private var downloads: Loadable<[Download]> = .idle
    @ObserveInjection private var inject

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            nowPlaying
            Divider().padding(.vertical, 8)
            downloadsSection
            Divider().padding(.vertical, 8)
            footer
        }
        .padding(14)
        .frame(width: 320)
        .task { await poll() }
    }

    // MARK: - Now playing

    @ViewBuilder
    private var nowPlaying: some View {
        if let controller = player.controller, !controller.state.mediaTitle.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text(controller.state.mediaTitle)
                    .font(.system(size: 13, weight: .semibold)).lineLimit(2)
                HStack(spacing: 12) {
                    Button { controller.playPrevious() } label: { Image(systemName: "backward.end.fill") }
                        .disabled(controller.previousEpisode == nil)
                    Button { controller.togglePause() } label: {
                        Image(systemName: controller.state.paused ? "play.fill" : "pause.fill").font(.system(size: 16))
                    }
                    Button { controller.playNext() } label: { Image(systemName: "forward.end.fill") }
                        .disabled(controller.nextEpisode == nil)
                    Spacer()
                    if controller.state.duration > 0 {
                        Text(verbatim: "\(Formatters.clock(controller.state.timePos)) / \(Formatters.clock(controller.state.duration))")
                            .font(.system(size: 11)).monospacedDigit().foregroundStyle(.secondary)
                    }
                }
                .buttonStyle(.borderless)
            }
        } else {
            Label("沒有播放中的內容", systemImage: "play.slash")
                .font(.system(size: 12)).foregroundStyle(.secondary)
        }
    }

    // MARK: - Downloads

    @ViewBuilder
    private var downloadsSection: some View {
        let active = (downloads.value ?? []).filter { $0.isActive || $0.isPaused }
        if active.isEmpty {
            Label("沒有進行中的下載", systemImage: "arrow.down.circle")
                .font(.system(size: 12)).foregroundStyle(.secondary)
        } else {
            VStack(alignment: .leading, spacing: 8) {
                let speed = active.reduce(Int64(0)) { $0 + $1.speedBytes }
                HStack {
                    Text("\(active.count) 個下載").font(.system(size: 12, weight: .semibold))
                    Spacer()
                    if speed > 0 {
                        Text(verbatim: "\(ByteCountFormatter.string(fromByteCount: speed, countStyle: .file))/s")
                            .font(.system(size: 11)).monospacedDigit().foregroundStyle(.secondary)
                    }
                }
                ForEach(active.prefix(3)) { download in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(download.displayName).font(.system(size: 11)).lineLimit(1).truncationMode(.middle)
                        ProgressView(value: download.fraction).controlSize(.small)
                    }
                }
                if active.count > 3 {
                    Text("還有 \(active.count - 3) 個…").font(.system(size: 11)).foregroundStyle(.secondary)
                }
            }
        }
    }

    private var footer: some View {
        HStack {
            Button("開啟 milmil") {
                openWindow(id: "main")
                NSApp.activate()
            }
            Button("下載頁") {
                NSWorkspace.shared.open(URL(string: "milmil://downloads")!)
                NSApp.activate()
            }
            Spacer()
            Button("結束") { NSApp.terminate(nil) }
        }
        .controlSize(.small)
    }

    /// Refresh while the popover stays open; the task dies with the view.
    private func poll() async {
        while !Task.isCancelled {
            if let client = player.session?.client {
                downloads = await downloads.reloaded { try await client.downloads() }
            }
            try? await Task.sleep(for: .seconds(3))
        }
    }
}
