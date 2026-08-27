import AppKit
import MilmilAPI
import MilmilPlayer
import SwiftUI
import UniformTypeIdentifiers

/// Right-hand panel: episodes, danmaku (list + sources), subtitles, audio,
/// video. Fixed at 380 pt by the watch page, so the tab strip is a custom
/// equal-width row: a segmented `Picker` sizes to its labels, and six
/// English ones are wider than the column — the control overflowed the
/// frame symmetrically, covering the player's right edge and running off the
/// window.
struct PlayerInspector: View {
    enum Tab: String, CaseIterable, Identifiable {
        case episodes, danmaku, subtitles, audio, video
        var id: String { rawValue }
        var label: String {
            switch self {
            case .episodes: String(localized: "集數")
            case .danmaku: String(localized: "彈幕")
            case .subtitles: String(localized: "字幕")
            case .audio: String(localized: "音訊")
            case .video: String(localized: "視訊")
            }
        }
    }

    let controller: PlayerController
    @State private var tab: Tab = .episodes
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 0) {
            InspectorTabBar(tab: $tab)
                .padding(.horizontal, 12)
                .padding(.top, 12)
                .padding(.bottom, 4)
            // Each pane fades / drifts in under the strip as the pill slides.
            ZStack {
                switch tab {
                case .episodes: EpisodesTab(controller: controller)
                case .danmaku: DanmakuTab(controller: controller)
                case .subtitles: SubtitlesTab(controller: controller)
                case .audio: AudioTab(controller: controller)
                case .video: VideoTab(controller: controller)
                }
            }
            .id(tab)
            .transition(
                reduceMotion
                    ? .opacity
                    : .asymmetric(insertion: .opacity.combined(with: .offset(y: 6)), removal: .opacity)
            )
            .animation(reduceMotion ? nil : .easeOut(duration: 0.18), value: tab)
        }
        .background(Theme.background)
    }
}

/// Equal-width segments that shrink their label before they grow the row,
/// so the strip fits whatever the column gives it in every locale. The
/// selected pill is one shared view that slides between segments.
private struct InspectorTabBar: View {
    @Binding var tab: PlayerInspector.Tab
    @Namespace private var pill
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(spacing: 2) {
            ForEach(PlayerInspector.Tab.allCases) { item in
                let selected = item == tab
                Button {
                    withAnimation(reduceMotion ? nil : .snappy(duration: 0.24, extraBounce: 0.05)) { tab = item }
                } label: {
                    Text(item.label)
                        .font(.system(size: 12, weight: selected ? .semibold : .medium))
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 5)
                        .background {
                            if selected {
                                RoundedRectangle(cornerRadius: 6, style: .continuous)
                                    .fill(Theme.ink(0.12))
                                    .matchedGeometryEffect(id: "pill", in: pill)
                            }
                        }
                        .foregroundStyle(selected ? Theme.Text.primary : Theme.Text.secondary)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selected ? [.isSelected] : [])
            }
        }
        .padding(3)
        .background(Theme.ink(0.05), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

/// 彈幕: the timeline list, with the import / search sources one step away
/// instead of a top-level tab ("Sources" next to a video player reads as
/// video source). The step is a secondary text-tab row — a segmented
/// control directly under the segmented tab strip read as two competing
/// pickers.
private struct DanmakuTab: View {
    enum Section: String, CaseIterable, Identifiable {
        case list, sources
        var id: String { rawValue }
    }

    let controller: PlayerController
    @State private var section: Section = .list

    var body: some View {
        VStack(spacing: 0) {
            DanmakuSectionBar(section: $section, loaded: controller.danmakuStore?.totalCount ?? 0)
            switch section {
            case .list: DanmakuListTab(controller: controller)
            case .sources: DanmakuSourcesTab(controller: controller)
            }
        }
    }
}

/// Left-aligned text tabs with one accent underline that slides between
/// them; the list tab carries the loaded count so the row says something
/// even before it is touched. Sits on a hairline so the toolbar beneath
/// reads as belonging to the selected section.
private struct DanmakuSectionBar: View {
    @Binding var section: DanmakuTab.Section
    let loaded: Int
    @Namespace private var underline
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(alignment: .lastTextBaseline, spacing: 20) {
            tab(.list) {
                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    Text("清單")
                    if loaded > 0 {
                        Text(loaded.formatted())
                            .font(.system(size: 10, weight: .semibold))
                            .monospacedDigit()
                            .foregroundStyle(section == .list ? Theme.accent : Theme.Text.tertiary)
                    }
                }
            }
            tab(.sources) { Text("彈幕來源") }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.top, 6)
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.ink(0.06)).frame(height: 1) }
    }

    private func tab(_ item: DanmakuTab.Section, @ViewBuilder label: () -> some View) -> some View {
        let selected = item == section
        return Button {
            withAnimation(reduceMotion ? nil : .snappy(duration: 0.22, extraBounce: 0.02)) { section = item }
        } label: {
            label()
                .font(.system(size: 12, weight: selected ? .semibold : .medium))
                .foregroundStyle(selected ? Theme.Text.primary : Theme.Text.secondary)
                .padding(.vertical, 7)
                .overlay(alignment: .bottom) {
                    if selected {
                        Capsule()
                            .fill(Theme.accent)
                            .frame(height: 2)
                            .matchedGeometryEffect(id: "underline", in: underline)
                    }
                }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }
}

/// 集數: the shared series map (`SeriesMap`) above the list — one cell per
/// episode, current raised, click to jump — with a legend, a locate button
/// and a filter for long series.
private struct EpisodesTab: View {
    let controller: PlayerController
    @State private var filter: EpisodeFilter = .all
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let episodes = controller.episodes
        let currentID = controller.episode?.episodeID
        let shown = episodes.filter(filter.includes)
        ScrollViewReader { proxy in
            VStack(alignment: .leading, spacing: 0) {
                if episodes.isEmpty {
                    Text("還沒有集數資料")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(Theme.Text.tertiary)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                } else {
                    SeriesMap(episodes: episodes, currentID: currentID, filter: $filter, canLocate: shown.contains { $0.episodeID == currentID }) { id in
                        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.25)) { proxy.scrollTo(id, anchor: .center) }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 10)
                    .padding(.bottom, 6)
                }
                if shown.isEmpty, !episodes.isEmpty {
                    Text("沒有符合的集數")
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.Text.tertiary)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 24)
                    Spacer()
                } else {
                    List {
                        ForEach(shown) { episode in
                            let current = episode.episodeID == currentID
                            Button {
                                controller.play(episode: episode)
                            } label: {
                                InspectorEpisodeRow(episode: episode, still: controller.still(for: episode), current: current)
                            }
                            .buttonStyle(.plain)
                            .disabled(!episode.hasFile)
                            .listRowSeparator(.hidden)
                            .listRowInsets(EdgeInsets(top: 1, leading: 10, bottom: 1, trailing: 10))
                            .listRowBackground(Color.clear)
                            .id(episode.episodeID)
                        }
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                    .onAppear { if let currentID { proxy.scrollTo(currentID, anchor: .center) } }
                }
            }
        }
    }
}

/// One episode: still (or a number / calendar tile), number + status badges,
/// title — the web `EpisodeListItem` at sidebar density. Upcoming episodes
/// (no file, air date ahead) show the day and a countdown instead of an
/// ISO date pretending to be a title.
private struct InspectorEpisodeRow: View {
    let episode: PlayableEpisode
    let still: URL?
    let current: Bool

    private var airDay: Date? { Formatters.day(from: episode.airDate) }
    private var upcoming: Bool { !episode.hasFile && airDay.map { Formatters.daysUntil($0) > 0 } ?? false }

    var body: some View {
        HStack(spacing: 10) {
            // The row tint alone marks the current episode; a stroke on top
            // of a tinted tile plus an accent number was three accents for
            // one state.
            tile
                .frame(width: 88, height: 50)
                .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text("第 \(episode.number) 集")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.Text.primary)
                    if episode.progress?.completed == true {
                        Image(systemName: "checkmark.circle.fill").font(.system(size: 10)).foregroundStyle(Color(hex: 0x4ADE80))
                            .accessibilityLabel("看過了")
                    }
                    if let quality = episode.mediaFile?.resolutionLabel { badge(quality) }
                    if !episode.hasFile, !upcoming { badge(String(localized: "無檔案")) }
                }
                if upcoming, let airDay {
                    // One line says everything: "Airs in 4 days" (title too,
                    // when Bangumi already has it).
                    let when = Formatters.airsIn(airDay) ?? String(localized: "即將播出")
                    Text(episode.displayTitle.map { "\($0) · \(when)" } ?? when)
                        .font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary).lineLimit(2)
                } else if let title = episode.displayTitle {
                    Text(title).font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary).lineLimit(2)
                }
            }
            Spacer(minLength: 4)
        }
        .padding(6)
        // The tint is drawn by the row itself so it hugs the content exactly
        // (a `listRowBackground` follows the list's own insets instead).
        .background(current ? Theme.ink(0.07) : .clear, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .contentShape(Rectangle())
        .opacity(episode.hasFile ? 1 : 0.6)
    }

    /// Still when Bangumi has one; otherwise a quiet number tile, or the
    /// month / day for an episode that has not aired yet.
    @ViewBuilder
    private var tile: some View {
        ZStack(alignment: .bottom) {
            RemoteImage(url: still, maxPixel: 240) { placeholder }
            if let progress = episode.progress, progress.fraction > 0 {
                ProgressStripe(fraction: progress.completed ? 1 : progress.fraction)
            }
        }
    }

    private var placeholder: some View {
        ZStack {
            Rectangle().fill(Theme.ink(0.06))
            if upcoming, let airDay {
                // Calendar stub (web): month over a big day number.
                VStack(spacing: 0) {
                    Text(Formatters.monthShort(airDay).uppercased())
                        .font(.system(size: 9, weight: .semibold))
                        .tracking(0.8)
                        .foregroundStyle(Theme.Text.tertiary)
                    Text(Formatters.dayOfMonth(airDay))
                        .font(.system(size: 18, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(Theme.Text.secondary)
                }
            } else {
                Text(episode.number)
                    .font(.system(size: 16, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(current ? Theme.accent : Theme.Text.secondary)
            }
        }
    }

    private func badge(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 9, weight: .semibold))
            .foregroundStyle(Theme.Text.tertiary)
            .padding(.horizontal, 4).padding(.vertical, 1)
            .background(Theme.ink(0.08), in: RoundedRectangle(cornerRadius: 3, style: .continuous))
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
            Section {
                Toggle("夜間模式", isOn: Binding(get: { controller.nightMode }, set: { controller.setNightMode($0) }))
            } footer: {
                Text("壓縮動態範圍：爆炸聲小一點，對白清楚一點。深夜用。").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
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
                LabeledContent("硬體解碼", value: state.hwdec.isEmpty || state.hwdec == "no" ? String(localized: "關（軟體解碼）") : state.hwdec)
                LabeledContent("HDR", value: state.isHDR ? String(localized: "是（tone-mapping）") : String(localized: "否"))
                LabeledContent("串流", value: state.stage.localizedLabel)
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
            Section {
                Picker("睡眠計時器", selection: Binding(get: { controller.sleepTimerMode }, set: { controller.setSleepTimer($0) })) {
                    ForEach(SleepTimerMode.allCases, id: \.self) { mode in Text(mode.label).tag(mode) }
                }
                if let remaining = state.sleepTimerRemaining {
                    TimelineView(.periodic(from: .now, by: 1)) { _ in
                        LabeledContent("剩餘", value: Formatters.clock(max(0, (state.sleepTimerEndsAt?.timeIntervalSinceNow ?? remaining))))
                    }
                }
            } footer: {
                Text("時間到會用 10 秒慢慢淡出再暫停；「播完這集停止」唔會自動播下一集。").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
            }
            skipSection
            Section {
                Button("複製播放問題報告", systemImage: "doc.on.clipboard") { controller.copyPlaybackReport() }
            } footer: {
                Text("串流方式、解碼、掉幀與 mpv 記錄，貼到 issue 就好。").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
            }
        }
        .formStyle(.grouped)
        .scrollContentBackground(.hidden)
    }

    /// Learned OP/ED ranges for this series, and the pending suggestion.
    @ViewBuilder
    private var skipSection: some View {
        let learned = controller.learnedSkipsForSeries
        if controller.skipSuggestion != nil || !learned.isEmpty {
            Section {
                if let suggestion = controller.skipSuggestion {
                    LabeledContent(String(localized: "這段自動跳過？")) {
                        Text("\(Formatters.clock(suggestion.start)) → \(Formatters.clock(suggestion.end))").monospacedDigit()
                    }
                    HStack {
                        Button("記住") { controller.acceptSkipSuggestion() }
                        Button("不用") { controller.declineSkipSuggestion() }
                    }
                }
                ForEach(learned, id: \.self) { skip in
                    LabeledContent(String(localized: "已學會")) {
                        Text("\(Formatters.clock(skip.start)) → \(Formatters.clock(skip.end))").monospacedDigit()
                    }
                }
                if !learned.isEmpty {
                    Button("忘記這部作品的段落", role: .destructive) { controller.forgetLearnedSkips() }
                }
            } header: {
                Text("自動跳過（學習）")
            } footer: {
                Text("同一段你手動跳過兩次，播放器就會問要不要記住；沒有伺服器 OP/ED 資料的作品也跳得到。")
                    .font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
            }
        }
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
        menu.addItem(withTitle: state.paused ? String(localized: "播放") : String(localized: "暫停"), action: nil, keyEquivalent: "").target = nil
        menu.items.last?.setAction { controller.togglePause() }

        let subtitles = NSMenu()
        subtitles.addItem(withTitle: String(localized: "關閉"), state: state.subtitleID == nil) { controller.selectTrack(.sub, id: nil) }
        for track in state.subtitleTracks {
            subtitles.addItem(withTitle: track.displayName, state: state.subtitleID == track.id) { controller.selectTrack(.sub, id: track.id) }
        }
        subtitles.addItem(.separator())
        subtitles.addItem(withTitle: String(localized: "載入字幕檔…"), state: false) { openSubtitlePanel(controller: controller) }
        menu.addSubmenu(String(localized: "字幕"), subtitles)

        let audio = NSMenu()
        for track in state.audioTracks {
            audio.addItem(withTitle: track.displayName, state: state.audioID == track.id) { controller.selectTrack(.audio, id: track.id) }
        }
        menu.addSubmenu(String(localized: "音軌"), audio)

        let speed = NSMenu()
        for value in [0.5, 0.75, 1, 1.25, 1.5, 2] {
            speed.addItem(withTitle: String(format: "%.2g×", value), state: state.speed == value) { controller.setSpeed(value) }
        }
        menu.addSubmenu(String(localized: "速度"), speed)

        menu.addItem(.separator())
        menu.addItem(withTitle: String(localized: "截圖"), state: false) { controller.screenshot(withSubtitles: false) }
        menu.addItem(withTitle: String(localized: "截圖（含字幕）"), state: false) { controller.screenshot(withSubtitles: true) }
        menu.addItem(withTitle: String(localized: "截圖到剪貼簿"), state: false) { controller.screenshotToClipboard() }
        menu.addItem(.separator())
        menu.addItem(withTitle: model.isMini ? String(localized: "離開迷你播放器") : String(localized: "迷你播放器"), state: false) { model.toggleMini() }
        menu.addItem(withTitle: String(localized: "技術資訊"), state: model.techInfoShown) { model.techInfoShown.toggle() }
        menu.addItem(withTitle: String(localized: "快捷鍵…"), state: false) { model.helpShown = true }
        NSMenu.popUpContextMenu(menu, with: event, for: view)
    }

    @MainActor
    static func openSubtitlePanel(controller: PlayerController) {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = ["srt", "ass", "ssa", "vtt"].compactMap { UTType(filenameExtension: $0) }
        panel.allowsMultipleSelection = true
        panel.message = String(localized: "選擇要載入的字幕檔")
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
