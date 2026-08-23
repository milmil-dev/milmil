import MilmilAPI
import SwiftUI

/// `Settings` scene (⌘,): System Settings-style tabs. Everything that the
/// web also stores lives in the shared server preferences; the few
/// desktop-only knobs live in `UserDefaults`.
struct SettingsView: View {
    @Environment(PlayerCoordinator.self) private var coordinator
    @Environment(SessionStore.self) private var sessionStore

    var body: some View {
        TabView {
            Tab("播放", systemImage: "play.rectangle") {
                sessionGated { PlayerSettingsTab(session: $0) }
            }
            Tab("字幕", systemImage: "captions.bubble") {
                sessionGated { SubtitleSettingsTab(session: $0) }
            }
            Tab("彈幕", systemImage: "text.bubble") {
                sessionGated { DanmakuSettingsView(session: $0, controller: coordinator.controller).frame(width: nil, height: nil) }
            }
            Tab("快捷鍵", systemImage: "keyboard") {
                sessionGated { KeyboardSettingsTab(session: $0) }
            }
            Tab("伺服器", systemImage: "server.rack") {
                ServerSettingsTab()
            }
            Tab("關於", systemImage: "info.circle") {
                AboutTab()
            }
        }
        .frame(width: 640, height: 560)
        .preferredColorScheme(.dark)
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
    static let hardwareDecoding = "player.hwdec"
    static let pauseOnHeadphoneDisconnect = "player.pauseOnDisconnect"
    static let theater = "watch.theater"
}

struct PlayerSettingsTab: View {
    let session: ServerSession
    @Environment(PlayerCoordinator.self) private var coordinator
    @AppStorage(DesktopDefaults.hardwareDecoding) private var hwdec = "videotoolbox"

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
            Section("本機路徑對應") {
                LocalMappingsEditor()
                Text("伺服器路徑前綴對應到本機掛載（例如 NAS）。命中且檔案存在時 mpv 直接開本機檔案，不經伺服器串流。")
                    .font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
            }
            Section("截圖") {
                LabeledContent("儲存位置", value: "~/Pictures/milmil")
                Button("在 Finder 顯示") {
                    let url = FileManager.default.urls(for: .picturesDirectory, in: .userDomainMask)[0].appending(path: "milmil")
                    try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
                    NSWorkspace.shared.activateFileViewerSelecting([url])
                }
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
        VStack(spacing: 18) {
            Image(nsImage: NSApp.applicationIconImage).resizable().frame(width: 96, height: 96)
            VStack(spacing: 4) {
                Text("milmil for macOS").font(.system(size: 18, weight: .bold))
                Text("版本 \(version) · macOS 15+ · Apple Silicon").font(.system(size: 12)).foregroundStyle(Theme.Text.tertiary)
            }
            Form {
                Section("元件與授權") {
                    LabeledContent("mpv / FFmpeg（MPVKit 1.0.0）", value: "LGPL-2.1+")
                    LabeledContent("SwiftyOpenCC / OpenCC", value: "MIT / Apache-2.0")
                    LabeledContent("Bangumi · AniList · DandanPlay", value: String(localized: "資料來源"))
                }
                Section {
                    Link("GitHub：milmil", destination: URL(string: "https://github.com/milmil-dev/milmil")!)
                    Link("回報問題", destination: URL(string: "https://github.com/milmil-dev/milmil/issues")!)
                }
            }
            .formStyle(.grouped)
        }
        .padding(.top, 24)
    }
}
