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
            if let store { NotificationSettingsForm(store: store) } else { SettingsFormSkeleton() }
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
        Group {
            if let draft = Binding($store.draft) {
                Form {
                    LocalNotificationSection()
                    providers(draft)
                    eventsMatrix(draft)
                    bots(draft)
                    Section {} footer: {
                        Text("與 web 共用；儲存後立即生效。").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                    }
                }
                .formStyle(.grouped)
                .safeAreaInset(edge: .bottom, spacing: 0) { saveBar }
                .animation(.snappy(duration: 0.25), value: store.isDirty)
            } else if let message = store.loaded.errorMessage {
                ErrorBanner(message: message) { Task { await store.load() } }.padding()
            } else {
                SettingsFormSkeleton()
            }
        }
        .overlay(alignment: .bottom) { ToastLabel(text: $store.toast).padding(.bottom, 16) }
    }

    /// Slides in only while there is something to save, so a clean form has no
    /// dead grey buttons parked at the bottom.
    @ViewBuilder private var saveBar: some View {
        let saving = store.busy.contains("save")
        if store.isDirty || saving {
            HStack(spacing: 10) {
                Circle().fill(Color(hex: 0xFBBF24)).frame(width: 7, height: 7)
                Text(saving ? String(localized: "儲存中…") : String(localized: "有未儲存的變更"))
                    .font(.system(size: 12, weight: .medium)).foregroundStyle(Theme.Text.primary)
                Spacer()
                Button("還原") { store.draft = store.loaded.value }
                    .glassButtonStyle().disabled(saving)
                Button("儲存") { Task { await store.save() } }
                    .glassProminentButtonStyle().keyboardShortcut("s", modifiers: .command).disabled(saving)
            }
            .padding(.horizontal, 20).padding(.vertical, 12)
            .background(.bar)
            .overlay(alignment: .top) { Divider() }
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
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
        case "anime.episode_ready": String(localized: "新集可播放")
        case "system.service_failed": String(localized: "服務故障")
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

/// 這部 Mac: what this machine does with the events — banners per category,
/// sound, quiet hours and the local airing reminders. Stored in
/// `UserDefaults`, never sent to the server.
private struct LocalNotificationSection: View {
    @State private var preferences = NotificationPreferences.shared

    var body: some View {
        Section {
            ForEach([MilmilNotification.Category.anime, .download, .library, .system], id: \.self) { category in
                Toggle(Self.label(category), isOn: Binding(
                    get: { preferences.bannersEnabled(for: category) },
                    set: { preferences.setBanners($0, for: category) }
                ))
            }
            Toggle("提示音", isOn: $preferences.sound)
        } header: {
            Text("這部 Mac 的橫幅")
        } footer: {
            Text("只影響這部 Mac 的通知中心橫幅；未讀數與通知頁不受影響。").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
        }
        Section {
            Toggle("播出前提醒", isOn: $preferences.airingReminders)
            if preferences.airingReminders {
                Picker("提前", selection: $preferences.airingLeadMinutes) {
                    ForEach(NotificationPreferences.leadChoices, id: \.self) { minutes in
                        Text("\(minutes) 分鐘").tag(minutes)
                    }
                }
            }
            Toggle("繼續睇提醒", isOn: $preferences.resumeReminders)
            Toggle("星期日追番週報", isOn: $preferences.weeklyDigest)
        } header: {
            Text("播出提醒")
        } footer: {
            Text("依播出時間表，為「觀看中」與有自動下載規則的番劇排定本機提醒；App 沒有開啟也會送出。暫停半小時未看完會提醒一次；週報在星期日 20:00 總結本週新集數。")
                .font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
        }
        Section {
            Toggle("勿擾時段", isOn: $preferences.quietHoursEnabled)
            if preferences.quietHoursEnabled {
                DatePicker("開始", selection: minutesBinding($preferences.quietStartMinutes), displayedComponents: .hourAndMinute)
                DatePicker("結束", selection: minutesBinding($preferences.quietEndMinutes), displayedComponents: .hourAndMinute)
            }
        } footer: {
            Text("時段內不顯示橫幅，通知仍會留在通知頁。").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
        }
    }

    private static func label(_ category: MilmilNotification.Category) -> String {
        switch category {
        case .anime: String(localized: "番劇")
        case .download: String(localized: "下載")
        case .library: String(localized: "媒體庫")
        case .system, .all: String(localized: "系統")
        }
    }

    /// Minutes-from-midnight stored value ⇄ a Date on today for the picker.
    private func minutesBinding(_ minutes: Binding<Int>) -> Binding<Date> {
        Binding(
            get: { Calendar.current.date(bySettingHour: minutes.wrappedValue / 60, minute: minutes.wrappedValue % 60, second: 0, of: Date()) ?? Date() },
            set: { date in
                let parts = Calendar.current.dateComponents([.hour, .minute], from: date)
                minutes.wrappedValue = (parts.hour ?? 0) * 60 + (parts.minute ?? 0)
            }
        )
    }
}

/// Grouped-form placeholder: section headings with a few rows each, so a
/// settings tab does not flash an empty pane before its form arrives.
struct SettingsFormSkeleton: View {
    var sections = 3

    var body: some View {
        VStack(alignment: .leading, spacing: 26) {
            ForEach(0..<sections, id: \.self) { _ in
                VStack(alignment: .leading, spacing: 10) {
                    SkeletonText(width: 88, height: 12)
                    SkeletonParagraph(lines: 3, height: 13, spacing: 12)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .shimmering()
        .accessibilityLabel("載入中")
    }
}
