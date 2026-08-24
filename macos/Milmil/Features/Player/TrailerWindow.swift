import AppKit
import MilmilAPI
import MilmilPlayer
import SwiftUI

/// 預告片 / 開啟 URL: a second, tiny mpv instance with `ytdl=yes` routed
/// through the downloaded yt-dlp binary. Completely separate from the main
/// `PlayerController` so trailers never disturb episode playback state.
@Observable
final class TrailerCoordinator {
    struct Request: Equatable {
        let url: URL
        let title: String
    }

    private(set) var request: Request?
    private(set) var player: TrailerPlayer?
    /// Drives the 開啟 URL… sheet (⌘⇧O) hosted by `RootView`.
    var showOpenURL = false

    /// Whether the in-app path is available; otherwise callers fall back to
    /// the browser.
    var canPlayInApp: Bool { YtDlp.isInstalled }

    /// The caller opens the "trailer" window right after.
    func play(url: URL, title: String) {
        request = Request(url: url, title: title)
        if player == nil { player = TrailerPlayer() }
        player?.load(url: url, title: title)
        YtDlp.updateInBackground()
    }

    func windowDidClose() {
        player?.shutdown()
        player = nil
        request = nil
    }
}

/// Minimal playback model: load, pause toggle, progress for the overlay.
@Observable
final class TrailerPlayer {
    private(set) var player: MPVPlayer?
    @ObservationIgnored private(set) lazy var renderView: MPVRenderView? = player.map { MPVRenderView(player: $0) }
    private(set) var title = ""
    private(set) var paused = false
    private(set) var timePos: Double = 0
    private(set) var duration: Double = 0
    private(set) var loading = true
    private(set) var error: String?
    private var eventTask: Task<Void, Never>?

    init() {
        var options = MPVOptions()
        options.userAgent = UserAgent.value
        options.extra["ytdl"] = "yes"
        options.extra["script-opts"] = "ytdl_hook-ytdl_path=\(YtDlp.binaryURL.path)"
        // Trailers cap at 1080p — no reason to pull a 4K VP9 stream.
        options.extra["ytdl-format"] = "bv*[height<=1080]+ba/b[height<=1080]/b"
        player = try? MPVPlayer(options: options)
        startEventLoop()
    }

    func load(url: URL, title: String) {
        self.title = title
        loading = true
        error = nil
        player?.loadFile(url.absoluteString)
        player?.set("pause", false)
    }

    func togglePause() {
        guard let player else { return }
        let next = !(player.getBool("pause") ?? false)
        player.set("pause", next)
        paused = next
    }

    func shutdown() {
        eventTask?.cancel()
        player?.destroy()
        player = nil
    }

    private func startEventLoop() {
        guard let player else { return }
        eventTask = Task { [weak self] in
            for await event in player.events {
                guard let self else { return }
                switch event {
                case .fileLoaded:
                    loading = false
                case let .endFile(reason):
                    if case .error = reason {
                        error = String(localized: "無法播放這個網址")
                        loading = false
                    }
                case let .propertyChange(name, value):
                    switch name {
                    case "time-pos": timePos = value?.doubleValue ?? timePos
                    case "duration": duration = value?.doubleValue ?? duration
                    case "pause": paused = value?.boolValue ?? paused
                    default: break
                    }
                default:
                    break
                }
            }
        }
    }
}

struct TrailerWindowView: View {
    @Environment(TrailerCoordinator.self) private var coordinator
    @ObserveInjection private var inject

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let model = coordinator.player {
                content(model)
                    .navigationTitle(model.title.isEmpty ? String(localized: "預告片") : model.title)
            } else {
                EmptyState(symbol: "film", title: String(localized: "沒有播放中的預告片"), message: String(localized: "從作品頁按「預告片」開啟。"))
            }
        }
        .onDisappear { coordinator.windowDidClose() }
    }

    @ViewBuilder
    private func content(_ model: TrailerPlayer) -> some View {
        ZStack {
            if let renderView = model.renderView {
                PlayerRenderHost(renderView: renderView, isActive: true)
            }
            if model.loading, model.error == nil {
                ProgressView().controlSize(.large).tint(.white)
            }
            if let error = model.error {
                EmptyState(symbol: "exclamationmark.triangle", title: error, message: String(localized: "改用瀏覽器開啟看看。"))
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { model.togglePause() }
        .overlay(alignment: .bottomLeading) {
            if !model.loading, model.error == nil {
                HStack(spacing: 8) {
                    Image(systemName: model.paused ? "play.fill" : "pause.fill")
                    if model.duration > 0 {
                        Text(verbatim: "\(Formatters.clock(model.timePos)) / \(Formatters.clock(model.duration))")
                            .monospacedDigit()
                    }
                }
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.white.opacity(0.85))
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(.black.opacity(0.45), in: Capsule())
                .padding(12)
                .allowsHitTesting(false)
            }
        }
    }
}

/// 開啟 URL… (⌘⇧O): paste any http(s) link; plays in-app when yt-dlp is
/// installed, otherwise hands the link to the browser.
struct OpenURLSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openWindow) private var openWindow
    @Environment(TrailerCoordinator.self) private var trailers
    @State private var text = ""

    private var url: URL? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed), ["http", "https"].contains(url.scheme ?? "") else { return nil }
        return url
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("開啟 URL").font(.system(size: 16, weight: .bold))
            TextField("https://…", text: $text)
                .textFieldStyle(.roundedBorder)
                .frame(width: 380)
                .onSubmit { open() }
            if !trailers.canPlayInApp {
                Text("尚未安裝 yt-dlp，會改用瀏覽器開啟。可在設定 › 播放安裝。")
                    .font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
            }
            HStack {
                Spacer()
                Button("取消") { dismiss() }.keyboardShortcut(.cancelAction)
                Button("開啟") { open() }.keyboardShortcut(.defaultAction).disabled(url == nil)
            }
        }
        .padding(20)
        .onAppear {
            if let pasted = NSPasteboard.general.string(forType: .string),
               let url = URL(string: pasted.trimmingCharacters(in: .whitespacesAndNewlines)),
               ["http", "https"].contains(url.scheme ?? "") {
                text = pasted.trimmingCharacters(in: .whitespacesAndNewlines)
            }
        }
    }

    private func open() {
        guard let url else { return }
        if trailers.canPlayInApp {
            trailers.play(url: url, title: url.host() ?? url.absoluteString)
            openWindow(id: "trailer")
        } else {
            NSWorkspace.shared.open(url)
        }
        dismiss()
    }
}
