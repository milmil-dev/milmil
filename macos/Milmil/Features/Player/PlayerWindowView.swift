import AppKit
import MilmilAPI
import MilmilPlayer
import SwiftUI

/// Root of the `player` window scene.
struct PlayerWindowView: View {
    @Environment(PlayerCoordinator.self) private var coordinator
    @State private var model = PlayerWindowModel()

    var body: some View {
        Group {
            if let controller = coordinator.controller, coordinator.presentation == .window {
                PlayerSurface(controller: controller, model: model, embedded: false)
                    .id(ObjectIdentifier(controller))
                    .onDisappear { coordinator.windowDidClose() }
            } else {
                VStack(spacing: 10) {
                    Image(systemName: "play.rectangle").font(.system(size: 40)).foregroundStyle(Theme.Text.tertiary)
                    Text("從作品頁選一集開始播放").foregroundStyle(Theme.Text.tertiary)
                }
                .frame(minWidth: 640, minHeight: 360)
                .background(Color.black)
            }
        }
        .preferredColorScheme(.dark)
    }
}

/// Picture + every overlay, for one controller. Used by both the in-app
/// watch page (`embedded`) and the pop-out window.
struct PlayerSurface: View {
    let controller: PlayerController
    let model: PlayerWindowModel
    var embedded = false
    var embeddedHandler: ((PlayerWindowModel.EmbeddedAction) -> Void)?
    @Environment(PlayerCoordinator.self) private var coordinator
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var surfaceWidth: CGFloat = 1000
    @ObserveInjection private var inject

    private var state: PlayerState { controller.state }
    private var chromeVisible: Bool { model.controlsVisible || state.paused || !state.status.isActive }

    var body: some View {
        // `.inspector` is a window-level split container: inside the watch
        // page it rewrites the size proposal, so only the pop-out window gets it.
        if embedded {
            surface
        } else {
            surface
                .inspector(isPresented: Binding(get: { model.inspectorShown }, set: { model.inspectorShown = $0 })) {
                    PlayerInspector(controller: controller)
                        .inspectorColumnWidth(min: 280, ideal: 320, max: 420)
                }
        }
    }

    /// The picture is the only view that decides the surface's size; every
    /// piece of chrome is an overlay, so a wide OSC can never inflate the
    /// surface past the frame the watch page gives it.
    private var surface: some View {
        picture
            .overlay { DanmakuOverlayView(store: controller.danmakuStore, state: state, enabled: controller.danmakuEnabled).allowsHitTesting(false) }
            .overlay {
                PlayerInteractionView(
                    onMouseMoved: { model.pokeControls() },
                    onMouseExited: { model.hideControlsNow() },
                    onClick: { controller.togglePause() },
                    onDoubleClick: { model.toggleFullscreen() },
                    onScrollSeek: { controller.seek(by: $0) },
                    onScrollVolume: { controller.adjustVolume(by: $0) },
                    onContextMenu: { view, event in PlayerContextMenu.show(controller: controller, model: model, in: view, with: event) },
                    onDropFiles: { urls in urls.forEach { controller.addExternalSubtitle(fileURL: $0) } }
                )
            }
            .overlay { gradients }
            .overlay { PlayerStatusLayer(controller: controller) }
            .overlay { overlays }
            .background(Color.black)
            .frame(minWidth: embedded ? 0 : 480, minHeight: embedded ? 0 : 270)
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { surfaceWidth = $0 }
            .background(WindowAccessor { window in model.attach(window: window, controller: controller, embedded: embedded) })
            .onAppear { model.embeddedHandler = embeddedHandler }
            .onChange(of: state.mediaTitle) { _, title in model.updateTitle(title) }
            .onChange(of: state.videoSize) { _, size in model.applyVideoSize(size) }
            .onChange(of: state.paused) { _, paused in if paused { model.pokeControls() } }
            .onDisappear { model.detach() }
            .animation(reduceMotion ? nil : .easeOut(duration: 0.18), value: chromeVisible)
    }

    @ViewBuilder
    private var picture: some View {
        if let renderView = controller.renderView {
            PlayerRenderHost(renderView: renderView, isActive: embedded == (coordinator.presentation == .embedded))
        } else {
            Color.black
        }
    }

    private var gradients: some View {
        VStack(spacing: 0) {
            LinearGradient(colors: [.black.opacity(0.55), .clear], startPoint: .top, endPoint: .bottom).frame(height: 90)
            Spacer()
            LinearGradient(colors: [.clear, .black.opacity(0.7)], startPoint: .top, endPoint: .bottom).frame(height: 160)
        }
        .opacity(chromeVisible ? 1 : 0)
        .allowsHitTesting(false)
    }

    private var overlays: some View {
        VStack(spacing: 0) {
            topBar
            Spacer()
            bottomStack
        }
        .overlay(alignment: .top) {
            if let osd = controller.osd {
                OSDPill(message: osd).padding(.top, 56).transition(.opacity)
            }
        }
        .overlay {
            if model.helpShown { HelpOverlay(keymap: controller.keymap) { model.helpShown = false } }
        }
        .overlay(alignment: .topLeading) {
            if model.techInfoShown { TechInfoOverlay(state: state).padding(.top, 48).padding(.leading, 16) }
        }
        .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: controller.osd)
    }

    private var topBar: some View {
        HStack(spacing: 10) {
            Spacer().frame(width: model.isFullscreen || embedded ? 0 : 72) // traffic lights
            VStack(alignment: .leading, spacing: 2) {
                Text(controller.request?.title ?? "").font(.system(size: 13, weight: .semibold)).lineLimit(1)
                if let episode = controller.episode {
                    Text("第 \(episode.number) 集\(episode.displayTitle.map { " · \($0)" } ?? "")")
                        .font(.system(size: 11)).foregroundStyle(.white.opacity(0.7)).lineLimit(1)
                }
            }
            Spacer()
            if state.isHDR { PillBadge(text: "HDR", tint: Color(hex: 0xFBBF24), foreground: .black) }
            if !state.resolutionLabel.isEmpty { PillBadge(text: state.resolutionLabel, tint: .white.opacity(0.16)) }
            PillBadge(text: state.stage.label, tint: state.stage == .direct ? Color(hex: 0x4ADE80).opacity(0.25) : Color(hex: 0x7DD3FC).opacity(0.25))
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .opacity(chromeVisible ? 1 : 0)
        .allowsHitTesting(chromeVisible)
    }

    private var bottomStack: some View {
        VStack(alignment: .trailing, spacing: 12) {
            HStack(alignment: .bottom) {
                if controller.showResumePill, let position = controller.resumePosition {
                    ResumePill(seconds: position) { controller.restartFromBeginning() } dismiss: { controller.dismissResumePill() }
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
                Spacer()
                if let segment = state.currentSegment {
                    Button("跳過 \(segment.label)", systemImage: "forward.end.fill") { controller.skipCurrentSegment() }
                        .buttonStyle(.borderedProminent)
                        .tint(.white.opacity(0.9))
                        .foregroundStyle(.black)
                        .keyboardShortcut(.tab, modifiers: [])
                        .transition(.opacity)
                }
                if controller.postPlayCountdown != nil, let next = controller.nextEpisode {
                    PostPlayCard(episode: next, countdown: controller.autoNextEnabled ? controller.postPlayCountdown : nil) {
                        controller.cancelPostPlay()
                        controller.play(episode: next)
                    } cancel: {
                        controller.dismissPostPlay()
                    }
                    .transition(.move(edge: .trailing).combined(with: .opacity))
                }
            }
            .padding(.horizontal, 20)
            PlayerOSC(controller: controller, model: model, availableWidth: surfaceWidth)
                .opacity(chromeVisible ? 1 : 0)
                .allowsHitTesting(chromeVisible)
                .onHover { model.hoveringControls = $0 }
        }
        .padding(.bottom, 16)
        .animation(reduceMotion ? nil : .snappy(duration: 0.25), value: controller.showResumePill)
        .animation(reduceMotion ? nil : .snappy(duration: 0.25), value: controller.postPlayCountdown == nil)
    }
}

/// Loading / buffering / error / ended states in the middle of the picture.
struct PlayerStatusLayer: View {
    let controller: PlayerController

    var body: some View {
        let state = controller.state
        ZStack {
            switch state.status {
            case let .loading(text):
                VStack(spacing: 12) {
                    ProgressView().controlSize(.large)
                    Text(text).font(.system(size: 13)).foregroundStyle(.white.opacity(0.8))
                }
            case let .buffering(percent):
                VStack(spacing: 8) {
                    ProgressView().controlSize(.large)
                    Text(percent > 0 ? "緩衝中 \(percent)%" : "緩衝中…").font(.system(size: 12)).foregroundStyle(.white.opacity(0.8))
                }
            case let .failed(message):
                VStack(spacing: 14) {
                    Image(systemName: "exclamationmark.triangle").font(.system(size: 32)).foregroundStyle(Color(hex: 0xF87171))
                    Text("無法播放").font(.system(size: 16, weight: .semibold))
                    Text(message).font(.system(size: 12)).foregroundStyle(.white.opacity(0.7)).multilineTextAlignment(.center).frame(maxWidth: 360)
                    HStack {
                        Button("重試") { if let episode = controller.episode { controller.play(episode: episode) } }.buttonStyle(.borderedProminent)
                        if let next = controller.nextEpisode {
                            Button("播放下一集") { controller.play(episode: next) }.buttonStyle(.bordered)
                        }
                    }
                }
                .padding(28)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            case .ended where controller.nextEpisode == nil:
                Button {
                    controller.togglePause()
                } label: {
                    Label("重新播放", systemImage: "arrow.counterclockwise")
                        .font(.system(size: 14, weight: .semibold))
                        .padding(.horizontal, 18).padding(.vertical, 10)
                        .background(.ultraThinMaterial, in: Capsule())
                }
                .buttonStyle(.plain)
            case .paused where !state.isSeeking:
                Image(systemName: "pause.fill")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundStyle(.white.opacity(0.9))
                    .frame(width: 72, height: 72)
                    .background(.black.opacity(0.35), in: Circle())
                    .allowsHitTesting(false)
            default:
                EmptyView()
            }
        }
        .allowsHitTesting({ if case .failed = state.status { return true }; if case .ended = state.status { return true }; return false }())
    }
}

struct OSDPill: View {
    let message: OSDMessage

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: symbol)
            Text(text).monospacedDigit()
        }
        .font(.system(size: 13, weight: .semibold))
        .padding(.horizontal, 14).padding(.vertical, 8)
        .background(.ultraThinMaterial, in: Capsule())
        .allowsHitTesting(false)
    }

    private var symbol: String {
        switch message {
        case .seek: "arrow.left.and.right"
        case let .seekDelta(delta, _): delta < 0 ? "gobackward" : "goforward"
        case let .volume(level, muted): muted ? "speaker.slash.fill" : level == 0 ? "speaker.fill" : level < 50 ? "speaker.wave.1.fill" : "speaker.wave.2.fill"
        case .speed: "gauge.with.needle"
        case .text: "info.circle"
        }
    }

    private var text: String {
        switch message {
        case let .seek(seconds): Formatters.clock(seconds)
        case let .seekDelta(delta, target): "\(delta > 0 ? "+" : "")\(Int(delta))s · \(Formatters.clock(target))"
        case let .volume(level, muted): muted ? "靜音" : "音量 \(level)%"
        case let .speed(speed): String(format: "%.2g×", speed)
        case let .text(text): text
        }
    }
}

struct ResumePill: View {
    let seconds: Int
    var restart: () -> Void
    var dismiss: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "play.circle.fill").foregroundStyle(Theme.accent)
            Text("從 \(Formatters.clock(Double(seconds))) 繼續").font(.system(size: 12, weight: .semibold))
            Button("從頭播放", action: restart).buttonStyle(.plain).font(.system(size: 12)).foregroundStyle(.white.opacity(0.75))
            Button { dismiss() } label: { Image(systemName: "xmark").font(.system(size: 10, weight: .bold)) }
                .buttonStyle(.plain).foregroundStyle(.white.opacity(0.6)).accessibilityLabel("關閉")
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(.ultraThinMaterial, in: Capsule())
    }
}

struct PostPlayCard: View {
    let episode: PlayableEpisode
    /// nil when auto-next is off: the card is just an offer.
    let countdown: Int?
    var playNow: () -> Void
    var cancel: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            RemoteImage(url: episode.image, maxPixel: 320) { Rectangle().fill(Theme.animeGradient(episode.episodeID)) }
                .frame(width: 120, height: 68)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            VStack(alignment: .leading, spacing: 4) {
                Text(countdown.map { "下一集 · \($0) 秒後" } ?? "下一集").font(.system(size: 11)).foregroundStyle(.white.opacity(0.7))
                Text("第 \(episode.number) 集").font(.system(size: 13, weight: .semibold))
                if let title = episode.displayTitle { Text(title).font(.system(size: 11)).foregroundStyle(.white.opacity(0.8)).lineLimit(1) }
                HStack(spacing: 8) {
                    Button("立即播放", systemImage: "play.fill", action: playNow).buttonStyle(.borderedProminent).controlSize(.small)
                    Button("取消", action: cancel).buttonStyle(.bordered).controlSize(.small)
                }
                .padding(.top, 2)
            }
        }
        .padding(12)
        .frame(width: 320, alignment: .leading)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

struct TechInfoOverlay: View {
    let state: PlayerState

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            row("視訊", "\(state.videoCodec) \(Int(state.videoSize.width))×\(Int(state.videoSize.height)) \(String(format: "%.3g", state.fps)) fps")
            row("解碼", state.hwdec.isEmpty || state.hwdec == "no" ? "軟體" : state.hwdec)
            row("音訊", state.audioCodec)
            row("位元率", state.videoBitrate > 0 ? String(format: "%.1f Mbps", state.videoBitrate / 1_000_000) : "—")
            row("快取", String(format: "%.1fs", state.cacheSeconds))
            row("速度", String(format: "%.2g×", state.speed))
            row("來源", state.stage.label)
            if state.isHDR { row("HDR", "是") }
        }
        .font(.system(size: 11, design: .monospaced))
        .padding(10)
        .background(.black.opacity(0.6), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .allowsHitTesting(false)
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack(spacing: 8) {
            Text(label).foregroundStyle(.white.opacity(0.55)).frame(width: 44, alignment: .leading)
            Text(value)
        }
    }
}

struct HelpOverlay: View {
    let keymap: PlayerKeymap
    var dismiss: () -> Void

    private var groups: [(String, [PlayerAction])] {
        let grouped = Dictionary(grouping: PlayerAction.allCases, by: \.group)
        return ["播放", "音量", "字幕 / 音訊", "介面", "彈幕", "擷取"].compactMap { title in
            grouped[title].map { (title, $0) }
        }
    }

    var body: some View {
        ZStack {
            Color.black.opacity(0.55).onTapGesture(perform: dismiss)
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text("快捷鍵").font(.system(size: 16, weight: .bold))
                    Spacer()
                    Text("可在 設定 › 播放器 重新綁定").font(.system(size: 11)).foregroundStyle(.white.opacity(0.6))
                    Button { dismiss() } label: { Image(systemName: "xmark") }.buttonStyle(.plain).keyboardShortcut(.cancelAction)
                }
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], alignment: .leading, spacing: 18) {
                    ForEach(groups, id: \.0) { title, actions in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(title).font(.system(size: 11, weight: .bold)).foregroundStyle(.white.opacity(0.55))
                            ForEach(actions, id: \.self) { action in
                                HStack {
                                    Text(action.label).font(.system(size: 12))
                                    Spacer()
                                    HStack(spacing: 4) {
                                        ForEach(keymap.chords(for: action).prefix(2), id: \.self) { chord in
                                            Text(chord.display).font(.system(size: 11, weight: .semibold, design: .rounded))
                                                .padding(.horizontal, 6).padding(.vertical, 2)
                                                .background(.white.opacity(0.12), in: RoundedRectangle(cornerRadius: 4))
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .padding(24)
            .frame(maxWidth: 820)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .padding(40)
        }
    }
}
