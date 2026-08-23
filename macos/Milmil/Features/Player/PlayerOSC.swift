import MilmilAPI
import MilmilPlayer
import SwiftUI

/// Floating bottom controls. Degrades by width: under ~760 pt the secondary
/// buttons collapse into the ⋯ menu.
struct PlayerOSC: View {
    let controller: PlayerController
    let model: PlayerWindowModel
    /// Width of the picture area, measured by the surface (not by the OSC,
    /// whose own width is what we are trying to bound).
    var availableWidth: CGFloat = 1000
    @State private var volumeExpanded = false

    private var state: PlayerState { controller.state }
    private var compact: Bool { availableWidth < 820 }

    var body: some View {
        VStack(spacing: 8) {
            SeekBar(controller: controller)
            HStack(spacing: compact ? 8 : 12) {
                transport
                timeLabel
                Spacer(minLength: 8)
                trailing
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(.white.opacity(0.08), lineWidth: 0.5))
        .padding(.horizontal, 20)
        .frame(maxWidth: .infinity)
        .tint(.white)
    }

    private var transport: some View {
        HStack(spacing: 6) {
            OSCButton(symbol: "backward.end.fill", label: String(localized: "上一集"), disabled: controller.previousEpisode == nil) { controller.playPrevious() }
            OSCButton(symbol: "gobackward.10", label: String(localized: "後退 10 秒")) { controller.seek(by: -10) }
            Button { controller.togglePause() } label: {
                Image(systemName: state.paused || state.status == .ended ? "play.fill" : "pause.fill")
                    .font(.system(size: 18, weight: .bold))
                    .frame(width: 40, height: 40)
                    .background(.white.opacity(0.14), in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(state.paused ? String(localized: "播放") : String(localized: "暫停"))
            OSCButton(symbol: "goforward.10", label: String(localized: "前進 10 秒")) { controller.seek(by: 10) }
            OSCButton(symbol: "forward.end.fill", label: String(localized: "下一集"), disabled: controller.nextEpisode == nil) { controller.playNext() }
        }
    }

    private var timeLabel: some View {
        Button {
            model.showTimeRemaining.toggle()
        } label: {
            Text(timeText)
                .font(.system(size: 12, weight: .medium)).monospacedDigit()
                .foregroundStyle(.white.opacity(0.85))
        }
        .buttonStyle(.plain)
        .padding(.leading, 4)
    }

    private var timeText: String {
        let total = Formatters.clock(state.duration)
        return model.showTimeRemaining ? "−\(Formatters.clock(state.remaining)) / \(total)" : "\(Formatters.clock(state.timePos)) / \(total)"
    }

    private var trailing: some View {
        HStack(spacing: compact ? 6 : 10) {
            volumeControl
            if !compact {
                speedMenu
                subtitleMenu
                audioMenu
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
                DanmakuSettingsView(controller: controller).preferredColorScheme(.dark)
            }
            if compact { overflowMenu }
            if model.embedded {
                OSCButton(symbol: "rectangle.expand.vertical", label: String(localized: "劇院模式（T）")) { model.perform(.theater) }
                OSCButton(symbol: "macwindow.badge.plus", label: String(localized: "獨立視窗")) { model.toggleMini() }
            } else {
                OSCButton(symbol: "sidebar.right", label: String(localized: "側欄"), active: model.inspectorShown) { model.inspectorShown.toggle() }
                OSCButton(symbol: model.isMini ? "pip.exit" : "pip.enter", label: String(localized: "迷你播放器"), active: model.isMini) { model.toggleMini() }
            }
            OSCButton(
                symbol: model.isFullscreen ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right",
                label: String(localized: "全螢幕")
            ) { model.toggleFullscreen() }
        }
    }

    private var volumeControl: some View {
        HStack(spacing: 6) {
            OSCButton(symbol: volumeSymbol, label: state.muted ? String(localized: "取消靜音") : String(localized: "靜音")) { controller.toggleMute() }
            if volumeExpanded || compact == false {
                Slider(value: Binding(get: { state.muted ? 0 : state.volume }, set: { controller.setVolume($0) }), in: 0...130)
                    .controlSize(.mini)
                    .frame(width: volumeExpanded ? 90 : 70)
            }
        }
        .onHover { volumeExpanded = $0 }
    }

    private var volumeSymbol: String {
        if state.muted || state.volume == 0 { return "speaker.slash.fill" }
        return state.volume < 50 ? "speaker.wave.1.fill" : "speaker.wave.2.fill"
    }

    private var speedMenu: some View {
        OSCPopover(label: String(format: "%.2g×", state.speed), help: String(localized: "播放速度"), width: 40) {
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
        .disabled(state.audioTracks.count < 2)
    }

    private var overflowMenu: some View {
        OSCPopover(symbol: "ellipsis", help: String(localized: "更多")) {
            Text("速度").font(.system(size: 10, weight: .bold)).foregroundStyle(Theme.Text.tertiary).padding(.horizontal, 8)
            HStack(spacing: 4) {
                ForEach([0.5, 0.75, 1, 1.25, 1.5, 2], id: \.self) { speed in
                    Button(String(format: "%.2g×", speed)) { controller.setSpeed(speed) }
                        .buttonStyle(.bordered).controlSize(.mini)
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
            OSCPopoverRow(title: String(localized: "截圖"), symbol: "camera") { controller.screenshot(withSubtitles: false) }
            OSCPopoverRow(title: String(localized: "技術資訊"), symbol: "info.circle") { model.techInfoShown.toggle() }
            OSCPopoverRow(title: String(localized: "快捷鍵"), symbol: "keyboard") { model.helpShown.toggle() }
        }
    }
}

/// An OSC button that opens a SwiftUI popover. Unlike `Menu`, it has no
/// AppKit popup button underneath, so its width never grows with the
/// widest item title (which is what clipped the OSC inside the watch page).
struct OSCPopover<Content: View>: View {
    var symbol: String?
    var label: String?
    let help: String
    var width: CGFloat = 30
    @ViewBuilder var content: () -> Content
    @State private var shown = false

    var body: some View {
        Button {
            shown.toggle()
        } label: {
            Group {
                if let symbol {
                    Image(systemName: symbol).font(.system(size: 15, weight: .semibold))
                } else {
                    Text(label ?? "").font(.system(size: 12, weight: .semibold)).monospacedDigit()
                }
            }
            .foregroundStyle(.white.opacity(0.9))
            .frame(width: width, height: 30)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
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
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(active ? Theme.accent : .white.opacity(disabled ? 0.3 : 0.9))
                .frame(width: 30, height: 30)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .help(label)
        .accessibilityLabel(label)
    }
}

/// Timeline with cache shading, chapter / OP-ED marks, hover time and
/// thumbnail peek, and drag-to-seek that commits on release.
struct SeekBar: View {
    let controller: PlayerController
    @State private var hoverFraction: CGFloat?
    @State private var dragFraction: CGFloat?
    @State private var hovering = false

    private var state: PlayerState { controller.state }

    var body: some View {
        GeometryReader { proxy in
            let width = proxy.size.width
            let shown = dragFraction ?? CGFloat(state.fraction)
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.18)).frame(height: hovering ? 6 : 4)
                Capsule().fill(.white.opacity(0.28)).frame(width: width * CGFloat(state.cacheFraction), height: hovering ? 6 : 4)
                ForEach(state.segments) { segment in
                    let start = width * CGFloat(state.duration > 0 ? segment.startTime / state.duration : 0)
                    let end = width * CGFloat(state.duration > 0 ? segment.endTime / state.duration : 0)
                    Capsule().fill(Color(hex: 0xFBBF24).opacity(0.55)).frame(width: max(2, end - start), height: hovering ? 6 : 4).offset(x: start)
                }
                ForEach(state.chapters) { chapter in
                    let x = width * CGFloat(state.duration > 0 ? chapter.time / state.duration : 0)
                    Rectangle().fill(.white.opacity(0.5)).frame(width: 1.5, height: 8).offset(x: x)
                }
                Capsule().fill(Theme.accent).frame(width: width * shown, height: hovering ? 6 : 4)
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
                    .onChanged { value in dragFraction = min(1, max(0, value.location.x / width)) }
                    .onEnded { value in
                        let fraction = min(1, max(0, value.location.x / width))
                        dragFraction = nil
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
