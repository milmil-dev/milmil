import AppKit
import MilmilAPI
import SwiftUI

/// 整合: the web's Integrations panel — DandanPlay / TMDB keys, AniList and
/// Bangumi OAuth (the browser finishes the dance against the server's own
/// callback), Trakt device-code pairing, and per-provider sync controls.
@Observable
final class IntegrationsStore {
    private(set) var settings: Loadable<ServerSettings> = .idle
    private(set) var sync: [SyncProviderStatus] = []
    private(set) var busy: Set<String> = []
    var toast: String?
    let client: APIClient

    init(client: APIClient) {
        self.client = client
    }

    func load() async {
        if settings.value == nil { settings = .loading }
        settings = await settings.reloaded { try await self.client.serverSettings() }
        sync = (try? await client.syncStatus()) ?? []
    }

    func status(_ provider: String) -> SyncProviderStatus? {
        sync.first { $0.provider == provider }
    }

    func isConnected(_ provider: String) -> Bool {
        status(provider)?.connected ?? settings.value?.hasToken(provider) ?? false
    }

    /// Runs `work` with a busy marker and a toast on either outcome.
    func run(_ key: String, success: String? = nil, _ work: () async throws -> String?) async {
        busy.insert(key)
        defer { busy.remove(key) }
        do {
            let message = try await work()
            toast = message ?? success
        } catch {
            toast = error.localizedDescription
        }
        await load()
    }
}

struct IntegrationsSettingsTab: View {
    let session: ServerSession
    @State private var store: IntegrationsStore?

    var body: some View {
        Group {
            if let store { IntegrationsForm(store: store) } else { ProgressView() }
        }
        .task {
            if store == nil { store = IntegrationsStore(client: session.client) }
            await store?.load()
        }
    }
}

private struct IntegrationsForm: View {
    @Bindable var store: IntegrationsStore
    @Environment(\.openURL) private var openURL
    @State private var dandanplay = DandanPlayCredentials(appID: "", appSecret: "")
    @State private var tmdb = TMDBCredentials(apiKey: "", accessToken: "")
    @State private var oauth: [String: OAuthCredentials] = [:]
    @State private var trakt: TraktDeviceCode?
    @State private var traktStatus: String?
    @State private var traktTask: Task<Void, Never>?

    var body: some View {
        Form {
            Section("DandanPlay（彈幕）") {
                TextField("App ID", text: $dandanplay.appID)
                SecureField("App Secret", text: $dandanplay.appSecret)
                HStack {
                    Text("用於載入與發送彈幕；在 dandanplay.com 開發者頁申請。").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                    Spacer()
                    saveButton("dandanplay") { try await store.client.saveDandanPlay(dandanplay); return nil }
                }
            }
            Section("TMDB（中繼資料 / 劇照）") {
                TextField("API Key", text: $tmdb.apiKey)
                SecureField("Read Access Token", text: $tmdb.accessToken)
                HStack {
                    Button("測試") {
                        Task {
                            await store.run("tmdb.test") {
                                let result = try await store.client.testTMDB(tmdb)
                                return result.success ? String(localized: "TMDB 連線正常") : (result.error ?? String(localized: "TMDB 測試失敗"))
                            }
                        }
                    }
                    .disabled(store.busy.contains("tmdb.test") || tmdb.apiKey.isEmpty && tmdb.accessToken.isEmpty)
                    Spacer()
                    saveButton("tmdb") { try await store.client.saveTMDB(tmdb); return nil }
                }
            }
            oauthSection("anilist", title: "AniList", hint: String(localized: "在 anilist.co/settings/developer 建立 client，redirect URL 用伺服器的 /api/v1/integrations/anilist/callback。"))
            oauthSection("bangumi", title: "Bangumi", hint: String(localized: "在 bgm.tv/dev/app 建立應用，回呼網址用伺服器的 /api/v1/integrations/bangumi/callback。"))
            traktSection
        }
        .formStyle(.grouped)
        .onChange(of: store.settings.value?.dandanplay, initial: true) { _, value in if let value { dandanplay = value } }
        .onChange(of: store.settings.value?.tmdb, initial: true) { _, value in if let value { tmdb = value } }
        .onChange(of: store.settings.value?.sections.count ?? 0, initial: true) { _, _ in
            guard let settings = store.settings.value else { return }
            for provider in ["anilist", "bangumi"] { oauth[provider] = settings.oauth(provider) }
        }
        .overlay(alignment: .bottom) { ToastLabel(text: $store.toast) }
        .onDisappear { traktTask?.cancel() }
    }

    private func saveButton(_ key: String, _ work: @escaping () async throws -> String?) -> some View {
        Button(store.busy.contains(key) ? String(localized: "儲存中…") : String(localized: "儲存")) {
            Task { await store.run(key, success: String(localized: "已儲存"), work) }
        }
        .disabled(store.busy.contains(key))
    }

    @ViewBuilder private func oauthSection(_ provider: String, title: String, hint: String) -> some View {
        let connected = store.isConnected(provider)
        let credentials = Binding(get: { oauth[provider] ?? OAuthCredentials(clientID: "", clientSecret: "") }, set: { oauth[provider] = $0 })
        Section {
            TextField("Client ID", text: credentials.clientID)
            SecureField("Client Secret", text: credentials.clientSecret)
            HStack {
                Text(hint).font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                Spacer()
                saveButton("\(provider).oauth") { try await store.client.saveOAuth(provider: provider, credentials.wrappedValue); return nil }
            }
            HStack(spacing: 8) {
                ConnectionDot(connected: connected)
                if connected {
                    Button("中斷連線", role: .destructive) {
                        Task { await store.run("\(provider).disconnect", success: String(localized: "已中斷連線")) {
                            try await store.client.disconnectIntegration(provider: provider); return nil
                        } }
                    }
                } else {
                    Button("在瀏覽器連線") {
                        Task { await store.run("\(provider).auth") {
                            openURL(try await store.client.integrationAuthURL(provider: provider))
                            return String(localized: "完成授權後回到這裡，狀態會自動更新")
                        } }
                    }
                    .disabled(credentials.wrappedValue.clientID.isEmpty)
                }
                Spacer()
            }
            if connected { syncControls(provider) }
        } header: {
            Text(title)
        }
    }

    @ViewBuilder private func syncControls(_ provider: String) -> some View {
        let status = store.status(provider)
        HStack(spacing: 10) {
            if let status {
                Text(status.lastSync.isEmpty ? String(localized: "尚未同步") : String(localized: "上次同步 \(status.lastSync)"))
                    .font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                if status.pending > 0 { Text("待推送 \(status.pending)").font(.system(size: 11)).foregroundStyle(Color(hex: 0xFBBF24)) }
            }
            Spacer()
            Button("推送本機變更") {
                Task { await store.run("\(provider).flush") {
                    let n = try await store.client.flushSync(provider: provider)
                    return String(localized: "已排入 \(n) 筆")
                } }
            }
            let providerName = provider == "anilist" ? "AniList" : provider == "bangumi" ? "Bangumi" : "Trakt"
            Button("從 \(providerName) 拉取") {
                Task { await store.run("\(provider).pull") {
                    let result = try await store.client.pullSync(provider: provider)
                    return String(localized: "檢查 \(result.checked) 部，更新 \(result.updatedLocal) 部")
                } }
            }
        }
        .disabled(store.busy.contains("\(provider).flush") || store.busy.contains("\(provider).pull"))
        if let errors = status?.lastErrors, !errors.isEmpty {
            ForEach(errors.prefix(3), id: \.self) { entry in
                Text("\(entry.animeID): \(entry.error)").font(.system(size: 11)).foregroundStyle(Color(hex: 0xF87171)).lineLimit(1)
            }
        }
    }

    @ViewBuilder private var traktSection: some View {
        let connected = store.isConnected("trakt")
        Section("Trakt") {
            HStack(spacing: 8) {
                ConnectionDot(connected: connected)
                if connected {
                    Button("中斷連線", role: .destructive) {
                        Task { await store.run("trakt.disconnect", success: String(localized: "已中斷連線")) {
                            try await store.client.disconnectIntegration(provider: "trakt"); return nil
                        } }
                    }
                } else if let trakt {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 8) {
                            Text(trakt.userCode).font(.system(size: 22, weight: .bold, design: .monospaced)).textSelection(.enabled)
                            Button("複製") {
                                NSPasteboard.general.clearContents()
                                NSPasteboard.general.setString(trakt.userCode, forType: .string)
                            }
                            Button("開啟 trakt.tv/activate") { if let url = URL(string: trakt.verificationURL) { openURL(url) } }
                        }
                        Text(traktStatus ?? String(localized: "在瀏覽器輸入代碼後，這裡會自動完成連線。")).font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                    }
                } else {
                    Button("配對裝置") { startTraktPairing() }.disabled(store.busy.contains("trakt.code"))
                }
                Spacer()
            }
            if connected { syncControls("trakt") }
        }
    }

    private func startTraktPairing() {
        traktTask?.cancel()
        traktTask = Task {
            await store.run("trakt.code") {
                let code = try await store.client.traktDeviceCode()
                trakt = code
                traktStatus = nil
                return nil
            }
            guard let code = trakt else { return }
            let deadline = Date().addingTimeInterval(TimeInterval(max(code.expiresIn, 60)))
            while !Task.isCancelled, Date() < deadline {
                try? await Task.sleep(for: .seconds(max(code.pollInterval, 3)))
                guard let status = try? await store.client.traktPoll() else { continue }
                switch status {
                case "approved":
                    trakt = nil
                    store.toast = String(localized: "Trakt 已連線")
                    await store.load()
                    return
                case "denied", "expired":
                    traktStatus = status == "denied" ? String(localized: "已拒絕授權") : String(localized: "代碼已過期，請重新配對")
                    trakt = nil
                    return
                default:
                    traktStatus = String(localized: "等待授權…")
                }
            }
            if trakt != nil { traktStatus = String(localized: "代碼已過期，請重新配對"); trakt = nil }
        }
    }
}

struct ConnectionDot: View {
    let connected: Bool

    var body: some View {
        HStack(spacing: 6) {
            Circle().fill(connected ? Color(hex: 0x4ADE80) : Theme.Text.muted).frame(width: 8, height: 8)
            Text(connected ? String(localized: "已連線") : String(localized: "未連線")).font(.system(size: 12))
        }
    }
}

/// Transient bottom toast bound to a store's `toast`.
struct ToastLabel: View {
    @Binding var text: String?

    var body: some View {
        if let text {
            Text(text)
                .font(.system(size: 12, weight: .medium))
                .padding(.horizontal, 14).padding(.vertical, 8)
                .background(.regularMaterial, in: Capsule())
                .padding(.bottom, 12)
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .task { try? await Task.sleep(for: .seconds(3)); self.text = nil }
        }
    }
}
