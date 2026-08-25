import AppKit
import MilmilAPI
import SwiftUI

/// 一般: the web's General panel — interface language (persisted to the
/// server's `appearance` section like the web, applied locally via an
/// `AppleLanguages` override), week start day, and auto-add to collection.
enum AppLanguage: String, CaseIterable, Identifiable {
    case system
    case zhTW = "zh-TW"
    case zhHK = "zh-HK"
    case zhCN = "zh-CN"
    case en
    case ja
    case ko

    var id: String { rawValue }

    /// Language names stay in their own language, like the web's selector.
    var label: String {
        switch self {
        case .system: String(localized: "系統預設")
        case .zhTW: "繁體中文（台灣）"
        case .zhHK: "粵語"
        case .zhCN: "简体中文"
        case .en: "English"
        case .ja: "日本語"
        case .ko: "한국어"
        }
    }

    /// The app's localization identifier for `AppleLanguages`; nil clears the
    /// override and follows the system language.
    var appleLanguage: String? {
        switch self {
        case .system: nil
        case .zhTW: "zh-Hant"
        case .zhHK: "zh-HK"
        case .zhCN: "zh-Hans"
        case .en: "en"
        case .ja: "ja"
        case .ko: "ko"
        }
    }
}

struct GeneralSettingsTab: View {
    let session: ServerSession
    @AppStorage(DesktopDefaults.language) private var language = AppLanguage.system.rawValue
    @AppStorage(DesktopDefaults.theme) private var theme = Theme.Preference.dark.rawValue
    @AppStorage(DesktopDefaults.weekStart) private var weekStart = "monday"
    @State private var settings: Loadable<ServerSettings> = .idle
    @State private var autoAdd = true
    @State private var needsRelaunch = false
    @State private var toast: String?

    var body: some View {
        Form {
            Section("語言") {
                Picker("介面語言", selection: $language) {
                    ForEach(AppLanguage.allCases) { item in
                        Text(item.label).tag(item.rawValue)
                    }
                }
                if needsRelaunch {
                    HStack {
                        Text("語言變更會在重新啟動後生效。").font(.system(size: 11)).foregroundStyle(Theme.accent)
                        Spacer()
                        Button("立即重新啟動") { relaunch() }
                    }
                } else {
                    Text("選擇具體語言時會同步到伺服器的語言偏好（web 的一般設定）。").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                }
            }
            Section("外觀") {
                Picker("主題", selection: $theme) {
                    ForEach(Theme.Preference.allCases) { item in
                        Text(item.label).tag(item.rawValue)
                    }
                }
                Text("與 web 共用（伺服器的外觀設定）。").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
            }
            Section("時刻表") {
                Picker("每週起始日", selection: $weekStart) {
                    Text("星期一").tag("monday")
                    Text("星期日").tag("sunday")
                    Text("星期六").tag("saturday")
                }
            }
            Section("收藏") {
                Toggle(isOn: autoAddBinding) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("自動加入收藏")
                        Text("新匹配的動畫自動加入收藏").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                    }
                }
                .disabled(settings.value == nil)
            }
        }
        .formStyle(.grouped)
        .task {
            settings = await settings.reloaded { try await session.client.serverSettings() }
            if let loaded = settings.value { autoAdd = loaded.autoAddToCollection }
            // Adopt the theme picked on the web, mirroring the language sync.
            if case let .string(serverTheme)? = settings.value?.sections["appearance"]?["theme"],
               Theme.Preference(rawValue: serverTheme) != nil, serverTheme != theme {
                theme = serverTheme
            }
        }
        .onChange(of: language) { old, new in
            guard old != new else { return }
            applyLanguage(AppLanguage(rawValue: new) ?? .system)
        }
        .onChange(of: theme) { old, new in
            guard old != new else { return }
            saveTheme(new)
        }
        .overlay(alignment: .bottom) { ToastLabel(text: $toast) }
    }

    private var autoAddBinding: Binding<Bool> {
        Binding(get: { autoAdd }, set: { value in
            autoAdd = value
            Task {
                do {
                    try await session.client.saveCollection(autoAddToCollection: value)
                    toast = String(localized: "已儲存")
                } catch {
                    toast = error.localizedDescription
                }
            }
        })
    }

    private func applyLanguage(_ choice: AppLanguage) {
        if let code = choice.appleLanguage {
            UserDefaults.standard.set([code], forKey: "AppleLanguages")
        } else {
            UserDefaults.standard.removeObject(forKey: "AppleLanguages")
        }
        needsRelaunch = true
        guard choice != .system else { return }
        // Mirror the web: PUT the merged appearance section with the new code.
        var section = settings.value?.sections["appearance"] ?? [:]
        section["language"] = .string(choice.rawValue)
        Task {
            do {
                try await session.client.saveAppearance(section)
                toast = String(localized: "已儲存")
            } catch {
                toast = error.localizedDescription
            }
        }
    }

    private func saveTheme(_ raw: String) {
        // Mirror the web: PUT the merged appearance section. Skip the echo when
        // we just adopted the server's value in `.task`.
        var section = settings.value?.sections["appearance"] ?? [:]
        if case let .string(existing)? = section["theme"], existing == raw { return }
        section["theme"] = .string(raw)
        Task {
            do {
                try await session.client.saveAppearance(section)
                toast = String(localized: "已儲存")
            } catch {
                toast = error.localizedDescription
            }
        }
    }

    private func relaunch() {
        let configuration = NSWorkspace.OpenConfiguration()
        configuration.createsNewApplicationInstance = true
        NSWorkspace.shared.openApplication(at: Bundle.main.bundleURL, configuration: configuration) { _, _ in
            DispatchQueue.main.async { NSApp.terminate(nil) }
        }
    }
}
