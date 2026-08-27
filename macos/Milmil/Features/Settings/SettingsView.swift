import MilmilAPI
import SwiftUI

/// `Settings` scene (⌘,): System Settings-style sidebar. Everything that
/// the web also stores lives in the shared server preferences; the few
/// desktop-only knobs live in `UserDefaults`.
enum SettingsTab: String, CaseIterable, Identifiable {
    case general, player, subtitles, danmaku, keyboard, offline, integrations, notifications, account, server, services, about

    var id: Self { self }

    /// Sidebar groups: how it looks and plays · the account and its
    /// connections · about.
    static let groups: [[SettingsTab]] = [
        [.general, .player, .subtitles, .danmaku, .keyboard, .offline],
        [.integrations, .notifications, .account, .server, .services],
        [.about],
    ]

    var title: String {
        switch self {
        case .general: String(localized: "一般")
        case .player: String(localized: "播放")
        case .subtitles: String(localized: "字幕")
        case .danmaku: String(localized: "彈幕")
        case .keyboard: String(localized: "快捷鍵")
        case .offline: String(localized: "離線")
        case .integrations: String(localized: "整合")
        case .notifications: String(localized: "通知")
        case .account: String(localized: "帳號")
        case .server: String(localized: "伺服器")
        case .services: String(localized: "服務")
        case .about: String(localized: "關於")
        }
    }

    var symbol: String {
        switch self {
        case .general: "gearshape"
        case .player: "play.rectangle"
        case .subtitles: "captions.bubble"
        case .danmaku: "text.bubble"
        case .keyboard: "keyboard"
        case .offline: "arrow.down.circle"
        case .integrations: "link"
        case .notifications: "bell.badge"
        case .account: "person.crop.circle"
        case .server: "server.rack"
        case .services: "gearshape.2"
        case .about: "info.circle"
        }
    }
}

struct SettingsView: View {
    @Environment(PlayerCoordinator.self) private var coordinator
    @Environment(SessionStore.self) private var sessionStore
    @Environment(SettingsNavigator.self) private var navigator
    @AppStorage(DesktopDefaults.theme) private var theme = Theme.Preference.dark.rawValue
    @State private var tab: SettingsTab = DevSnapshot.settingsTab.flatMap(SettingsTab.init(rawValue:)) ?? .general

    var body: some View {
        NavigationSplitView {
            List(selection: $tab) {
                ForEach(Array(SettingsTab.groups.enumerated()), id: \.offset) { _, group in
                    Section {
                        ForEach(group) { item in
                            Label(item.title, systemImage: item.symbol).tag(item)
                        }
                    }
                }
            }
            .listStyle(.sidebar)
            .navigationSplitViewColumnWidth(min: 180, ideal: 200, max: 240)
            .toolbar(removing: .sidebarToggle)
        } detail: {
            detail
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .navigationTitle(tab.title)
                // Detail column only: on the sidebar the hard edge draws a
                // hairline under the title bar.
                .hardTopScrollEdge()
        }
        .frame(minWidth: 780, idealWidth: 880, maxWidth: .infinity, minHeight: 540, idealHeight: 640, maxHeight: .infinity)
        .background(Theme.background)
        .preferredColorScheme((Theme.Preference(rawValue: theme) ?? .dark).colorScheme)
        .onChange(of: navigator.requestedTab, initial: true) { _, requested in
            guard let requested else { return }
            navigator.requestedTab = nil
            tab = requested
        }
    }

    @ViewBuilder
    private var detail: some View {
        switch tab {
        case .general: sessionGated { GeneralSettingsTab(session: $0) }
        case .player: sessionGated { PlayerSettingsTab(session: $0) }
        case .subtitles: sessionGated { SubtitleSettingsTab(session: $0) }
        case .danmaku: sessionGated { DanmakuSettingsView(session: $0, controller: coordinator.controller) }
        case .keyboard: sessionGated { KeyboardSettingsTab(session: $0) }
        case .offline: OfflineSettingsTab()
        case .integrations: sessionGated { IntegrationsSettingsTab(session: $0) }
        case .notifications: sessionGated { NotificationsSettingsTab(session: $0) }
        case .account: sessionGated { AccountSettingsTab(session: $0) }
        case .server: ServerSettingsTab()
        case .services: sessionGated { ServicesSettingsTab(session: $0) }
        case .about: AboutTab()
        }
    }

    @ViewBuilder
    private func sessionGated<Content: View>(@ViewBuilder _ content: (ServerSession) -> Content) -> some View {
        if let session = coordinator.session {
            content(session)
        } else {
            EmptyState(symbol: "person.crop.circle.badge.xmark", title: String(localized: "尚未登入"), message: String(localized: "這些設定與 web 共用，登入伺服器後才能編輯。"))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

/// Desktop-only defaults the server does not model.
enum DesktopDefaults {
    /// `AppLanguage` raw value; `AppleLanguages` carries the actual override.
    static let language = "general.language"
    /// `Theme.Preference` raw value — `dark` | `light` | `system`.
    static let theme = "general.theme"
    /// `monday` | `sunday` | `saturday`, like the web's UI store.
    static let weekStart = "schedule.weekStart"
    static let hardwareDecoding = "player.hwdec"
    static let pauseOnHeadphoneDisconnect = "player.pauseOnDisconnect"
    /// Loudness normalisation (`loudnorm`) for late-night viewing.
    static let nightMode = "player.nightMode"
    static let theater = "watch.theater"
    static let menuBarExtra = "menubar.enabled"
    /// Closing the last window parks the app in the menu bar instead of quitting.
    static let keepInMenuBar = "menubar.keepRunning"
    /// Where captures are filed; empty means ~/Pictures/milmil.
    static let screenshotFolder = "player.screenshotFolder"
    /// Show a save panel per capture instead of filing it straight away.
    static let screenshotAskWhere = "player.screenshotAskWhere"
}

struct PlayerSettingsTab: View {
    let session: ServerSession
    @Environment(PlayerCoordinator.self) private var coordinator
    @Environment(MenuBarController.self) private var menuBar
    @AppStorage(DesktopDefaults.hardwareDecoding) private var hwdec = "videotoolbox"
    @AppStorage(DesktopDefaults.pauseOnHeadphoneDisconnect) private var pauseOnDisconnect = true

    private var prefs: GlobalPreferences { session.preferences }

    var body: some View {
        Form {
            Section("解碼") {
                Picker("硬體解碼", selection: $hwdec) {
                    Text("VideoToolbox（建議）").tag("videotoolbox")
                    Text("自動（安全）").tag("auto-safe")
                    Text("關閉（軟體解碼）").tag("no")
                }
                Text("下一次開啟播放器時生效。").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
            }
            Section("播放") {
                Toggle("自動播放下一集", isOn: bind(\.autoNext))
                Toggle("自動跳過 OP", isOn: bind(\.autoSkipOp))
                Toggle("自動跳過 ED", isOn: bind(\.autoSkipEd))
                Toggle("拔除耳機時暫停", isOn: $pauseOnDisconnect)
                Picker("緩衝", selection: bind(\.bufferMode)) {
                    Text("自動").tag(BufferMode.auto)
                    Text("低").tag(BufferMode.low)
                    Text("平衡").tag(BufferMode.balanced)
                    Text("高").tag(BufferMode.high)
                }
            }
            Section("預設軌道") {
                TextField("字幕語言（BCP-47，例如 zh-TW）", text: optionalBind(\.defaultSubtitleLanguage))
                TextField("音訊語言（例如 ja）", text: optionalBind(\.defaultAudioLanguage))
                Text("mpv 會依此順序挑選內嵌軌；留空用 zh-TW → zh → en / ja。").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
            }
            Section("Anime4K") {
                Anime4KSettingsSection()
            }
            Section("yt-dlp") {
                YtDlpSettingsSection()
            }
            Section("選單列") {
                Toggle("在選單列顯示播放與下載狀態", isOn: Binding(get: { menuBar.isEnabled }, set: { menuBar.isEnabled = $0 }))
            }
            Section("本機路徑對應") {
                LocalMappingsEditor()
                Text("伺服器路徑前綴對應到本機掛載（例如 NAS）。命中且檔案存在時 mpv 直接開本機檔案，不經伺服器串流。")
                    .font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
            }
            Section("截圖") {
                ScreenshotSettingsSection()
            }
        }
        .formStyle(.grouped)
    }

    private func bind<T: Equatable>(_ keyPath: WritableKeyPath<GlobalPreferences, T>) -> Binding<T> {
        Binding(get: { prefs[keyPath: keyPath] }, set: { value in session.updatePreferences { $0[keyPath: keyPath] = value } })
    }

    private func optionalBind(_ keyPath: WritableKeyPath<GlobalPreferences, String?>) -> Binding<String> {
        Binding(get: { prefs[keyPath: keyPath] ?? "" }, set: { value in
            session.updatePreferences { $0[keyPath: keyPath] = value.trimmingCharacters(in: .whitespaces).isEmpty ? nil : value }
        })
    }
}

struct LocalMappingsEditor: View {
    @State private var mappings = LocalPathMappings.shared
    @State private var serverPrefix = ""
    @State private var localPrefix = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(mappings.mappings) { mapping in
                HStack(spacing: 8) {
                    Text(mapping.serverPrefix).font(.system(size: 12, design: .monospaced)).lineLimit(1).truncationMode(.middle)
                    Image(systemName: "arrow.right").font(.system(size: 10)).foregroundStyle(Theme.Text.tertiary)
                    Text(mapping.localPrefix).font(.system(size: 12, design: .monospaced)).lineLimit(1).truncationMode(.middle)
                    Spacer()
                    Image(systemName: FileManager.default.fileExists(atPath: mapping.localPrefix) ? "checkmark.circle.fill" : "questionmark.circle")
                        .foregroundStyle(FileManager.default.fileExists(atPath: mapping.localPrefix) ? Color(hex: 0x4ADE80) : Theme.Text.tertiary)
                        .help(FileManager.default.fileExists(atPath: mapping.localPrefix) ? String(localized: "本機路徑存在") : String(localized: "本機路徑目前不存在（未掛載？）"))
                    Button { mappings.remove(mapping) } label: { Image(systemName: "minus.circle") }.buttonStyle(.plain).foregroundStyle(Theme.Text.tertiary)
                }
            }
            HStack(spacing: 8) {
                TextField("伺服器路徑（如 /media）", text: $serverPrefix).textFieldStyle(.roundedBorder)
                Image(systemName: "arrow.right").font(.system(size: 10)).foregroundStyle(Theme.Text.tertiary)
                TextField("本機路徑", text: $localPrefix).textFieldStyle(.roundedBorder)
                Button("瀏覽…") {
                    let panel = NSOpenPanel()
                    panel.canChooseDirectories = true
                    panel.canChooseFiles = false
                    if panel.runModal() == .OK, let url = panel.url { localPrefix = url.path }
                }
                Button("加入") {
                    mappings.add(serverPrefix: serverPrefix, localPrefix: localPrefix)
                    serverPrefix = ""
                    localPrefix = ""
                }
                .disabled(serverPrefix.trimmingCharacters(in: .whitespaces).isEmpty || localPrefix.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .controlSize(.small)
        }
    }
}

struct AboutTab: View {
    private var version: String {
        let short = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"
        return "\(short) (\(build))"
    }

    var body: some View {
        // The header lives inside the Form so the whole page shares the
        // grouped form's background, like every other tab.
        Form {
            Section {
                VStack(spacing: 18) {
                    Image(nsImage: NSApp.applicationIconImage).resizable().frame(width: 96, height: 96)
                    VStack(spacing: 4) {
                        Text("milmil for macOS").font(.system(size: 18, weight: .bold))
                        Text("版本 \(version) · macOS 15+ · Apple Silicon").font(.system(size: 12)).foregroundStyle(Theme.Text.tertiary)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
            }
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            Section("元件與授權") {
                LabeledContent("mpv / FFmpeg（MPVKit 1.0.0）", value: "LGPL-2.1+")
                LabeledContent("SwiftyOpenCC / OpenCC", value: "MIT / Apache-2.0")
                LabeledContent("Anime4K（bloc97 v4.0.1）", value: "MIT")
                LabeledContent("Bangumi · AniList · 弹弹play开放弹幕网络", value: String(localized: "資料來源"))
            }
            Section {
                Link("GitHub：milmil", destination: URL(string: "https://github.com/milmil-dev/milmil")!)
                Link("回報問題", destination: URL(string: "https://github.com/milmil-dev/milmil/issues")!)
            }
        }
        .formStyle(.grouped)
    }
}

/// 截圖: where captures land, and whether each one asks first.
struct ScreenshotSettingsSection: View {
    @AppStorage(DesktopDefaults.screenshotFolder) private var folder = ""
    @AppStorage(DesktopDefaults.screenshotAskWhere) private var askWhere = false

    var body: some View {
        LabeledContent("儲存位置") {
            HStack(spacing: 8) {
                Text(displayPath)
                    .font(.system(size: 12, design: .monospaced))
                    .lineLimit(1).truncationMode(.middle)
                    .foregroundStyle(Theme.Text.secondary)
                Button("選擇…", action: pickFolder)
                if !folder.isEmpty {
                    Button("重設") { folder = "" }
                }
            }
        }
        .disabled(askWhere)
        Toggle(isOn: $askWhere) {
            VStack(alignment: .leading, spacing: 2) {
                Text("每次詢問儲存位置")
                Text("關閉時直接存進上面的資料夾，並在畫面角落顯示縮圖讓你複製、另存或刪除。")
                    .font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
            }
        }
        Button("在 Finder 顯示") {
            NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: PlayerController.screenshotDirectory())])
        }
    }

    private var displayPath: String {
        let path = PlayerController.screenshotDirectory()
        return path.replacingOccurrences(of: NSHomeDirectory(), with: "~")
    }

    private func pickFolder() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.canCreateDirectories = true
        panel.message = String(localized: "選擇截圖儲存位置")
        panel.directoryURL = URL(fileURLWithPath: PlayerController.screenshotDirectory())
        guard panel.runModal() == .OK, let url = panel.url else { return }
        folder = url.path
    }
}
