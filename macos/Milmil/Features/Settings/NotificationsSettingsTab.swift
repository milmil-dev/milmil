import MilmilAPI
import SwiftUI

/// 通知: the web's notification settings — Discord / Telegram / webhook
/// providers, which events reach which provider, and the chat bots. Edits
/// are local until 儲存 sends the whole document back.
@Observable
final class NotificationSettingsStore {
    private(set) var loaded: Loadable<NotificationSettings> = .idle
    var draft: NotificationSettings?
    private(set) var status: [String: NotificationProviderStatus] = [:]
    private(set) var busy: Set<String> = []
    var toast: String?
    let client: APIClient

    init(client: APIClient) {
        self.client = client
    }

    var isDirty: Bool { draft != nil && draft != loaded.value }

    func load() async {
        if loaded.value == nil { loaded = .loading }
        loaded = await loaded.reloaded { try await self.client.notificationSettings() }
        if draft == nil { draft = loaded.value }
        status = (try? await client.notificationProviderStatus()) ?? [:]
    }

    func save() async {
        guard let draft else { return }
        busy.insert("save")
        defer { busy.remove("save") }
        do {
            try await client.saveNotificationSettings(draft)
            toast = String(localized: "已儲存")
            loaded = .loaded(draft)
            status = (try? await client.notificationProviderStatus()) ?? [:]
        } catch {
            toast = error.localizedDescription
        }
    }

    func test(provider: String) async {
        busy.insert(provider)
        defer { busy.remove(provider) }
        do {
            let result = try await client.testNotificationProvider(provider)
            toast = result.success ? String(localized: "測試訊息已送出") : (result.error ?? String(localized: "測試失敗"))
        } catch {
            toast = error.localizedDescription
        }
    }

    func testBot(platform: String) async {
        busy.insert("bot.\(platform)")
        defer { busy.remove("bot.\(platform)") }
        do {
            let result = try await client.testBot(platform: platform)
            toast = result.success ? String(localized: "Bot 連線正常：@\(result.botUsername ?? "")") : (result.error ?? String(localized: "Bot 測試失敗"))
        } catch {
            toast = error.localizedDescription
        }
    }
}

struct NotificationsSettingsTab: View {
    let session: ServerSession
    @State private var store: NotificationSettingsStore?

    var body: some View {
        Group {
            if let store { NotificationSettingsForm(store: store) } else { ProgressView() }
        }
        .task {
            if store == nil { store = NotificationSettingsStore(client: session.client) }
            await store?.load()
        }
    }
}

private struct NotificationSettingsForm: View {
    @Bindable var store: NotificationSettingsStore

    var body: some View {
        VStack(spacing: 0) {
            if let draft = Binding($store.draft) {
                Form {
                    providers(draft)
                    eventsMatrix(draft)
                    bots(draft)
                }
                .formStyle(.grouped)
            } else if let message = store.loaded.errorMessage {
                ErrorBanner(message: message) { Task { await store.load() } }.padding()
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            Divider()
            HStack {
                Text(store.isDirty ? String(localized: "有未儲存的變更") : String(localized: "與 web 共用；儲存後立即生效。"))
                    .font(.system(size: 11)).foregroundStyle(store.isDirty ? Color(hex: 0xFBBF24) : Theme.Text.tertiary)
                Spacer()
                Button("還原") { store.draft = store.loaded.value }.disabled(!store.isDirty)
                Button(store.busy.contains("save") ? String(localized: "儲存中…") : String(localized: "儲存")) { Task { await store.save() } }
                    .buttonStyle(.borderedProminent).disabled(!store.isDirty || store.busy.contains("save"))
            }
            .padding(10)
        }
        .overlay(alignment: .bottom) { ToastLabel(text: $store.toast).padding(.bottom, 44) }
    }

    @ViewBuilder private func providers(_ draft: Binding<NotificationSettings>) -> some View {
        Section("Discord") {
            Toggle("啟用 Discord webhook", isOn: draft.providers.discord.enabled)
            TextField("Webhook URL", text: draft.providers.discord.webhookURL, prompt: Text(verbatim: "https://discord.com/api/webhooks/…"))
            providerFooter("discord")
        }
        Section("Telegram") {
            Toggle("啟用 Telegram 通知", isOn: draft.providers.telegram.enabled)
            SecureField("Bot token", text: draft.providers.telegram.botToken)
            TextField("Chat ID", text: draft.providers.telegram.chatID)
            providerFooter("telegram")
        }
        Section("Webhook") {
            Toggle("啟用自訂 webhook", isOn: draft.providers.webhook.enabled)
            TextField("URL", text: draft.providers.webhook.url, prompt: Text(verbatim: "https://example.com/hook"))
            SecureField("Secret（選填，用於 HMAC 簽章）", text: draft.providers.webhook.secret)
            providerFooter("webhook")
        }
    }

    private func providerFooter(_ provider: String) -> some View {
        HStack(spacing: 8) {
            if let status = store.status[provider] {
                let color: Color = switch status.status {
                case "ok": Color(hex: 0x4ADE80)
                case "error": Color(hex: 0xF87171)
                default: Theme.Text.muted
                }
                Circle().fill(color).frame(width: 8, height: 8)
                Text(statusLabel(status)).font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary).lineLimit(1)
            }
            Spacer()
            Button("發送測試") { Task { await store.test(provider: provider) } }
                .disabled(store.busy.contains(provider) || store.isDirty)
                .help(store.isDirty ? String(localized: "先儲存再測試") : "")
        }
    }

    private func statusLabel(_ status: NotificationProviderStatus) -> String {
        switch status.status {
        case "ok": status.lastSentAt.map { sent in String(localized: "上次送出 \(sent)") } ?? String(localized: "正常")
        case "error": status.lastError ?? String(localized: "上次送出失敗")
        case "disabled": String(localized: "已停用")
        default: String(localized: "尚未設定")
        }
    }

    @ViewBuilder private func eventsMatrix(_ draft: Binding<NotificationSettings>) -> some View {
        Section {
            Grid(alignment: .leading, horizontalSpacing: 18, verticalSpacing: 8) {
                GridRow {
                    Text("事件").font(.system(size: 11, weight: .semibold)).foregroundStyle(Theme.Text.tertiary)
                    ForEach(NotificationSettings.providerNames, id: \.self) { provider in
                        Text(provider.capitalized).font(.system(size: 11, weight: .semibold)).foregroundStyle(Theme.Text.tertiary)
                    }
                }
                ForEach(NotificationSettings.eventIDs, id: \.self) { event in
                    GridRow {
                        Text(Self.eventLabel(event)).font(.system(size: 12))
                        ForEach(NotificationSettings.providerNames, id: \.self) { provider in
                            Toggle("", isOn: Binding(
                                get: { draft.wrappedValue.events[event]?.contains(provider) ?? false },
                                set: { on in
                                    var list = draft.wrappedValue.events[event] ?? []
                                    if on { if !list.contains(provider) { list.append(provider) } } else { list.removeAll { $0 == provider } }
                                    draft.wrappedValue.events[event] = list
                                }
                            ))
                            .labelsHidden().toggleStyle(.checkbox)
                        }
                    }
                }
            }
        } header: {
            Text("事件路由")
        } footer: {
            Text("勾選哪些事件要送到哪個管道。").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
        }
    }

    static func eventLabel(_ id: String) -> String {
        switch id {
        case "download.started": String(localized: "下載開始")
        case "download.completed": String(localized: "下載完成")
        case "download.failed": String(localized: "下載失敗")
        case "library.scan_complete": String(localized: "媒體庫掃描完成")
        case "system.error": String(localized: "系統錯誤")
        case "auth.login": String(localized: "登入")
        case "anime.airing": String(localized: "即將播出")
        case "anime.daily_digest": String(localized: "每日摘要")
        default: id
        }
    }

    @ViewBuilder private func bots(_ draft: Binding<NotificationSettings>) -> some View {
        Section("Telegram Bot") {
            Toggle("啟用 Telegram bot", isOn: draft.bot.telegram.enabled)
            SecureField("Bot token", text: draft.bot.telegram.botToken)
            TextField("Webhook URL（留空用長輪詢）", text: draft.bot.telegram.webhookURL)
            TextField("允許的 chat ID（逗號分隔）", text: Binding(
                get: { draft.wrappedValue.bot.telegram.allowedChatIDs.map(String.init).joined(separator: ", ") },
                set: { text in
                    draft.wrappedValue.bot.telegram.allowedChatIDs = text.split(separator: ",").compactMap { Int($0.trimmingCharacters(in: .whitespaces)) }
                }
            ))
            Picker("語言", selection: draft.bot.telegram.language) {
                Text("預設").tag("")
                Text("繁體中文").tag("zh-TW")
                Text("简体中文").tag("zh-CN")
                Text("English").tag("en")
                Text("日本語").tag("ja")
            }
            let reminder = draft.wrappedValue.bot.telegram.airingReminderMinutes
            Stepper("播出提醒：提前 \(reminder) 分鐘", value: draft.bot.telegram.airingReminderMinutes, in: 0...1440, step: 5)
            TextField("每日摘要時間（HH:mm）", text: draft.bot.telegram.dailyDigestTime, prompt: Text("09:00"))
            HStack {
                Spacer()
                Button("測試 bot") { Task { await store.testBot(platform: "telegram") } }.disabled(store.busy.contains("bot.telegram") || store.isDirty)
            }
        }
        Section("Discord Bot") {
            Toggle("啟用 Discord bot", isOn: draft.bot.discord.enabled)
            SecureField("Bot token", text: draft.bot.discord.botToken)
            TextField("Application ID", text: draft.bot.discord.applicationID)
            TextField("允許的 guild ID（逗號分隔）", text: Binding(
                get: { draft.wrappedValue.bot.discord.allowedGuildIDs.joined(separator: ", ") },
                set: { text in
                    draft.wrappedValue.bot.discord.allowedGuildIDs = text.split(separator: ",")
                        .map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
                }
            ))
            HStack {
                Spacer()
                Button("測試 bot") { Task { await store.testBot(platform: "discord") } }.disabled(store.busy.contains("bot.discord") || store.isDirty)
            }
        }
    }
}
