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
        /// Backdrop shown while yt-dlp resolves the stream.
        var artwork: URL?
    }

    private(set) var request: Request?
    private(set) var player: TrailerPlayer?
    /// Drives the 開啟 URL… sheet (⌘⇧O) hosted by `RootView`.
    var showOpenURL = false

    /// Whether the in-app path is available; otherwise callers fall back to
    /// the browser.
    var canPlayInApp: Bool { YtDlp.isInstalled }

    /// The caller opens the "trailer" window right after.
    func play(url: URL, title: String, artwork: URL? = nil) {
        request = Request(url: url, title: title, artwork: artwork)
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
    private(set) var muted = false
    private(set) var volume: Double = 100
    private(set) var speed: Double = 1
    private(set) var tracks: [MediaTrack] = []
    private(set) var subtitleID: Int64?
    private(set) var audioID: Int64?
    /// Stream height cap; switching reloads the file and restores position.
    private(set) var maxHeight = 1080
    private var currentURL: URL?
    /// Position to restore after a quality-switch reload.
    private var pendingRestore: Double?
    private var eventTask: Task<Void, Never>?

    init() {
        var options = MPVOptions()
        options.userAgent = UserAgent.value
        options.extra["ytdl"] = "yes"
        options.extra["script-opts"] = "ytdl_hook-ytdl_path=\(YtDlp.binaryURL.path)"
        // Trailers cap at 1080p — no reason to pull a 4K VP9 stream.
        options.extra["ytdl-format"] = Self.ytdlFormat(maxHeight: 1080)
        // Ask yt-dlp for YouTube captions (manual + auto) in the app's
        // languages so the subtitle menu has tracks to offer. One regex,
        // because mpv splits this option string on commas.
        options.extra["ytdl-raw-options"] = "write-subs=,write-auto-subs=,sub-langs=(zh|en|ja|ko).*"
        player = try? MPVPlayer(options: options)
        startEventLoop()
    }

    private static func ytdlFormat(maxHeight: Int) -> String {
        "bv*[height<=\(maxHeight)]+ba/b[height<=\(maxHeight)]/b"
    }

    func load(url: URL, title: String) {
        self.title = title
        currentURL = url
        loading = true
        error = nil
        tracks = []
        pendingRestore = nil
        player?.loadFile(url.absoluteString)
        player?.set("pause", false)
    }

    func togglePause() {
        guard let player else { return }
        let next = !(player.getBool("pause") ?? false)
        player.set("pause", next)
        paused = next
    }

    func seek(to seconds: Double) {
        player?.seek(to: max(0, min(seconds, duration)))
    }

    func seek(by seconds: Double) {
        player?.seek(by: seconds)
    }

    func toggleMute() {
        guard let player else { return }
        let next = !(player.getBool("mute") ?? false)
        player.set("mute", next)
        muted = next
    }

    func setVolume(_ value: Double) {
        let clamped = max(0, min(value, 100))
        player?.set("volume", clamped)
        volume = clamped
        if clamped > 0, muted { toggleMute() }
    }

    func setSpeed(_ value: Double) {
        player?.set("speed", value)
        speed = value
    }

    var subtitleTracks: [MediaTrack] { tracks.filter { $0.kind == .sub } }
    var audioTracks: [MediaTrack] { tracks.filter { $0.kind == .audio } }

    func selectTrack(_ kind: MediaTrack.Kind, id: Int64?) {
        let property = switch kind {
        case .video: "vid"
        case .audio: "aid"
        case .sub: "sid"
        }
        if let id { player?.set(property, id) } else { player?.set(property, "no") }
    }

    /// Reloads the stream with a new height cap, resuming where it was.
    func setQuality(maxHeight: Int) {
        guard maxHeight != self.maxHeight, let url = currentURL, let player else { return }
        self.maxHeight = maxHeight
        pendingRestore = timePos
        loading = true
        player.set("ytdl-format", Self.ytdlFormat(maxHeight: maxHeight))
        player.loadFile(url.absoluteString)
        player.set("pause", false)
    }

    func shutdown() {
        eventTask?.cancel()
        player?.destroy()
        player = nil
    }

    private func apply(property name: String, value: MPVValue?) {
        switch name {
        case "time-pos": timePos = value?.doubleValue ?? timePos
        case "duration": duration = value?.doubleValue ?? duration
        case "pause": paused = value?.boolValue ?? paused
        case "mute": muted = value?.boolValue ?? muted
        case "volume": volume = value?.doubleValue ?? volume
        case "speed": speed = value?.doubleValue ?? speed
        case "track-list": tracks = MediaTrack.parseList(value?.nodeValue)
        case "sid": subtitleID = value?.intValue
        case "aid": audioID = value?.intValue
        default: break
        }
    }

    private func startEventLoop() {
        guard let player else { return }
        eventTask = Task { [weak self] in
            for await event in player.events {
                guard let self else { return }
                switch event {
                case .fileLoaded:
                    loading = false
                    if let restore = pendingRestore {
                        pendingRestore = nil
                        player.seek(to: restore)
                    }
                case let .endFile(reason):
                    if case .error = reason {
                        error = String(localized: "無法播放這個網址")
                        loading = false
                    }
                case let .propertyChange(name, value):
                    apply(property: name, value: value)
                default:
                    break
                }
            }
        }
    }
}

struct TrailerWindowView: View {
    @Environment(TrailerCoordinator.self) private var coordinator
    @Environment(\.openURL) private var openURL
    @ObserveInjection private var inject

    @State private var oscVisible = true
    @State private var hideTask: Task<Void, Never>?

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
                loadingBackdrop(model)
            }
            if let error = model.error {
                EmptyState(symbol: "exclamationmark.triangle", title: error, message: String(localized: "改用瀏覽器開啟看看。"))
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { model.togglePause() }
        .onContinuousHover { phase in
            switch phase {
            case .active: showOSC()
            case .ended: scheduleHide(after: 0.8)
            }
        }
        .overlay(alignment: .bottom) {
            if model.error == nil {
                TrailerOSC(model: model) {
                    if let url = coordinator.request?.url { openURL(url) }
                }
                .opacity(oscVisible || model.paused ? 1 : 0)
                .animation(.easeOut(duration: 0.2), value: oscVisible || model.paused)
            }
        }
        .focusable()
        .focusEffectDisabled()
        .onKeyPress(.space) { model.togglePause(); showOSC(); return .handled }
        .onKeyPress(.leftArrow) { model.seek(by: -5); showOSC(); return .handled }
        .onKeyPress(.rightArrow) { model.seek(by: 5); showOSC(); return .handled }
        .onKeyPress(KeyEquivalent("m")) { model.toggleMute(); showOSC(); return .handled }
        .onKeyPress(KeyEquivalent("f")) { NSApp.keyWindow?.toggleFullScreen(nil); return .handled }
    }

    /// Artwork + spinner while yt-dlp resolves the stream, instead of a bare
    /// black window.
    @ViewBuilder
    private func loadingBackdrop(_ model: TrailerPlayer) -> some View {
        ZStack {
            if let artwork = coordinator.request?.artwork {
                GeometryReader { proxy in
                    RemoteImage(url: artwork, maxPixel: 1200) { Color.black }
                        .frame(width: proxy.size.width, height: proxy.size.height)
                        .clipped()
                        .blur(radius: 24)
                        .opacity(0.45)
                }
                .ignoresSafeArea()
            }
            VStack(spacing: 14) {
                ProgressView().controlSize(.large).tint(.white)
                if !model.title.isEmpty {
                    Text(model.title)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(.white.opacity(0.7))
                        .lineLimit(1)
                }
            }
        }
    }

    private func showOSC() {
        oscVisible = true
        scheduleHide(after: 2.5)
    }

    private func scheduleHide(after seconds: Double) {
        hideTask?.cancel()
        hideTask = Task {
            try? await Task.sleep(for: .seconds(seconds))
            guard !Task.isCancelled else { return }
            oscVisible = false
        }
    }
}

/// The main player's floating glass OSC, trimmed to what a trailer needs:
/// seek, transport, time, volume and a browser escape hatch.
private struct TrailerOSC: View {
    let model: TrailerPlayer
    var openInBrowser: () -> Void

    @State private var volumeExpanded = false

    var body: some View {
        VStack(spacing: 8) {
            TrailerSeekBar(model: model)
            HStack(spacing: 12) {
                OSCButton(symbol: "gobackward.10", label: String(localized: "後退 10 秒")) { model.seek(by: -10) }
                Button { model.togglePause() } label: {
                    Image(systemName: model.paused ? "play.fill" : "pause.fill")
                        .font(.system(size: 18, weight: .bold))
                        .frame(width: 40, height: 40)
                        .background(.white.opacity(0.14), in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(model.paused ? String(localized: "播放") : String(localized: "暫停"))
                OSCButton(symbol: "goforward.10", label: String(localized: "前進 10 秒")) { model.seek(by: 10) }
                Text(verbatim: "\(Formatters.clock(model.timePos)) / \(Formatters.clock(max(model.duration, 0)))")
                    .font(.system(size: 12, weight: .medium)).monospacedDigit()
                    .foregroundStyle(.white.opacity(0.85))
                    .padding(.leading, 4)
                Spacer(minLength: 8)
                HStack(spacing: 6) {
                    OSCButton(
                        symbol: model.muted || model.volume == 0 ? "speaker.slash.fill" : "speaker.wave.2.fill",
                        label: model.muted ? String(localized: "取消靜音") : String(localized: "靜音")
                    ) { model.toggleMute() }
                    if volumeExpanded {
                        Slider(value: Binding(get: { model.muted ? 0 : model.volume }, set: { model.setVolume($0) }), in: 0...100)
                            .controlSize(.mini)
                            .frame(width: 90)
                    }
                }
                .onHover { volumeExpanded = $0 }
                speedMenu
                subtitleMenu
                if model.audioTracks.count > 1 { audioMenu }
                qualityMenu
                OSCButton(symbol: "safari", label: String(localized: "在瀏覽器開啟")) { openInBrowser() }
                OSCButton(symbol: "arrow.up.left.and.arrow.down.right", label: String(localized: "全螢幕")) {
                    NSApp.keyWindow?.toggleFullScreen(nil)
                }
            }
            .foregroundStyle(.white)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .glassSurface(in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(.white.opacity(0.08), lineWidth: 0.5))
        .padding(.horizontal, 20)
        .padding(.bottom, 16)
        .frame(maxWidth: .infinity)
        .tint(.white)
        .disabled(model.loading)
        .opacity(model.loading ? 0 : 1)
    }

    private var speedMenu: some View {
        OSCPopover(label: String(format: "%.2g×", model.speed), help: String(localized: "播放速度"), width: 40) {
            ForEach([0.5, 0.75, 1, 1.25, 1.5, 2], id: \.self) { speed in
                OSCPopoverRow(title: String(format: "%.2g×", speed), selected: model.speed == speed) { model.setSpeed(speed) }
            }
        }
    }

    private var subtitleMenu: some View {
        OSCPopover(symbol: model.subtitleID == nil ? "captions.bubble" : "captions.bubble.fill", help: String(localized: "字幕")) {
            if model.subtitleTracks.isEmpty {
                Text("此影片沒有字幕")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 10).padding(.vertical, 6)
            } else {
                OSCPopoverRow(title: String(localized: "關閉"), selected: model.subtitleID == nil) { model.selectTrack(.sub, id: nil) }
                ForEach(model.subtitleTracks) { track in
                    OSCPopoverRow(title: track.displayName, selected: model.subtitleID == track.id) { model.selectTrack(.sub, id: track.id) }
                }
            }
        }
    }

    private var audioMenu: some View {
        OSCPopover(symbol: "waveform", help: String(localized: "音軌")) {
            ForEach(model.audioTracks) { track in
                OSCPopoverRow(title: track.displayName, selected: model.audioID == track.id) { model.selectTrack(.audio, id: track.id) }
            }
        }
    }

    private var qualityMenu: some View {
        OSCPopover(label: "\(model.maxHeight)p", help: String(localized: "畫質"), width: 48) {
            ForEach([1080, 720, 480], id: \.self) { height in
                OSCPopoverRow(title: "\(height)p", selected: model.maxHeight == height) { model.setQuality(maxHeight: height) }
            }
        }
    }
}

/// The main player's SeekBar, minus chapters/cache/thumbnails the trailer
/// stream does not have: accent fill, hover knob and hover-time bubble.
private struct TrailerSeekBar: View {
    let model: TrailerPlayer

    @State private var hovering = false
    @State private var hoverFraction: CGFloat?
    @State private var dragFraction: CGFloat?

    private var fraction: CGFloat {
        if let dragFraction { return dragFraction }
        guard model.duration > 0 else { return 0 }
        return CGFloat(min(1, model.timePos / model.duration))
    }

    var body: some View {
        GeometryReader { proxy in
            let width = proxy.size.width
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.18)).frame(height: hovering ? 6 : 4)
                Capsule().fill(Theme.accent).frame(width: width * fraction, height: hovering ? 6 : 4)
                Circle().fill(.white).frame(width: hovering ? 14 : 0, height: 14).shadow(radius: 3).offset(x: width * fraction - 7)
                if let hoverFraction, hovering, model.duration > 0 {
                    Text(Formatters.clock(Double(hoverFraction) * model.duration))
                        .font(.system(size: 11, weight: .semibold)).monospacedDigit()
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(.black.opacity(0.7), in: Capsule())
                        .frame(width: 60)
                        .offset(x: min(max(hoverFraction * width - 30, 0), width - 60), y: -26)
                        .allowsHitTesting(false)
                }
            }
            .frame(height: 20)
            .contentShape(Rectangle())
            .onContinuousHover { phase in
                switch phase {
                case let .active(point):
                    hovering = true
                    hoverFraction = min(1, max(0, point.x / width))
                case .ended:
                    hovering = false
                    hoverFraction = nil
                }
            }
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in dragFraction = min(1, max(0, value.location.x / width)) }
                    .onEnded { value in
                        let target = min(1, max(0, value.location.x / width))
                        dragFraction = nil
                        model.seek(to: Double(target) * model.duration)
                    }
            )
        }
        .frame(height: 20)
        .animation(.easeOut(duration: 0.12), value: hovering)
        .disabled(model.duration <= 0)
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
