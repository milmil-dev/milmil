import AppKit
import MilmilAPI
import MilmilPlayer
import SwiftUI
import UniformTypeIdentifiers

// The menu bar. Anything that needs the logged-in shell (navigation, the
// watch page's surface) arrives through focused scene values, so the items
// grey out when the key window has no such thing — the player window, the
// login screen — instead of silently doing nothing. App-level objects
// (session, player coordinator) are passed in directly.

/// Where the Help menu's「鍵盤快捷鍵…」lands. The Settings scene owns its
/// tab selection, so the request travels through this app-level object.
@Observable
final class SettingsNavigator {
    var requestedTab: SettingsTab?
}

// MARK: - milmil

/// Account items under Settings… in the application menu.
struct AccountCommands: Commands {
    let session: SessionStore

    var body: some Commands {
        CommandGroup(after: .appSettings) {
            Divider()
            Button("切換伺服器…") { session.switchToNoServer() }
                .disabled(session.phase.profile == nil)
            Button("登出") { Task { await session.logout() } }
                .disabled(!isReady)
        }
    }

    private var isReady: Bool {
        if case .ready = session.phase { return true }
        return false
    }
}

// MARK: - 檔案

struct FileCommands: Commands {
    @FocusedValue(Router.self) private var router
    let trailers: TrailerCoordinator
    /// Feeds the same queue as a `.torrent` dropped on the Dock icon.
    let importTorrents: ([URL]) -> Void

    var body: some Commands {
        CommandGroup(replacing: .newItem) {
            Button("新增下載…") { router?.requestAddDownload() }
                .keyboardShortcut("n", modifiers: .command)
                .disabled(router == nil)
            Button("匯入種子檔案…") { pickTorrents() }
                .keyboardShortcut("o", modifiers: .command)
                .disabled(router == nil)
            Divider()
            Button("開啟 URL…") { trailers.showOpenURL = true }
                .keyboardShortcut("o", modifiers: [.command, .shift])
        }
    }

    private func pickTorrents() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [UTType("org.bittorrent.torrent"), UTType(filenameExtension: "torrent")].compactMap { $0 }
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        panel.message = String(localized: "選擇要加入下載的種子檔案")
        guard panel.runModal() == .OK, !panel.urls.isEmpty else { return }
        importTorrents(panel.urls)
    }
}

// MARK: - 顯示方式

struct ViewCommands: Commands {
    @FocusedValue(Router.self) private var router
    @AppStorage(DesktopDefaults.theme) private var theme = Theme.Preference.dark.rawValue
    @AppStorage(DesktopDefaults.theater) private var theater = false

    var body: some Commands {
        CommandGroup(before: .sidebar) {
            Button("快速搜尋…") { router?.paletteShown.toggle() }
                .keyboardShortcut("k", modifiers: .command)
                .disabled(router == nil)
            // Bare `/` is handled by the shell's key monitor (a menu key
            // equivalent without modifiers would steal the character from
            // text fields); the item is here so the shortcut is discoverable.
            Button("搜尋（/）") { FocusSearch.perform(router) }
                .disabled(router == nil)
            Button("返回") { router?.pop() }
                .keyboardShortcut("[", modifiers: .command)
                .disabled(router?.path.isEmpty ?? true)
            Divider()
            Toggle("劇院模式", isOn: $theater)
                .keyboardShortcut("t", modifiers: [.command, .shift])
                .disabled(!isWatching)
            Picker("外觀", selection: $theme) {
                ForEach(Theme.Preference.allCases) { Text($0.label).tag($0.rawValue) }
            }
            Divider()
        }
    }

    /// Theater mode only means something on the watch page.
    private var isWatching: Bool {
        if case .watch = router?.path.last { return true }
        return false
    }
}

// MARK: - 前往

/// One item per sidebar tab, ⌘1…⌘9 in sidebar order; the current tab is
/// checked. Sections mirror the sidebar's groups.
struct GoCommands: Commands {
    @FocusedValue(Router.self) private var router

    var body: some Commands {
        CommandMenu("前往") {
            ForEach(Array(Destination.sections.enumerated()), id: \.offset) { index, section in
                if index > 0 { Divider() }
                ForEach(section.items) { destination in
                    Toggle(isOn: binding(destination)) { Text(destination.title) }
                        .keyboardShortcut(Self.shortcut(destination), modifiers: .command)
                        .disabled(router == nil)
                }
            }
        }
    }

    private func binding(_ destination: Destination) -> Binding<Bool> {
        Binding(
            get: { router?.destination == destination && router?.path.isEmpty == true },
            set: { _ in router?.select(destination) }
        )
    }

    private static func shortcut(_ destination: Destination) -> KeyEquivalent {
        let index = Destination.allCases.firstIndex(of: destination) ?? 0
        return KeyEquivalent(Character(String(index + 1)))
    }
}

// MARK: - 播放

/// Transport, speed, volume, subtitles, danmaku and capture for whatever the
/// shared player is showing — embedded watch page or the pop-out window.
/// Shortcuts are all ⌘-modified: the bare keys (Space, ←/→, m…) stay with
/// the player's own keymap so text fields elsewhere keep them.
struct PlaybackCommands: Commands {
    let player: PlayerCoordinator
    @FocusedValue(PlayerWindowModel.self) private var playerWindow
    @FocusedValue(Router.self) private var router

    private static let speeds: [Double] = [0.5, 0.75, 1, 1.25, 1.5, 2]

    var body: some Commands {
        CommandMenu("播放") {
            Button("播放最近一套嘅下一集") {
                guard let session = CurrentSession.shared.session else { return }
                Task { await NextEpisodeAction.perform(session: session, player: player, router: router) }
            }
            .keyboardShortcut("n", modifiers: [.command, .shift])
            .disabled(CurrentSession.shared.session == nil)
            Divider()
            transport
            Divider()
            seeking
            Divider()
            episodes
            Divider()
            speed
            Button("A-B 循環") { controller?.toggleABLoop() }
                .keyboardShortcut("l", modifiers: [.command, .option])
                .disabled(!isLoaded)
            Divider()
            volume
            Divider()
            subtitles
            audio
            Toggle("彈幕", isOn: Binding(
                get: { controller?.danmakuEnabled ?? false },
                set: { controller?.setDanmakuEnabled($0) }
            ))
            .keyboardShortcut("d", modifiers: [.command, .option])
            .disabled(!isLoaded)
            Divider()
            capture
        }
    }

    private var controller: PlayerController? { player.controller }
    private var state: PlayerState? { controller?.state }
    private var isLoaded: Bool { state?.duration ?? 0 > 0 }

    @ViewBuilder
    private var transport: some View {
        if state?.paused == false {
            Button("暫停") { controller?.togglePause() }
                .keyboardShortcut("p", modifiers: [.command, .option])
        } else {
            Button("播放") { controller?.togglePause() }
                .keyboardShortcut("p", modifiers: [.command, .option])
                .disabled(!isLoaded)
        }
        Button("從頭播放") { controller?.restartFromBeginning() }
            .disabled(!isLoaded)
    }

    @ViewBuilder
    private var seeking: some View {
        Button("後退 5 秒") { controller?.seek(by: -5) }
            .keyboardShortcut(.leftArrow, modifiers: [.command, .option])
            .disabled(!isLoaded)
        Button("前進 5 秒") { controller?.seek(by: 5) }
            .keyboardShortcut(.rightArrow, modifiers: [.command, .option])
            .disabled(!isLoaded)
        Button("後退 30 秒") { controller?.seek(by: -30) }
            .keyboardShortcut(.leftArrow, modifiers: [.command, .option, .shift])
            .disabled(!isLoaded)
        Button("前進 30 秒") { controller?.seek(by: 30) }
            .keyboardShortcut(.rightArrow, modifiers: [.command, .option, .shift])
            .disabled(!isLoaded)
        Button("跳過 OP / ED") { controller?.skipCurrentSegment() }
            .keyboardShortcut("s", modifiers: [.command, .option])
            .disabled(state?.currentSegment == nil)
    }

    @ViewBuilder
    private var episodes: some View {
        Button("上一集") { controller?.playPrevious() }
            .keyboardShortcut(.leftArrow, modifiers: [.command, .control])
            .disabled(controller?.previousEpisode == nil)
        Button("下一集") { controller?.playNext() }
            .keyboardShortcut(.rightArrow, modifiers: [.command, .control])
            .disabled(controller?.nextEpisode == nil)
    }

    private var speed: some View {
        Menu("播放速度") {
            Picker("播放速度", selection: Binding(
                get: { state?.speed ?? 1 },
                set: { controller?.setSpeed($0) }
            )) {
                ForEach(Self.speeds, id: \.self) { value in
                    Text(verbatim: "\(value.formatted())×").tag(value)
                }
            }
            .pickerStyle(.inline)
            .labelsHidden()
            Button("速度 −0.25×") { controller?.adjustSpeed(by: -0.25) }
                .keyboardShortcut("[", modifiers: [.command, .option])
            Button("速度 +0.25×") { controller?.adjustSpeed(by: 0.25) }
                .keyboardShortcut("]", modifiers: [.command, .option])
            Button("重設速度") { controller?.setSpeed(1) }
                .keyboardShortcut("0", modifiers: [.command, .option])
        }
        .disabled(!isLoaded)
    }

    @ViewBuilder
    private var volume: some View {
        Button("音量 +") { controller?.adjustVolume(by: 5) }
            .keyboardShortcut(.upArrow, modifiers: [.command, .option])
            .disabled(controller == nil)
        Button("音量 −") { controller?.adjustVolume(by: -5) }
            .keyboardShortcut(.downArrow, modifiers: [.command, .option])
            .disabled(controller == nil)
        Toggle("靜音", isOn: Binding(
            get: { state?.muted ?? false },
            set: { _ in controller?.toggleMute() }
        ))
        .keyboardShortcut("m", modifiers: [.command, .option])
        .disabled(controller == nil)
    }

    private var subtitles: some View {
        Menu("字幕") {
            Toggle("顯示字幕", isOn: Binding(
                get: { state?.subtitlesVisible ?? true },
                set: { _ in controller?.toggleSubtitles() }
            ))
            .keyboardShortcut("v", modifiers: [.command, .option])
            Picker("字幕軌", selection: Binding(
                get: { state?.subtitleID ?? -1 },
                set: { controller?.selectTrack(.sub, id: $0 < 0 ? nil : $0) }
            )) {
                Text("無").tag(Int64(-1))
                ForEach(state?.subtitleTracks ?? []) { Text($0.displayName).tag($0.id) }
            }
            .pickerStyle(.inline)
            .labelsHidden()
            Button("字幕延遲 −0.1s") { controller?.adjustSubtitleDelay(by: -0.1) }
            Button("字幕延遲 +0.1s") { controller?.adjustSubtitleDelay(by: 0.1) }
            Divider()
            Button("載入外部字幕…") { pickSubtitle() }
        }
        .disabled(!isLoaded)
    }

    private var audio: some View {
        Menu("音訊") {
            Picker("音軌", selection: Binding(
                get: { state?.audioID ?? -1 },
                set: { controller?.selectTrack(.audio, id: $0 < 0 ? nil : $0) }
            )) {
                ForEach(state?.audioTracks ?? []) { Text($0.displayName).tag($0.id) }
            }
            .pickerStyle(.inline)
            .labelsHidden()
            Button("下一個音軌") { controller?.cycleAudio() }
        }
        .disabled(!isLoaded)
    }

    @ViewBuilder
    private var capture: some View {
        Button("截圖") { controller?.screenshot(withSubtitles: false) }
            .disabled(!isLoaded)
        Button("截圖（含字幕）") { controller?.screenshot(withSubtitles: true) }
            .disabled(!isLoaded)
        Button("截圖到剪貼簿") { controller?.screenshotToClipboard() }
            .keyboardShortcut("c", modifiers: [.command, .option])
            .disabled(!isLoaded)
    }

    private func pickSubtitle() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = ["srt", "ass", "ssa", "vtt"].compactMap { UTType(filenameExtension: $0) }
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        guard panel.runModal() == .OK, let url = panel.url else { return }
        controller?.addExternalSubtitle(fileURL: url)
    }
}

// MARK: - 視窗

/// Music.app's shape: the main window on ⌘0, then the player's own modes.
struct WindowCommands: Commands {
    let player: PlayerCoordinator
    @FocusedValue(PlayerWindowModel.self) private var playerWindow
    @Environment(\.openWindow) private var openWindow

    var body: some Commands {
        CommandGroup(before: .singleWindowList) {
            Button { openWindow(id: "main") } label: { Text(verbatim: "milmil") }
                .keyboardShortcut("0", modifiers: .command)
            Divider()
            if player.presentation == .window {
                Button("拉回主視窗") {
                    for window in NSApp.windows where window.identifier?.rawValue == "player" { window.close() }
                }
            } else {
                Button("在獨立視窗播放") {
                    player.popOut()
                    openWindow(id: "player")
                }
                .disabled(player.controller == nil)
            }
            Button("播放器全螢幕") { playerWindow?.toggleFullscreen() }
                .keyboardShortcut("f", modifiers: [.command, .shift])
                .disabled(!hasSurface)
            Button("迷你播放器") { playerWindow?.toggleMini() }
                .keyboardShortcut("m", modifiers: [.command, .shift])
                .disabled(!hasSurface || playerWindow?.embedded == true)
            Button("播放器側欄") { playerWindow?.inspectorShown.toggle() }
                .keyboardShortcut("i", modifiers: [.command, .shift])
                .disabled(!hasSurface || playerWindow?.embedded == true)
            Divider()
        }
    }

    /// The focused surface is live: the watch page's model stays in the
    /// scene while playback is popped out, but is detached from any window.
    private var hasSurface: Bool {
        playerWindow?.window != nil && player.controller != nil
    }
}

// MARK: - 說明

struct HelpCommands: Commands {
    let settings: SettingsNavigator
    @Environment(\.openURL) private var openURL
    @Environment(\.openSettings) private var openSettings

    var body: some Commands {
        CommandGroup(replacing: .help) {
            Button("milmil 說明") { openURL(URL(string: "https://milmil.vercel.app")!) }
            Button("鍵盤快捷鍵…") {
                settings.requestedTab = .keyboard
                openSettings()
            }
            .keyboardShortcut("/", modifiers: .command)
            Divider()
            Button("回報問題…") { openURL(URL(string: "https://github.com/milmil-dev/milmil/issues")!) }
            Button("版本更新記錄") { openURL(URL(string: "https://github.com/milmil-dev/milmil/releases")!) }
            Button("GitHub 專案") { openURL(URL(string: "https://github.com/milmil-dev/milmil")!) }
        }
    }
}

/// `/` anywhere: the Search page focuses its field, any other page opens the
/// palette. Shared by the menu item and the shell's key monitor.
enum FocusSearch {
    @MainActor static func perform(_ router: Router?) {
        guard let router else { return }
        if router.destination == .search, router.path.isEmpty {
            NotificationCenter.default.post(name: .milmilFocusSearch, object: nil)
        } else {
            router.paletteShown = true
        }
    }
}
