import AppKit
import MilmilAPI
import MilmilPlayer
import SwiftUI

/// Bottom controls in the YouTube / Bilibili layout the web player uses: a
/// full-width timeline, then one row with the transport, volume and clock on
/// the left and the toggles on the right. No card of its own — it sits on the
/// picture's bottom gradient. Under ~720 pt the track menus collapse into ⋯.
struct PlayerOSC: View {
    let controller: PlayerController
    let model: PlayerWindowModel
    /// Width of the picture area, measured by the surface (not by the OSC,
    /// whose own width is what we are trying to bound).
    var availableWidth: CGFloat = 0
    @State private var volumeExpanded = false
    @AppStorage(Anime4K.presetKey) private var anime4KPreset = Anime4K.Preset.off.rawValue

    private var state: PlayerState { controller.state }
    private var compact: Bool { availableWidth > 0 && availableWidth < 720 }

    var body: some View {
        VStack(spacing: 0) {
            SeekBar(controller: controller)
                .padding(.horizontal, 12)
            HStack(spacing: 0) {
                leading
                Spacer(minLength: 8)
                trailing
            }
            .padding(.horizontal, 6)
        }
        .tint(.white)
    }

    private var leading: some View {
        HStack(spacing: 0) {
            Button { controller.togglePause() } label: {
                Image(systemName: state.paused || state.status == .ended ? "play.fill" : "pause.fill")
                    .font(.system(size: 20, weight: .semibold))
                    .contentTransition(.symbolEffect(.replace.downUp))
                    .frame(width: 40, height: 36)
                    .contentShape(Rectangle())
            }
            .buttonStyle(OSCHoverButtonStyle())
            .accessibilityLabel(state.paused ? String(localized: "播放") : String(localized: "暫停"))
            OSCButton(symbol: "forward.end.fill", label: String(localized: "下一集"), disabled: controller.nextEpisode == nil) { controller.playNext() }
            volumeControl
            timeLabel
        }
    }

    private var timeLabel: some View {
        Button {
            model.showTimeRemaining.toggle()
        } label: {
            (Text(model.showTimeRemaining ? "−\(Formatters.clock(state.remaining))" : Formatters.clock(state.timePos))
                + Text(" / ").foregroundStyle(.white.opacity(0.45))
                + Text(Formatters.clock(state.duration)))
                .font(.system(size: 13, weight: .medium)).monospacedDigit()
                .foregroundStyle(.white.opacity(0.92))
                .lineLimit(1)
                .fixedSize()
        }
        .buttonStyle(.plain)
        .padding(.leading, 6)
    }

    private var trailing: some View {
        HStack(spacing: 0) {
            if !compact {
                qualityMenu
                sourceMenu
                speedMenu
                subtitleMenu
                if state.audioTracks.count > 1 { audioMenu }
                captureButton
            }
            OSCButton(
                symbol: controller.danmakuEnabled ? "text.bubble.fill" : "text.bubble",
                label: String(localized: "彈幕（D，右鍵設定）"),
                active: controller.danmakuEnabled
            ) {
                controller.setDanmakuEnabled(!controller.danmakuEnabled)
            }
            .contextMenu {
                Button("彈幕設定…", systemImage: "slider.horizontal.3") { model.danmakuSettingsShown = true }
            }
            .popover(isPresented: Binding(get: { model.danmakuSettingsShown }, set: { model.danmakuSettingsShown = $0 }), arrowEdge: .top) {
                DanmakuSettingsView(controller: controller)
                    .scrollContentBackground(.hidden) // let the popover material through
                    .frame(minWidth: 360, minHeight: 480)
                    .preferredColorScheme(.dark)
            }
            if !compact { preferencesMenu }
            if compact { overflowMenu }
            if model.embedded {
                OSCButton(symbol: "rectangle.expand.vertical", label: String(localized: "劇院模式（T）")) { model.perform(.theater) }
                OSCButton(symbol: "macwindow.badge.plus", label: String(localized: "獨立視窗")) { model.toggleMini() }
            } else {
                OSCButton(symbol: "sidebar.right", label: String(localized: "側欄"), active: model.inspectorShown) { model.inspectorShown.toggle() }
                OSCButton(
                    symbol: model.isMini ? "pip.exit" : "pip.enter",
                    label: String(localized: "迷你播放器"),
                    active: model.isMini,
                    morphs: true
                ) { model.toggleMini() }
            }
            OSCButton(
                symbol: model.isFullscreen ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right",
                label: String(localized: "全螢幕")
            ) { model.toggleFullscreen() }
        }
    }

    /// Quality: the resolution is the button, matching the speed control's
    /// text label, and it opens the facts about the picture. Separate from
    /// the source control — one describes the file, the other where it is
    /// read from, and conflating them said nothing you could act on.
    private var qualityMenu: some View {
        OSCPopover(
            label: state.resolutionLabel.isEmpty ? String(localized: "畫質") : state.resolutionLabel,
            help: String(localized: "畫質"),
            width: 52
        ) {
            if !state.resolutionLabel.isEmpty {
                OSCPopoverFact(title: state.resolutionLabel, symbol: "rectangle.on.rectangle")
            }
            if state.isHDR {
                OSCPopoverFact(title: "HDR", symbol: "sun.max")
            }
            if !state.videoCodec.isEmpty {
                OSCPopoverFact(title: state.videoCodec, symbol: "square.stack.3d.down.right")
            }
            Divider().padding(.vertical, 4)
            OSCPopoverRow(title: String(localized: "技術資訊"), symbol: "info.circle") { model.techInfoShown.toggle() }
        }
    }

    /// Source: which rung of the stream ladder is feeding the picture, and the
    /// one control that can change it. The symbol tracks the current rung, so
    /// "playing off my own disk" vs "the server is transcoding" reads without
    /// opening anything.
    private var sourceMenu: some View {
        OSCPopover(symbol: state.stage.symbol, help: String(localized: "播放來源")) {
            ForEach(controller.availableStages, id: \.self) { stage in
                OSCPopoverRow(title: stage.localizedLabel, symbol: stage.symbol, selected: state.stage == stage) {
                    controller.selectStage(stage)
                }
            }
        }
    }

    /// The gear every player has: the habits and picture settings you change
    /// mid-episode, plus the things that were only reachable by right-click or
    /// keyboard (danmaku settings, tech info, shortcuts). Sleep timer and
    /// Anime4K had no player surface at all before this.
    private var preferencesMenu: some View {
        OSCPopover(symbol: "gearshape", help: String(localized: "播放器偏好設定")) {
            OSCPopoverSection(String(localized: "播放"))
            OSCPopoverRow(title: String(localized: "自動播放下一集"), symbol: "forward.end", selected: controller.autoNextEnabled) {
                controller.setAutoNext(!controller.autoNextEnabled)
            }
            OSCPopoverRow(title: String(localized: "自動跳過 OP"), symbol: "forward", selected: controller.autoSkipOpEnabled) {
                controller.setAutoSkipOp(!controller.autoSkipOpEnabled)
            }
            OSCPopoverRow(title: String(localized: "自動跳過 ED"), symbol: "forward.frame", selected: controller.autoSkipEdEnabled) {
                controller.setAutoSkipEd(!controller.autoSkipEdEnabled)
            }

            Divider().padding(.vertical, 4)
            OSCPopoverSection(String(localized: "睡眠計時器"))
            ForEach(SleepTimerMode.allCases, id: \.self) { mode in
                OSCPopoverRow(title: mode.label, symbol: "moon.zzz", selected: controller.sleepTimerMode == mode) {
                    controller.setSleepTimer(mode)
                }
            }

            Divider().padding(.vertical, 4)
            OSCPopoverSection(String(localized: "畫質增強"))
            ForEach(Anime4K.Preset.allCases.filter { $0 != .custom }) { preset in
                OSCPopoverRow(title: preset.label, symbol: "wand.and.sparkles", selected: anime4KPreset == preset.rawValue) {
                    anime4KPreset = preset.rawValue
                    controller.applyAnime4K()
                }
            }

            Divider().padding(.vertical, 4)
            OSCPopoverRow(title: String(localized: "彈幕設定…"), symbol: "slider.horizontal.3") { model.danmakuSettingsShown = true }
            OSCPopoverRow(title: String(localized: "技術資訊"), symbol: "info.circle") { model.techInfoShown.toggle() }
            OSCPopoverRow(title: String(localized: "快捷鍵"), symbol: "keyboard") { model.helpShown.toggle() }
        }
    }

    /// Frame capture (Bilibili's 截图). Click grabs the clean frame and asks
    /// where to save it; the context menu offers the subtitle-burned and
    /// clipboard variants.
    private var captureButton: some View {
        OSCButton(symbol: "camera", label: String(localized: "截圖")) { controller.screenshot(withSubtitles: false) }
            .contextMenu {
                Button("截圖", systemImage: "camera") { controller.screenshot(withSubtitles: false) }
                Button("截圖（含字幕）", systemImage: "captions.bubble") { controller.screenshot(withSubtitles: true) }
                Button("截圖到剪貼簿", systemImage: "doc.on.clipboard") { controller.screenshotToClipboard() }
            }
    }

    private var volumeControl: some View {
        HStack(spacing: 0) {
            OSCButton(symbol: volumeSymbol, label: state.muted ? String(localized: "取消靜音") : String(localized: "靜音"), morphs: true) { controller.toggleMute() }
            // The slider slides out of the speaker on hover (YouTube), so the
            // row stays short until the pointer asks for it.
            VolumeBar(value: state.muted ? 0 : state.volume, maximum: 130) { controller.setVolume($0) }
                .frame(width: volumeExpanded ? 64 : 0, alignment: .leading)
                .opacity(volumeExpanded ? 1 : 0)
                .clipped()
                .padding(.trailing, volumeExpanded ? 8 : 0)
        }
        .onHover { volumeExpanded = $0 }
        .animation(.easeOut(duration: 0.15), value: volumeExpanded)
    }

    private var volumeSymbol: String {
        if state.muted || state.volume == 0 { return "speaker.slash.fill" }
        return state.volume < 50 ? "speaker.wave.1.fill" : "speaker.wave.2.fill"
    }

    private var speedMenu: some View {
        OSCPopover(label: String(format: "%.2g×", state.speed), help: String(localized: "播放速度"), width: 44) {
            ForEach([0.5, 0.75, 1, 1.25, 1.5, 2], id: \.self) { speed in
                OSCPopoverRow(title: String(format: "%.2g×", speed), selected: state.speed == speed) { controller.setSpeed(speed) }
            }
        }
    }

    private var subtitleMenu: some View {
        OSCPopover(symbol: state.subtitleID == nil ? "captions.bubble" : "captions.bubble.fill", help: String(localized: "字幕")) {
            OSCPopoverRow(title: String(localized: "關閉"), selected: state.subtitleID == nil) { controller.selectTrack(.sub, id: nil) }
            ForEach(state.subtitleTracks) { track in
                OSCPopoverRow(title: track.displayName, selected: state.subtitleID == track.id) { controller.selectTrack(.sub, id: track.id) }
            }
            Divider().padding(.vertical, 4)
            OSCPopoverRow(title: String(localized: "字幕延遲 −0.1s"), symbol: "minus.circle") { controller.adjustSubtitleDelay(by: -0.1) }
            OSCPopoverRow(title: String(localized: "字幕延遲 +0.1s"), symbol: "plus.circle") { controller.adjustSubtitleDelay(by: 0.1) }
            OSCPopoverRow(title: String(localized: "載入外部字幕…"), symbol: "doc.badge.plus") { PlayerContextMenu.openSubtitlePanel(controller: controller) }
        }
    }

    private var audioMenu: some View {
        OSCPopover(symbol: "waveform", help: String(localized: "音軌")) {
            ForEach(state.audioTracks) { track in
                OSCPopoverRow(title: track.displayName, selected: state.audioID == track.id) { controller.selectTrack(.audio, id: track.id) }
            }
        }
    }

    private var overflowMenu: some View {
        OSCPopover(symbol: "ellipsis", help: String(localized: "更多")) {
            Text("速度").font(.system(size: 10, weight: .bold)).foregroundStyle(Theme.Text.tertiary).padding(.horizontal, 8)
            HStack(spacing: 4) {
                ForEach([0.5, 0.75, 1, 1.25, 1.5, 2], id: \.self) { speed in
                    Button(String(format: "%.2g×", speed)) { controller.setSpeed(speed) }
                        .glassButtonStyle().controlSize(.mini)
                        .tint(state.speed == speed ? Theme.accent : .white)
                }
            }
            .padding(.horizontal, 8).padding(.bottom, 4)
            Divider().padding(.vertical, 4)
            OSCPopoverRow(title: String(localized: "字幕：關閉"), selected: state.subtitleID == nil) { controller.selectTrack(.sub, id: nil) }
            ForEach(state.subtitleTracks) { track in
                OSCPopoverRow(title: String(localized: "字幕：\(track.displayName)"), selected: state.subtitleID == track.id) { controller.selectTrack(.sub, id: track.id) }
            }
            if state.audioTracks.count > 1 {
                Divider().padding(.vertical, 4)
                ForEach(state.audioTracks) { track in
                    OSCPopoverRow(title: String(localized: "音軌：\(track.displayName)"), selected: state.audioID == track.id) { controller.selectTrack(.audio, id: track.id) }
                }
            }
            Divider().padding(.vertical, 4)
            OSCPopoverRow(title: String(localized: "上一集"), symbol: "backward.end.fill") { controller.playPrevious() }
                .disabled(controller.previousEpisode == nil)
            OSCPopoverRow(title: String(localized: "截圖"), symbol: "camera") { controller.screenshot(withSubtitles: false) }
            OSCPopoverRow(title: String(localized: "技術資訊"), symbol: "info.circle") { model.techInfoShown.toggle() }
            OSCPopoverRow(title: String(localized: "快捷鍵"), symbol: "keyboard") { model.helpShown.toggle() }
        }
    }
}

/// The horizontal volume slider that slides out of the speaker button. Drawn
/// to match the timeline (white on translucent) rather than an AppKit slider.
struct VolumeBar: View {
    let value: Double
    let maximum: Double
    let onChange: (Double) -> Void
    @State private var hovering = false

    var body: some View {
        GeometryReader { proxy in
            let width = proxy.size.width
            let fraction = maximum > 0 ? CGFloat(min(1, max(0, value / maximum))) : 0
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.25)).frame(height: 3)
                Capsule().fill(.white).frame(width: width * fraction, height: 3)
                Circle().fill(.white).frame(width: 12, height: 12).offset(x: width * fraction - 6)
            }
            .frame(height: 36)
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0).onChanged { drag in
                onChange(Double(min(1, max(0, drag.location.x / width))) * maximum)
            })
        }
        .frame(height: 36)
        .accessibilityElement()
        .accessibilityLabel(String(localized: "音量"))
        .accessibilityValue("\(Int(value))")
    }
}

/// An OSC button that opens a SwiftUI popover. Unlike `Menu`, it has no
/// AppKit popup button underneath, so its width never grows with the
/// widest item title (which is what clipped the OSC inside the watch page).
struct OSCPopover<Content: View>: View {
    var symbol: String?
    var label: String?
    let help: String
    var width: CGFloat = 36
    @ViewBuilder var content: () -> Content
    @State private var shown = false
    @State private var hovering = false
    @State private var bounce = 0

    var body: some View {
        Button {
            shown.toggle()
        } label: {
            Group {
                if let symbol {
                    Image(systemName: symbol).font(.system(size: 16, weight: .semibold))
                } else {
                    Text(label ?? "").font(.system(size: 13, weight: .semibold)).monospacedDigit()
                }
            }
            .foregroundStyle(.white.opacity(hovering || shown ? 1 : 0.85))
            .symbolEffect(.bounce.up.byLayer, options: .nonRepeating, value: bounce)
            .frame(width: width, height: 36)
            .contentShape(Rectangle())
        }
        .buttonStyle(OSCHoverButtonStyle(raised: shown))
        .onHover { over in
            hovering = over
            if over { bounce += 1 }
        }
        .help(help)
        .accessibilityLabel(help)
        .popover(isPresented: $shown, arrowEdge: .top) {
            ScrollView {
                VStack(alignment: .leading, spacing: 2) { content() }
                    .padding(6)
            }
            .frame(minWidth: 180, maxWidth: 320)
            .frame(maxHeight: 360)
            .preferredColorScheme(.dark)
        }
    }
}

/// A small caps-ish heading inside a popover list.
struct OSCPopoverSection: View {
    let title: String

    init(_ title: String) { self.title = title }

    var body: some View {
        Text(title)
            .font(.system(size: 10, weight: .bold))
            .foregroundStyle(Theme.Text.tertiary)
            .padding(.horizontal, 8)
            .padding(.top, 2)
            .padding(.bottom, 1)
    }
}

/// A read-only line in a popover: same metrics as `OSCPopoverRow` so the list
/// stays aligned, but it does not look or behave like a button.
struct OSCPopoverFact: View {
    let title: String
    let symbol: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: symbol)
                .font(.system(size: 11, weight: .bold))
                .frame(width: 14)
                .foregroundStyle(.secondary)
            Text(title).font(.system(size: 12)).lineLimit(1)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 8).padding(.vertical, 5)
        .accessibilityElement(children: .combine)
    }
}

struct OSCPopoverRow: View {
    let title: String
    var symbol: String?
    var selected = false
    var action: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Button {
            action()
            dismiss()
        } label: {
            HStack(spacing: 8) {
                Image(systemName: selected ? "checkmark" : (symbol ?? ""))
                    .font(.system(size: 11, weight: .bold))
                    .frame(width: 14)
                    .foregroundStyle(selected ? Theme.accent : .secondary)
                Text(title).font(.system(size: 12)).lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 8).padding(.vertical, 5)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct OSCButton: View {
    let symbol: String
    let label: String
    var active = false
    var disabled = false
    /// The symbol changes with state (volume level, pip in/out): cross-fade
    /// the glyph layers instead of swapping images.
    var morphs = false
    var action: () -> Void
    @State private var hovering = false
    @State private var bounce = 0

    var body: some View {
        Button {
            bounce += 1
            action()
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(active ? Theme.accent : .white.opacity(disabled ? 0.3 : (hovering ? 1 : 0.85)))
                .symbolEffect(.bounce.up.byLayer, options: .nonRepeating, value: bounce)
                .contentTransition(morphs ? .symbolEffect(.replace.downUp) : .identity)
                .frame(width: 36, height: 36)
                .contentShape(Rectangle())
        }
        .buttonStyle(OSCHoverButtonStyle(raised: active))
        .disabled(disabled)
        .onHover { over in
            hovering = over
            if over, !disabled { bounce += 1 }
        }
        .help(label)
        .accessibilityLabel(label)
    }
}

/// The OSC's shared hover / press feel: a soft pill rises under the glyph
/// on hover and the whole button eases up a few percent; pressing squashes
/// it back. Reduce Motion keeps the pill and drops the scaling.
struct OSCHoverButtonStyle: ButtonStyle {
    /// Already-on controls (sidebar shown, popover open) keep a faint pill so
    /// hover reads as "brighter", not "appears".
    var raised = false
    @State private var hovering = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        let lift = hovering && isEnabled
        configuration.label
            .background {
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .fill(.white.opacity(configuration.isPressed ? 0.18 : (lift ? 0.13 : (raised ? 0.07 : 0))))
                    .padding(2)
            }
            .scaleEffect(reduceMotion ? 1 : (configuration.isPressed ? 0.92 : (lift ? 1.06 : 1)))
            .animation(reduceMotion ? .easeOut(duration: 0.12) : .snappy(duration: 0.18, extraBounce: 0.08), value: lift)
            .animation(reduceMotion ? nil : .snappy(duration: 0.12), value: configuration.isPressed)
            .onHover { hovering = $0 }
    }
}

/// Timeline with cache shading, chapter / OP-ED marks, hover time and
/// thumbnail peek, and drag-to-seek that commits on release. A drag ticks
/// (trackpad haptics) when it crosses a chapter or an OP/ED edge, and snaps
/// to the live position with a softer tick when it passes within 4 pt of it.
struct SeekBar: View {
    let controller: PlayerController
    @State private var hoverFraction: CGFloat?
    @State private var dragFraction: CGFloat?
    @State private var hovering = false
    @State private var snappedToLive = false

    private var state: PlayerState { controller.state }

    /// Chapter times and OP/ED edges as timeline fractions.
    private var markerFractions: [CGFloat] {
        guard state.duration > 0 else { return [] }
        var marks = state.chapters.map { CGFloat($0.time / state.duration) }
        for segment in state.segments {
            marks.append(CGFloat(segment.startTime / state.duration))
            marks.append(CGFloat(segment.endTime / state.duration))
        }
        return marks.filter { $0 > 0 && $0 < 1 }
    }

    private func drag(to x: CGFloat, width: CGFloat) {
        var fraction = min(1, max(0, x / width))
        let live = CGFloat(state.fraction)
        if abs(fraction - live) * width < 4 {
            if !snappedToLive {
                snappedToLive = true
                NSHapticFeedbackManager.defaultPerformer.perform(.levelChange, performanceTime: .now)
            }
            fraction = live
        } else {
            snappedToLive = false
        }
        if let previous = dragFraction {
            let low = min(previous, fraction)
            let high = max(previous, fraction)
            if markerFractions.contains(where: { $0 > low && $0 <= high }) {
                NSHapticFeedbackManager.defaultPerformer.perform(.alignment, performanceTime: .now)
            }
        }
        dragFraction = fraction
    }

    var body: some View {
        GeometryReader { proxy in
            let width = proxy.size.width
            let shown = dragFraction ?? CGFloat(state.fraction)
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.18)).frame(height: hovering ? 5 : 3)
                Capsule().fill(.white.opacity(0.28)).frame(width: width * CGFloat(state.cacheFraction), height: hovering ? 5 : 3)
                ForEach(state.segments) { segment in
                    let start = width * CGFloat(state.duration > 0 ? segment.startTime / state.duration : 0)
                    let end = width * CGFloat(state.duration > 0 ? segment.endTime / state.duration : 0)
                    Capsule().fill(Color(hex: 0xFBBF24).opacity(0.55)).frame(width: max(2, end - start), height: hovering ? 5 : 3).offset(x: start)
                }
                ForEach(state.chapters) { chapter in
                    let x = width * CGFloat(state.duration > 0 ? chapter.time / state.duration : 0)
                    Rectangle().fill(.white.opacity(0.5)).frame(width: 1.5, height: 8).offset(x: x)
                }
                Capsule().fill(Theme.accent).frame(width: width * shown, height: hovering ? 5 : 3)
                Circle().fill(.white).frame(width: hovering ? 14 : 0, height: 14).shadow(radius: 3).offset(x: width * shown - 7)
                if let hoverFraction, hovering {
                    hoverBubble(fraction: hoverFraction, width: width)
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
                    .onChanged { value in drag(to: value.location.x, width: width) }
                    .onEnded { value in
                        drag(to: value.location.x, width: width)
                        let fraction = dragFraction ?? min(1, max(0, value.location.x / width))
                        dragFraction = nil
                        snappedToLive = false
                        controller.seek(to: Double(fraction) * state.duration)
                    }
            )
        }
        .frame(height: 20)
        .animation(.easeOut(duration: 0.12), value: hovering)
    }

    private func hoverBubble(fraction: CGFloat, width: CGFloat) -> some View {
        let seconds = Double(fraction) * state.duration
        let cue = state.thumbnails?.cue(at: seconds)
        let bubbleWidth: CGFloat = cue == nil ? 60 : 168
        let x = min(max(fraction * width - bubbleWidth / 2, 0), width - bubbleWidth)
        return VStack(spacing: 4) {
            if let cue, let track = state.thumbnails {
                SpriteThumbnail(spriteURL: track.spriteURL, rect: cue.rect, width: 160)
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(.white.opacity(0.2), lineWidth: 0.5))
            }
            Text(Formatters.clock(seconds))
                .font(.system(size: 11, weight: .semibold)).monospacedDigit()
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(.black.opacity(0.7), in: Capsule())
        }
        .frame(width: bubbleWidth)
        .offset(x: x, y: cue == nil ? -32 : -118)
        .allowsHitTesting(false)
    }
}

/// One cell of the server's thumbnail sprite sheet.
struct SpriteThumbnail: View {
    let spriteURL: URL
    let rect: CGRect
    let width: CGFloat
    @State private var image: CGImage?

    var body: some View {
        let scale = rect.width > 0 ? width / rect.width : 1
        ZStack {
            Color.black
            if let image {
                Image(decorative: image, scale: 1)
                    .resizable()
                    .frame(width: CGFloat(image.width) * scale, height: CGFloat(image.height) * scale)
                    .offset(x: -rect.minX * scale, y: -rect.minY * scale)
            }
        }
        .frame(width: width, height: rect.height * scale, alignment: .topLeading)
        .clipped()
        .task(id: spriteURL) { image = await ImageCache.shared.image(for: spriteURL, maxPixel: 4096) }
    }
}
