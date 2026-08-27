import AppKit
import CoreImage.CIFilterBuiltins
import MilmilAPI
import SwiftUI

/// 服務: the backend's services from `GET /system/services` — the
/// Jellyfin-compatible API external players use, the scheduler's workers,
/// the downloader, caches, sync and backup — with the switches and
/// run-now buttons the server exposes. Refreshes on appear, on the
/// `service:changed` event and every 30 s while visible.
@Observable
final class ServicesStore {
    private(set) var loaded: Loadable<BackendServices> = .idle
    private(set) var devices: [JellyfinDevice] = []
    private(set) var update: UpdateCheck?
    private(set) var busy: Set<String> = []
    /// Optimistic switch positions while a PATCH is in flight.
    private(set) var pendingEnabled: [String: Bool] = [:]
    /// True when the server has no `/system/services` (older milmil).
    private(set) var unsupported = false
    var toast: String?
    let client: APIClient

    init(client: APIClient) {
        self.client = client
    }

    var services: [BackendService] { loaded.value?.services ?? [] }
    var hasFailures: Bool { services.contains { $0.hasFailure && $0.enabled } }

    func service(_ id: String) -> BackendService? { services.first { $0.id == id } }

    func isEnabled(_ service: BackendService) -> Bool { pendingEnabled[service.id] ?? service.enabled }

    var workers: [BackendService] {
        services.filter(\.isWorker).sorted { lhs, rhs in
            if lhs.hasFailure != rhs.hasFailure { return lhs.hasFailure }
            if isEnabled(lhs) != isEnabled(rhs) { return isEnabled(lhs) }
            return lhs.id < rhs.id
        }
    }

    func load(silent: Bool = false) async {
        if !silent, loaded.value == nil { loaded = .loading }
        do {
            let list = try await client.systemServices()
            loaded = .loaded(list)
            unsupported = false
            if list.services.contains(where: { $0.id == "jellyfin" }) {
                devices = (try? await client.jellyfinDevices()) ?? []
            }
            update = try? await client.updateCheck()
        } catch APIError.http(status: 404, _) {
            unsupported = true
            if loaded.value == nil { loaded = .failed(String(localized: "伺服器版本未提供服務管理，請更新 milmil server。")) }
        } catch {
            if loaded.value == nil { loaded = .failed(error.localizedDescription) }
        }
    }

    func setEnabled(_ service: BackendService, _ enabled: Bool) {
        pendingEnabled[service.id] = enabled
        Task {
            defer { pendingEnabled[service.id] = nil }
            do {
                _ = try await client.updateService(id: service.id, enabled: enabled)
                await load(silent: true)
            } catch {
                toast = error.localizedDescription
            }
        }
    }

    func setDiscovery(_ enabled: Bool) {
        pendingEnabled["jellyfin.discovery"] = enabled
        Task {
            defer { pendingEnabled["jellyfin.discovery"] = nil }
            do {
                _ = try await client.updateService(id: "jellyfin", discoveryEnabled: enabled)
                await load(silent: true)
            } catch {
                toast = error.localizedDescription
            }
        }
    }

    func run(_ service: BackendService) async {
        busy.insert(service.id)
        defer { busy.remove(service.id) }
        do {
            _ = try await client.runService(id: service.id)
            toast = String(localized: "已開始執行")
            await load(silent: true)
        } catch APIError.http(status: 409, _) {
            toast = String(localized: "正在執行中")
        } catch {
            toast = error.localizedDescription
        }
    }

    func revoke(_ device: JellyfinDevice) async {
        busy.insert(device.id)
        defer { busy.remove(device.id) }
        do {
            try await client.revokeJellyfinDevice(id: device.id)
            devices.removeAll { $0.id == device.id }
            toast = String(localized: "已撤銷裝置")
        } catch {
            toast = error.localizedDescription
        }
    }

    func clearTranscodeCache() async {
        busy.insert("transcode_cache")
        defer { busy.remove("transcode_cache") }
        do {
            try await client.clearTranscodeCache()
            toast = String(localized: "已清除轉碼快取")
            await load(silent: true)
        } catch {
            toast = error.localizedDescription
        }
    }

    func triggerSync() async {
        busy.insert("sync")
        defer { busy.remove("sync") }
        do {
            try await client.triggerSync()
            toast = String(localized: "已開始同步")
            await load(silent: true)
        } catch {
            toast = error.localizedDescription
        }
    }
}

struct ServicesSettingsTab: View {
    let session: ServerSession
    @State private var store: ServicesStore?

    var body: some View {
        Group {
            if let store { ServicesForm(store: store, session: session) } else { ProgressView() }
        }
        .task {
            if store == nil { store = ServicesStore(client: session.client) }
            await store?.load()
        }
        // `service:changed` and anything else the server pushes.
        .task(id: session.serviceGeneration) {
            guard session.serviceGeneration > 0 else { return }
            await store?.load(silent: true)
        }
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(30))
                guard !Task.isCancelled else { return }
                await store?.load(silent: true)
            }
        }
    }
}

private struct ServicesForm: View {
    @Bindable var store: ServicesStore
    let session: ServerSession
    @Environment(\.openURL) private var openURL
    @State private var revoking: JellyfinDevice?
    @State private var confirmClearCache = false
    @State private var showQR = false

    var body: some View {
        Group {
            if store.loaded.value != nil {
                Form {
                    if let jellyfin = store.service("jellyfin") { jellyfinSection(jellyfin) }
                    workersSection
                    systemSection
                }
                .formStyle(.grouped)
            } else if let message = store.loaded.errorMessage {
                VStack(spacing: 12) {
                    ErrorBanner(message: message) { Task { await store.load() } }
                    if store.unsupported {
                        Text("服務管理需要較新嘅 milmil server；web 嘅設定頁仍然可用。")
                            .font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                    }
                }
                .padding()
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            } else {
                ServicesSkeleton()
            }
        }
        .overlay(alignment: .bottom) { ToastLabel(text: $store.toast).padding(.bottom, 16) }
        .confirmationDialog(
            String(localized: "撤銷「\(revoking?.deviceName ?? "")」？"), isPresented: Binding(get: { revoking != nil }, set: { if !$0 { revoking = nil } }),
            titleVisibility: .visible
        ) {
            Button("撤銷", role: .destructive) {
                if let device = revoking { Task { await store.revoke(device) } }
                revoking = nil
            }
        } message: {
            Text("該裝置需要重新登入先可以再連線。")
        }
        .confirmationDialog("清除轉碼快取？", isPresented: $confirmClearCache, titleVisibility: .visible) {
            Button("清除", role: .destructive) { Task { await store.clearTranscodeCache() } }
        } message: {
            Text("這將刪除所有轉碼影片檔案，此操作無法復原。")
        }
    }

    // MARK: Jellyfin

    @ViewBuilder private func jellyfinSection(_ service: BackendService) -> some View {
        let address = service.extraString("address") ?? session.profile.baseURL.appending(path: "jellyfin").absoluteString
        Section {
            Toggle("啟用 Jellyfin 相容 API", isOn: Binding(get: { store.isEnabled(service) }, set: { store.setEnabled(service, $0) }))
                .disabled(!service.controllable)
            LabeledContent("伺服器地址") {
                HStack(spacing: 8) {
                    Text(address).font(.system(size: 12, design: .monospaced)).textSelection(.enabled).lineLimit(1).truncationMode(.middle)
                    Button {
                        NSPasteboard.general.clearContents()
                        NSPasteboard.general.setString(address, forType: .string)
                        store.toast = String(localized: "已複製")
                    } label: {
                        Image(systemName: "doc.on.doc")
                    }
                    .buttonStyle(.plain).help("複製")
                    Button {
                        showQR.toggle()
                    } label: {
                        Image(systemName: "qrcode")
                    }
                    .buttonStyle(.plain).help("顯示 QR code")
                    .popover(isPresented: $showQR) {
                        VStack(spacing: 8) {
                            if let image = Self.qrCode(address) {
                                Image(nsImage: image).interpolation(.none).resizable().frame(width: 200, height: 200)
                            }
                            Text(address).font(.system(size: 11)).foregroundStyle(Theme.Text.secondary)
                        }
                        .padding(16)
                    }
                }
            }
            Toggle(isOn: Binding(
                get: { store.pendingEnabled["jellyfin.discovery"] ?? service.extraBool("discovery_enabled") ?? false },
                set: { store.setDiscovery($0) }
            )) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("LAN 自動發現")
                    Text(verbatim: "UDP \(service.extraInt("discovery_port") ?? 7359)")
                        .font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                }
            }
            .disabled(!service.controllable || !store.isEnabled(service))
            if !service.lastError.isEmpty {
                Text(service.lastError).font(.system(size: 11)).foregroundStyle(Color(hex: 0xF87171))
            }
        } header: {
            Text("外部播放器（Jellyfin 相容）")
        } footer: {
            Text("Infuse、VLC、Kodi 用呢個地址加你嘅 milmil 帳號密碼登入；播放進度會同步返嚟。")
                .font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
        }
        Section {
            if store.devices.isEmpty {
                Text("仲未有外部播放器連線過。").foregroundStyle(Theme.Text.tertiary)
            }
            ForEach(store.devices) { device in
                HStack(spacing: 10) {
                    Image(systemName: "tv").foregroundStyle(Theme.Text.secondary)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(device.client.isEmpty ? device.deviceName : "\(device.client) · \(device.deviceName)").font(.system(size: 13))
                        Text(Formatters.relative(device.lastSeen)).font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                    }
                    Spacer()
                    if device.revoked {
                        Text("已撤銷").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                    } else {
                        Button("撤銷") { revoking = device }
                            .glassButtonStyle().controlSize(.small)
                            .disabled(store.busy.contains(device.id))
                    }
                }
            }
        } header: {
            Text("已連線裝置")
        }
    }

    // MARK: Workers

    private var workersSection: some View {
        Section {
            let workers = store.workers
            if workers.isEmpty {
                Text("冇背景工作資料。").foregroundStyle(Theme.Text.tertiary)
            }
            ForEach(workers) { worker in
                WorkerRow(service: worker, store: store)
            }
        } header: {
            HStack {
                Text("背景工作")
                Spacer()
                if store.hasFailures {
                    Text("有工作失敗").font(.system(size: 11, weight: .semibold)).foregroundStyle(Color(hex: 0xF87171))
                } else if !store.workers.isEmpty {
                    Text("全部正常").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                }
            }
        }
    }

    // MARK: System rows

    @ViewBuilder private var systemSection: some View {
        Section {
            if let downloader = store.service("downloader") {
                serviceRow(downloader, title: String(localized: "下載器（aria2）")) { EmptyView() }
            }
            if let cache = store.service("transcode_cache") {
                let size = cache.extraInt("bytes").map { $0 == 0 ? "0 B" : ByteCountFormatter.string(fromByteCount: Int64($0), countStyle: .file) }
                serviceRow(cache, title: String(localized: "轉碼快取"), caption: size ?? cache.summary) {
                    Button("清除") { confirmClearCache = true }
                        .glassButtonStyle().controlSize(.small)
                        .disabled(store.busy.contains("transcode_cache"))
                }
            }
            if let sync = store.service("sync") {
                serviceRow(sync, title: String(localized: "雲端同步")) {
                    Button("立即同步") { Task { await store.triggerSync() } }
                        .glassButtonStyle().controlSize(.small)
                        .disabled(store.busy.contains("sync") || sync.running)
                }
            }
            if let backup = store.service("backup") {
                serviceRow(backup, title: String(localized: "備份")) { EmptyView() }
            }
            ForEach(store.services.filter { $0.id.hasPrefix("bot.") }) { bot in
                serviceRow(bot, title: bot.id == "bot.telegram" ? "Telegram Bot" : (bot.id == "bot.discord" ? "Discord Bot" : bot.name)) {
                    if bot.controllable {
                        Toggle("", isOn: Binding(get: { store.isEnabled(bot) }, set: { store.setEnabled(bot, $0) })).labelsHidden()
                    }
                }
            }
            systemRow
        } header: {
            Text("系統")
        }
    }

    @ViewBuilder private var systemRow: some View {
        let system = store.loaded.value?.system
        HStack(spacing: 10) {
            StatusDot(color: Color(hex: 0x4ADE80))
            VStack(alignment: .leading, spacing: 2) {
                Text("milmil server").font(.system(size: 13))
                if let system {
                    let version = system.version
                    let when = Self.uptime(system.uptimeSeconds)
                    Text("v\(version) · 已運行 \(when)").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                }
                if let update = store.update, update.hasUpdate, let latest = update.latest {
                    let version = latest
                    Text("有新版本 v\(version)").font(.system(size: 11, weight: .semibold)).foregroundStyle(Theme.accent)
                }
            }
            Spacer()
            if let update = store.update, update.hasUpdate, let url = update.releaseURL {
                Button("查看") { openURL(url) }.glassButtonStyle().controlSize(.small)
            }
        }
    }

    private func serviceRow(_ service: BackendService, title: String, caption: String? = nil, @ViewBuilder trailing: () -> some View) -> some View {
        HStack(spacing: 10) {
            StatusDot(color: Self.dotColor(service, enabled: store.isEnabled(service)))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.system(size: 13))
                let caption = caption ?? service.summary
                if !caption.isEmpty {
                    Text(caption).font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary).lineLimit(1)
                }
                if service.hasFailure {
                    Text(service.lastError).font(.system(size: 11)).foregroundStyle(Color(hex: 0xF87171)).lineLimit(2)
                }
            }
            Spacer()
            trailing()
        }
    }

    static func dotColor(_ service: BackendService, enabled: Bool) -> Color {
        if !enabled { return Theme.ink(0.25) }
        if service.hasFailure { return Color(hex: 0xF87171) }
        // Amber = a job mid-run; a daemon that is "running" is simply alive.
        if service.isWorker, service.running { return Color(hex: 0xFBBF24) }
        return Color(hex: 0x4ADE80)
    }

    /// "3 天 4 小時" / "2 小時 10 分鐘" / "5 分鐘".
    static func uptime(_ seconds: Int) -> String {
        let days = seconds / 86_400
        let hours = (seconds % 86_400) / 3600
        let minutes = (seconds % 3600) / 60
        if days > 0 { return String(localized: "\(days) 天 \(hours) 小時") }
        if hours > 0 { return String(localized: "\(hours) 小時 \(minutes) 分鐘") }
        return String(localized: "\(minutes) 分鐘")
    }

    static func qrCode(_ text: String) -> NSImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage else { return nil }
        let scaled = output.transformed(by: CGAffineTransform(scaleX: 8, y: 8))
        let rep = NSCIImageRep(ciImage: scaled)
        let image = NSImage(size: rep.size)
        image.addRepresentation(rep)
        return image
    }
}

/// One scheduler worker: status dot, localized name, "every N · last · took",
/// the last error, run-now and the enable switch.
private struct WorkerRow: View {
    let service: BackendService
    let store: ServicesStore

    var body: some View {
        HStack(spacing: 10) {
            StatusDot(color: ServicesForm.dotColor(service, enabled: store.isEnabled(service)))
            VStack(alignment: .leading, spacing: 2) {
                Text(Self.title(for: service)).font(.system(size: 13))
                Text(caption).font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary).lineLimit(1)
                if service.hasFailure {
                    Text(service.lastError).font(.system(size: 11)).foregroundStyle(Color(hex: 0xF87171)).lineLimit(2)
                }
            }
            Spacer()
            // Quiet icon actions in fixed slots, so the column lines up whether
            // or not a row can be run or switched off.
            ZStack {
                if service.running || store.busy.contains(service.id) {
                    ProgressView().controlSize(.small)
                } else if service.runnable {
                    RowIconButton(symbol: "play.fill", label: String(localized: "立即執行")) { Task { await store.run(service) } }
                        .disabled(!store.isEnabled(service))
                        .opacity(store.isEnabled(service) ? 1 : 0.35)
                }
            }
            .frame(width: 28)
            ZStack {
                if service.controllable {
                    Toggle("", isOn: Binding(get: { store.isEnabled(service) }, set: { store.setEnabled(service, $0) }))
                        .labelsHidden()
                }
            }
            .frame(width: 44, alignment: .trailing)
        }
    }

    private var caption: String {
        var parts: [String] = []
        if let interval = service.intervalSeconds { parts.append(Self.every(interval)) }
        if service.running {
            parts.append(String(localized: "執行中"))
        } else if let last = service.lastRunAt {
            parts.append(Formatters.relative(last))
        }
        if let ms = service.lastDurationMs, ms > 0 {
            parts.append(ms >= 1000 ? String(format: "%.1f s", Double(ms) / 1000) : "\(ms) ms")
        }
        if parts.isEmpty, !service.summary.isEmpty { parts.append(service.summary) }
        return parts.joined(separator: " · ")
    }

    static func every(_ seconds: Int) -> String {
        if seconds >= 3600, seconds % 3600 == 0 {
            let hours = seconds / 3600
            return String(localized: "每 \(hours) 小時")
        }
        if seconds >= 60 {
            let minutes = seconds / 60
            return String(localized: "每 \(minutes) 分鐘")
        }
        return String(localized: "每 \(seconds) 秒")
    }

    static func title(for service: BackendService) -> String {
        switch service.id {
        case "worker.rss_refresh": String(localized: "RSS 更新")
        case "worker.download_sync": String(localized: "下載同步")
        case "worker.library_reconcile": String(localized: "媒體庫對帳")
        case "worker.notification_delivery": String(localized: "通知投遞")
        case "worker.bot_report": String(localized: "Bot 定時報告")
        case "worker.airing_reminder": String(localized: "播出提醒")
        case "worker.daily_digest": String(localized: "每日摘要")
        case "worker.anidb_refresh": String(localized: "AniDB 資料更新")
        case "worker.sync_outbox_drain": String(localized: "同步送出")
        case "worker.sync_outbox_gc": String(localized: "同步清理")
        case "worker.sync_pull": String(localized: "同步拉取")
        case "worker.notification_cleanup": String(localized: "通知清理")
        default: service.name
        }
    }
}

private struct StatusDot: View {
    let color: Color

    var body: some View {
        Circle().fill(color).frame(width: 8, height: 8)
    }
}

private struct ServicesSkeleton: View {
    var body: some View {
        Form {
            ForEach(0..<3, id: \.self) { section in
                Section {
                    ForEach(0..<(section == 1 ? 6 : 3), id: \.self) { _ in
                        HStack(spacing: 10) {
                            Circle().fill(Theme.ink(0.08)).frame(width: 8, height: 8)
                            VStack(alignment: .leading, spacing: 6) {
                                RoundedRectangle(cornerRadius: 4).fill(Theme.ink(0.08)).frame(width: 140, height: 11)
                                RoundedRectangle(cornerRadius: 4).fill(Theme.ink(0.05)).frame(width: 220, height: 9)
                            }
                            Spacer()
                        }
                    }
                } header: {
                    RoundedRectangle(cornerRadius: 4).fill(Theme.ink(0.08)).frame(width: 90, height: 11)
                }
            }
        }
        .formStyle(.grouped)
        .accessibilityLabel("載入中")
    }
}
