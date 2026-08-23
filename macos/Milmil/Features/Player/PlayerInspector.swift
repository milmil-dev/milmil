import AppKit
import MilmilAPI
import MilmilPlayer
import SwiftUI
import UniformTypeIdentifiers

/// Right-hand panel: episodes, subtitles, audio, video, danmaku (Phase 3).
struct PlayerInspector: View {
    enum Tab: String, CaseIterable, Identifiable {
        case episodes, danmaku, sources, subtitles, audio, video
        var id: String { rawValue }
        var label: String {
            switch self {
            case .episodes: "集數"
            case .danmaku: "彈幕"
            case .sources: "來源"
            case .subtitles: "字幕"
            case .audio: "音訊"
            case .video: "視訊"
            }
        }
    }

    let controller: PlayerController
    @State private var tab: Tab = .episodes

    var body: some View {
        VStack(spacing: 0) {
            Picker("", selection: $tab) {
                ForEach(Tab.allCases) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .padding(12)
            Divider()
            switch tab {
            case .episodes: EpisodesTab(controller: controller)
            case .subtitles: SubtitlesTab(controller: controller)
            case .audio: AudioTab(controller: controller)
            case .video: VideoTab(controller: controller)
            case .danmaku: DanmakuListTab(controller: controller)
            case .sources: DanmakuSourcesTab(controller: controller)
            }
        }
        .background(Theme.background)
    }
}

private struct EpisodesTab: View {
    let controller: PlayerController

    var body: some View {
        ScrollViewReader { proxy in
            List {
                ForEach(controller.episodes) { episode in
                    let current = episode.episodeID == controller.episode?.episodeID
                    Button {
                        controller.play(episode: episode)
                    } label: {
                        HStack(spacing: 10) {
                            ZStack(alignment: .bottom) {
                                RemoteImage(url: episode.image, maxPixel: 240) { Rectangle().fill(Theme.animeGradient(episode.episodeID)) }
                                if let progress = episode.progress, progress.fraction > 0 {
                                    ProgressStripe(fraction: progress.completed ? 1 : progress.fraction)
                                }
                            }
                            .frame(width: 88, height: 50)
                            .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: 5, style: .continuous)
                                    .strokeBorder(current ? Theme.accent : .clear, lineWidth: 1.5)
                            )
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 6) {
                                    Text("第 \(episode.number) 集").font(.system(size: 12, weight: .semibold))
                                    if episode.progress?.completed == true {
                                        Image(systemName: "checkmark.circle.fill").font(.system(size: 10)).foregroundStyle(Color(hex: 0x4ADE80))
                                    }
                                    if current { Image(systemName: "play.fill").font(.system(size: 9)).foregroundStyle(Theme.accent) }
                                }
                                Text(episode.displayTitle ?? episode.airDate ?? "").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary).lineLimit(2)
                            }
                            Spacer()
                        }
                        .padding(.vertical, 2)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(episode.mediaFile == nil)
                    .opacity(episode.mediaFile == nil ? 0.45 : 1)
                    .listRowBackground(current ? Theme.accent.opacity(0.1) : Color.clear)
                    .id(episode.episodeID)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .onAppear { if let id = controller.episode?.episodeID { proxy.scrollTo(id, anchor: .center) } }
        }
    }
}

private struct SubtitlesTab: View {
    let controller: PlayerController

    var body: some View {
        let state = controller.state
        Form {
            Section("字幕軌") {
                Picker("主字幕", selection: trackBinding(state.subtitleID) { controller.selectTrack(.sub, id: $0) }) {
                    Text("關閉").tag(Int64(-1))
                    ForEach(state.subtitleTracks) { Text($0.displayName).tag($0.id) }
                }
                Picker("第二字幕", selection: trackBinding(state.secondarySubtitleID) { controller.selectSecondarySubtitle(id: $0) }) {
                    Text("關閉").tag(Int64(-1))
                    ForEach(state.subtitleTracks) { Text($0.displayName).tag($0.id) }
                }
                Toggle("顯示字幕", isOn: Binding(get: { state.subtitlesVisible }, set: { _ in controller.toggleSubtitles() }))
            }
            Section("時間") {
                LabeledContent("延遲") {
                    HStack(spacing: 6) {
                        Stepper(
                            String(format: "%+.1f s", state.subDelay),
                            value: Binding(get: { state.subDelay }, set: { controller.setSubtitleDelay($0) }),
                            in: -30...30, step: 0.1
                        )
                        .monospacedDigit()
                        Button("重設") { controller.setSubtitleDelay(0) }.disabled(state.subDelay == 0)
                    }
                }
            }
            Section("外部字幕") {
                ForEach(state.sidecarSubtitles) { file in
                    LabeledContent(file.filename) {
                        Text(file.language.isEmpty ? file.format : "\(file.language) · \(file.format)").foregroundStyle(Theme.Text.tertiary)
                    }
                }
                Button("載入字幕檔…", systemImage: "doc.badge.plus") { PlayerContextMenu.openSubtitlePanel(controller: controller) }
            }
            Section {
                Text("樣式與預設字體依「設定 › 字幕」，與 web 共用；ASS 字幕保留原始樣式時不套用。")
                    .font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
            }
        }
        .formStyle(.grouped)
        .scrollContentBackground(.hidden)
    }
}

private struct AudioTab: View {
    let controller: PlayerController

    var body: some View {
        let state = controller.state
        Form {
            Section("音軌") {
                Picker("音軌", selection: trackBinding(state.audioID) { controller.selectTrack(.audio, id: $0) }) {
                    ForEach(state.audioTracks) { Text($0.displayName).tag($0.id) }
                }
            }
            Section("音量") {
                Slider(value: Binding(get: { state.volume }, set: { controller.setVolume($0) }), in: 0...130) { Text("音量") }
                Toggle("靜音", isOn: Binding(get: { state.muted }, set: { _ in controller.toggleMute() }))
            }
            Section("時間") {
                LabeledContent("音訊延遲") {
                    Stepper(
                        String(format: "%+.1f s", state.audioDelay),
                        value: Binding(get: { state.audioDelay }, set: { controller.setAudioDelay($0) }),
                        in: -10...10, step: 0.1
                    )
                    .monospacedDigit()
                }
            }
        }
        .formStyle(.grouped)
        .scrollContentBackground(.hidden)
    }
}

private struct VideoTab: View {
    let controller: PlayerController
    @State private var aspect = "-1"
    @State private var deinterlace = false
    @State private var interpolation = false

    var body: some View {
        let state = controller.state
        Form {
            Section("資訊") {
                LabeledContent("編碼", value: "\(state.videoCodec) · \(Int(state.videoSize.width))×\(Int(state.videoSize.height))")
                LabeledContent("影格率", value: String(format: "%.3g fps", state.fps))
                LabeledContent("硬體解碼", value: state.hwdec.isEmpty || state.hwdec == "no" ? "關（軟體解碼）" : state.hwdec)
                LabeledContent("HDR", value: state.isHDR ? "是（tone-mapping）" : "否")
                LabeledContent("串流", value: state.stage.label)
            }
            Section("畫面") {
                Picker("比例", selection: $aspect) {
                    Text("原始").tag("-1")
                    Text("16:9").tag("16:9")
                    Text("4:3").tag("4:3")
                    Text("2.35:1").tag("2.35:1")
                }
                .onChange(of: aspect) { _, value in controller.player?.set("video-aspect-override", value) }
                Toggle("去交錯", isOn: $deinterlace).onChange(of: deinterlace) { _, on in controller.player?.set("deinterlace", on) }
                Toggle("動態插幀 (interpolation)", isOn: $interpolation).onChange(of: interpolation) { _, on in
                    controller.player?.set("interpolation", on)
                    controller.player?.set("video-sync", on ? "display-resample" : "audio")
                }
                Button("旋轉 90°", systemImage: "rotate.right") {
                    try? controller.player?.command(["cycle-values", "video-rotate", "90", "180", "270", "0"])
                }
            }
            Section("速度") {
                Slider(value: Binding(get: { state.speed }, set: { controller.setSpeed($0) }), in: 0.25...3, step: 0.25) {
                    Text(String(format: "%.2g×", state.speed))
                }
            }
        }
        .formStyle(.grouped)
        .scrollContentBackground(.hidden)
    }
}

/// `-1` stands for "no track" in pickers, since `Picker` wants a non-optional tag.
@MainActor
private func trackBinding(_ current: Int64?, set: @escaping (Int64?) -> Void) -> Binding<Int64> {
    Binding(get: { current ?? -1 }, set: { set($0 < 0 ? nil : $0) })
}

/// Right-click menu and the open-subtitle panel, shared by OSC and inspector.
enum PlayerContextMenu {
    @MainActor
    static func show(controller: PlayerController, model: PlayerWindowModel, in view: NSView, with event: NSEvent) {
        let state = controller.state
        let menu = NSMenu()
        menu.addItem(withTitle: state.paused ? "播放" : "暫停", action: nil, keyEquivalent: "").target = nil
        menu.items.last?.setAction { controller.togglePause() }

        let subtitles = NSMenu()
        subtitles.addItem(withTitle: "關閉", state: state.subtitleID == nil) { controller.selectTrack(.sub, id: nil) }
        for track in state.subtitleTracks {
            subtitles.addItem(withTitle: track.displayName, state: state.subtitleID == track.id) { controller.selectTrack(.sub, id: track.id) }
        }
        subtitles.addItem(.separator())
        subtitles.addItem(withTitle: "載入字幕檔…", state: false) { openSubtitlePanel(controller: controller) }
        menu.addSubmenu("字幕", subtitles)

        let audio = NSMenu()
        for track in state.audioTracks {
            audio.addItem(withTitle: track.displayName, state: state.audioID == track.id) { controller.selectTrack(.audio, id: track.id) }
        }
        menu.addSubmenu("音軌", audio)

        let speed = NSMenu()
        for value in [0.5, 0.75, 1, 1.25, 1.5, 2] {
            speed.addItem(withTitle: String(format: "%.2g×", value), state: state.speed == value) { controller.setSpeed(value) }
        }
        menu.addSubmenu("速度", speed)

        menu.addItem(.separator())
        menu.addItem(withTitle: "截圖", state: false) { controller.screenshot(withSubtitles: false) }
        menu.addItem(withTitle: "截圖（含字幕）", state: false) { controller.screenshot(withSubtitles: true) }
        menu.addItem(withTitle: "截圖到剪貼簿", state: false) { controller.screenshotToClipboard() }
        menu.addItem(.separator())
        menu.addItem(withTitle: model.isMini ? "離開迷你播放器" : "迷你播放器", state: false) { model.toggleMini() }
        menu.addItem(withTitle: "技術資訊", state: model.techInfoShown) { model.techInfoShown.toggle() }
        menu.addItem(withTitle: "快捷鍵…", state: false) { model.helpShown = true }
        NSMenu.popUpContextMenu(menu, with: event, for: view)
    }

    @MainActor
    static func openSubtitlePanel(controller: PlayerController) {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = ["srt", "ass", "ssa", "vtt"].compactMap { UTType(filenameExtension: $0) }
        panel.allowsMultipleSelection = true
        panel.message = "選擇要載入的字幕檔"
        panel.begin { response in
            guard response == .OK else { return }
            for url in panel.urls { controller.addExternalSubtitle(fileURL: url) }
        }
    }
}

/// Closure-backed `NSMenuItem`s so the menu can call straight into the controller.
private final class ClosureMenuTarget: NSObject {
    let handler: () -> Void
    init(_ handler: @escaping () -> Void) { self.handler = handler }
    @objc func fire() { handler() }
}

private extension NSMenuItem {
    private static var targetKey = 0

    func setAction(_ handler: @escaping () -> Void) {
        let target = ClosureMenuTarget(handler)
        objc_setAssociatedObject(self, &Self.targetKey, target, .OBJC_ASSOCIATION_RETAIN)
        self.target = target
        action = #selector(ClosureMenuTarget.fire)
    }
}

private extension NSMenu {
    func addItem(withTitle title: String, state on: Bool, handler: @escaping () -> Void) {
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        item.state = on ? .on : .off
        item.setAction(handler)
        addItem(item)
    }

    func addSubmenu(_ title: String, _ submenu: NSMenu) {
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        item.submenu = submenu
        addItem(item)
    }
}
