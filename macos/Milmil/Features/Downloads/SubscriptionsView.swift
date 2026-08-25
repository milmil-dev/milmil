import MilmilAPI
import SwiftUI

/// 訂閱: the web's RSS page — feeds (what the server polls) and download
/// rules (what it takes from each feed). Toggling, refresh, preview and the
/// two editor sheets.
@Observable
final class SubscriptionsStore {
    private(set) var feeds: Loadable<[RSSFeed]> = .idle
    private(set) var rules: Loadable<[DownloadRule]> = .idle
    private(set) var refreshing: Set<String> = []
    var toast: String?
    let client: APIClient

    init(client: APIClient) {
        self.client = client
    }

    func load(quiet: Bool = false) async {
        if !quiet {
            feeds = feeds.reloading
            rules = rules.reloading
        }
        async let f = feeds.reloaded { try await self.client.rssFeeds() }
        async let r = rules.reloaded { try await self.client.downloadRules() }
        (feeds, rules) = await (f, r)
    }

    func feedName(_ id: String) -> String {
        feeds.value?.first { $0.id == id }?.name ?? "—"
    }

    func rules(for feed: RSSFeed) -> [DownloadRule] {
        (rules.value ?? []).filter { $0.rssFeedID == feed.id }
    }

    func setEnabled(_ feed: RSSFeed, _ enabled: Bool) async {
        var updated = feed
        updated.enabled = enabled
        await run { try await self.client.updateRSSFeed(updated) }
    }

    func setEnabled(_ rule: DownloadRule, _ enabled: Bool) async {
        var input = DownloadRuleInput(rule)
        input.enabled = enabled
        await run { try await self.client.updateDownloadRule(id: rule.id, input) }
    }

    func refresh(_ feed: RSSFeed) async {
        refreshing.insert(feed.id)
        defer { refreshing.remove(feed.id) }
        await run(success: String(localized: "已更新「\(feed.name)」")) { try await self.client.refreshRSSFeed(id: feed.id) }
    }

    func delete(_ feed: RSSFeed) async {
        await run { try await self.client.deleteRSSFeed(id: feed.id) }
    }

    func delete(_ rule: DownloadRule) async {
        await run { try await self.client.deleteDownloadRule(id: rule.id) }
    }

    struct FeedDraft {
        var name = ""
        var url = ""
        var type = "mikan"
        var interval = 30
        var enabled = true
    }

    func save(feed: RSSFeed?, _ draft: FeedDraft) async throws {
        if var feed {
            feed.name = draft.name
            feed.url = draft.url
            feed.type = draft.type
            feed.fetchIntervalMinutes = draft.interval
            feed.enabled = draft.enabled
            try await client.updateRSSFeed(feed)
        } else {
            _ = try await client.createRSSFeed(
                name: draft.name, url: draft.url, type: draft.type, enabled: draft.enabled, fetchIntervalMinutes: draft.interval
            )
        }
        await load(quiet: true)
    }

    func save(rule: DownloadRule?, _ input: DownloadRuleInput) async throws {
        if let rule {
            try await client.updateDownloadRule(id: rule.id, input)
        } else {
            _ = try await client.createDownloadRule(input)
        }
        await load(quiet: true)
    }

    private func run(success: String? = nil, _ work: () async throws -> Void) async {
        do {
            try await work()
            if let success { toast = success }
        } catch {
            toast = error.localizedDescription
        }
        await load(quiet: true)
    }
}

struct SubscriptionsView: View {
    @Bindable var store: SubscriptionsStore
    @State private var feedSheet: FeedEditorTarget?
    @State private var ruleSheet: RuleEditorTarget?
    @State private var preview: RSSFeed?
    @State private var confirmDeleteFeed: RSSFeed?
    @State private var confirmDeleteRule: DownloadRule?
    @ObserveInjection private var inject

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            switch (store.feeds, store.rules) {
            case (.loaded(let feeds), .loaded(let rules)):
                feedsSection(feeds)
                rulesSection(rules, feeds: feeds)
            case (.failed(let message), _), (_, .failed(let message)):
                ErrorBanner(message: message) { Task { await store.load() } }
            default:
                ProgressView().frame(maxWidth: .infinity).padding(40)
            }
        }
        .sheet(item: $feedSheet) { target in FeedEditorSheet(store: store, feed: target.feed) }
        .sheet(item: $ruleSheet) { target in RuleEditorSheet(store: store, rule: target.rule, feeds: store.feeds.value ?? []) }
        .sheet(item: $preview) { feed in FeedPreviewSheet(feed: feed, rules: store.rules(for: feed)) }
        .confirmationDialog(
            "刪除訂閱來源「\(confirmDeleteFeed?.name ?? "")」？", isPresented: Binding(get: { confirmDeleteFeed != nil }, set: { if !$0 { confirmDeleteFeed = nil } }),
            titleVisibility: .visible
        ) {
            Button("刪除", role: .destructive) { if let feed = confirmDeleteFeed { Task { await store.delete(feed) } } }
        } message: { Text("使用這個來源的規則也會一起停用。") }
        .confirmationDialog(
            "刪除規則「\(confirmDeleteRule?.name ?? "")」？", isPresented: Binding(get: { confirmDeleteRule != nil }, set: { if !$0 { confirmDeleteRule = nil } }),
            titleVisibility: .visible
        ) {
            Button("刪除", role: .destructive) { if let rule = confirmDeleteRule { Task { await store.delete(rule) } } }
        }
        .overlay(alignment: .bottom) {
            if let toast = store.toast {
                Text(toast)
                    .font(.system(size: 12, weight: .medium))
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .background(.regularMaterial, in: Capsule())
                    .padding(.bottom, 12)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .task { try? await Task.sleep(for: .seconds(2.5)); store.toast = nil }
            }
        }
        .animation(.snappy, value: store.toast)
    }

    private func feedsSection(_ feeds: [RSSFeed]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("訂閱來源").font(.system(size: 15, weight: .bold))
                Text("\(feeds.count)").font(.system(size: 12)).foregroundStyle(Theme.Text.tertiary)
                Spacer()
                Button("新增來源", systemImage: "plus") { feedSheet = FeedEditorTarget(feed: nil) }.controlSize(.small)
            }
            if feeds.isEmpty {
                EmptyState(
                    symbol: "dot.radiowaves.up.forward", title: String(localized: "還沒有訂閱來源"),
                    message: String(localized: "加入 Mikan / Nyaa / DMHY 的 RSS 網址，或在「找種子」用「訂閱此篩選」一鍵建立。")
                )
                .frame(maxWidth: .infinity).padding(.vertical, 24)
            } else {
                VStack(spacing: 6) {
                    ForEach(feeds) { feed in feedRow(feed) }
                }
            }
        }
    }

    private func feedRow(_ feed: RSSFeed) -> some View {
        HStack(spacing: 12) {
            Toggle("", isOn: Binding(get: { feed.enabled }, set: { on in Task { await store.setEnabled(feed, on) } }))
                .toggleStyle(.switch).controlSize(.small).labelsHidden()
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 8) {
                    Text(feed.name).font(.system(size: 13, weight: .semibold))
                    FeedTypeBadge(type: feed.type)
                    let count = store.rules(for: feed).count
                    if count > 0 { Text("\(count) 條規則").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary) }
                }
                HStack(spacing: 8) {
                    Text(feed.url).font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary).lineLimit(1).truncationMode(.middle)
                    Text(feed.lastFetchedAt.map { String(localized: "上次抓取 \(Formatters.relative($0))") } ?? String(localized: "尚未抓取"))
                        .font(.system(size: 11)).foregroundStyle(Theme.Text.muted)
                    Text("每 \(feed.fetchIntervalMinutes) 分鐘").font(.system(size: 11)).foregroundStyle(Theme.Text.muted)
                }
            }
            Spacer()
            Button { preview = feed } label: { Image(systemName: "eye") }.help("預覽內容")
            Button { Task { await store.refresh(feed) } } label: {
                if store.refreshing.contains(feed.id) { ProgressView().controlSize(.small) } else { Image(systemName: "arrow.clockwise") }
            }
            .help("立即抓取")
            .disabled(store.refreshing.contains(feed.id))
            Button { feedSheet = FeedEditorTarget(feed: feed) } label: { Image(systemName: "pencil") }.help("編輯")
            Button(role: .destructive) { confirmDeleteFeed = feed } label: { Image(systemName: "trash") }.help("刪除")
        }
        .buttonStyle(.borderless)
        .padding(.horizontal, 12).padding(.vertical, 9)
        .background(Theme.ink(0.05), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .opacity(feed.enabled ? 1 : 0.6)
    }

    private func rulesSection(_ rules: [DownloadRule], feeds: [RSSFeed]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("下載規則").font(.system(size: 15, weight: .bold))
                Text("\(rules.count)").font(.system(size: 12)).foregroundStyle(Theme.Text.tertiary)
                Spacer()
                Button("新增規則", systemImage: "plus") { ruleSheet = RuleEditorTarget(rule: nil) }.controlSize(.small).disabled(feeds.isEmpty)
            }
            if rules.isEmpty {
                EmptyState(
                    symbol: "line.3.horizontal.decrease.circle", title: String(localized: "還沒有規則"),
                    message: String(localized: "規則決定從來源抓哪些項目：標題正則、解析度、字幕組、集數範圍。")
                )
                    .frame(maxWidth: .infinity).padding(.vertical, 24)
            } else {
                VStack(spacing: 6) {
                    ForEach(rules) { rule in ruleRow(rule) }
                }
            }
        }
    }

    private func ruleRow(_ rule: DownloadRule) -> some View {
        HStack(spacing: 12) {
            Toggle("", isOn: Binding(get: { rule.enabled }, set: { on in Task { await store.setEnabled(rule, on) } }))
                .toggleStyle(.switch).controlSize(.small).labelsHidden()
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 8) {
                    Text(rule.name).font(.system(size: 13, weight: .semibold))
                    Text(store.feedName(rule.rssFeedID)).font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                }
                HStack(spacing: 6) {
                    if !rule.filterRegex.isEmpty { Chip(text: rule.filterRegex, small: true) }
                    if !rule.resolutionFilter.isEmpty { Chip(text: rule.resolutionFilter, isOn: true, small: true) }
                    if !rule.subgroupFilter.isEmpty { Chip(text: rule.subgroupFilter, small: true) }
                    if rule.episodeFilter == "range", !rule.episodeRange.isEmpty {
                        Chip(text: String(localized: "第 \(rule.episodeRange) 集"), small: true)
                    }
                    if rule.episodeFilter == "new" { Chip(text: String(localized: "只抓新集"), small: true) }
                    Text(rule.lastTriggeredAt.map { String(localized: "上次觸發 \(Formatters.relative($0))") } ?? String(localized: "尚未觸發"))
                        .font(.system(size: 11)).foregroundStyle(Theme.Text.muted)
                }
            }
            Spacer()
            Button { ruleSheet = RuleEditorTarget(rule: rule) } label: { Image(systemName: "pencil") }.help("編輯")
            Button(role: .destructive) { confirmDeleteRule = rule } label: { Image(systemName: "trash") }.help("刪除")
        }
        .buttonStyle(.borderless)
        .padding(.horizontal, 12).padding(.vertical, 9)
        .background(Theme.ink(0.05), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .opacity(rule.enabled ? 1 : 0.6)
    }
}

struct FeedEditorTarget: Identifiable {
    let feed: RSSFeed?
    var id: String { feed?.id ?? "new" }
}

struct RuleEditorTarget: Identifiable {
    let rule: DownloadRule?
    var id: String { rule?.id ?? "new" }
}

struct FeedTypeBadge: View {
    let type: String

    var body: some View {
        let color: Color = switch type {
        case "mikan": Color(hex: 0xFB923C)
        case "nyaa": Color(hex: 0x4ADE80)
        case "dmhy": Color(hex: 0x60A5FA)
        default: Theme.Text.tertiary
        }
        return Text(type.uppercased())
            .font(.system(size: 9, weight: .bold))
            .foregroundStyle(color)
            .padding(.horizontal, 5).padding(.vertical, 2)
            .background(color.opacity(0.15), in: RoundedRectangle(cornerRadius: 4))
    }
}

struct FeedEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let store: SubscriptionsStore
    let feed: RSSFeed?
    @State private var draft = SubscriptionsStore.FeedDraft()
    @State private var busy = false
    @State private var error: String?
    @State private var preview: Loadable<RSSPreview> = .idle

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(feed == nil ? String(localized: "新增訂閱來源") : String(localized: "編輯訂閱來源")).font(.system(size: 16, weight: .bold))
            Form {
                TextField("名稱", text: $draft.name, prompt: Text("Mikan Anime"))
                TextField("RSS 網址", text: $draft.url, prompt: Text(verbatim: "https://mikanani.me/RSS/…"))
                Picker("類型", selection: $draft.type) {
                    ForEach(RSSFeed.types, id: \.self) { Text($0 == "custom" ? String(localized: "自訂") : TorrentFinderView.sourceLabel($0)).tag($0) }
                }
                Stepper("每 \(draft.interval) 分鐘抓取", value: $draft.interval, in: 5...1440, step: 5)
                Toggle("啟用", isOn: $draft.enabled)
            }
            .formStyle(.grouped)
            previewBlock
            if let error { Text(error).font(.system(size: 12)).foregroundStyle(Color(hex: 0xF87171)) }
            HStack {
                Button("測試網址") { Task { await testURL() } }.disabled(draft.url.trimmingCharacters(in: .whitespaces).isEmpty)
                Spacer()
                Button("取消") { dismiss() }.keyboardShortcut(.cancelAction)
                Button(busy ? String(localized: "儲存中…") : String(localized: "儲存")) { Task { await save() } }
                    .keyboardShortcut(.defaultAction).glassProminentButtonStyle()
                    .disabled(busy || draft.name.trimmingCharacters(in: .whitespaces).isEmpty || draft.url.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .padding(20)
        .frame(width: 520)
        .onAppear {
            guard let feed else { return }
            draft = .init(name: feed.name, url: feed.url, type: feed.type, interval: feed.fetchIntervalMinutes, enabled: feed.enabled)
        }
    }

    @ViewBuilder private var previewBlock: some View {
        switch preview {
        case .loading:
            ProgressView().controlSize(.small)
        case let .loaded(result):
            Text("網址有效：目前 \(result.total) 個項目").font(.system(size: 12)).foregroundStyle(Color(hex: 0x4ADE80))
        case let .failed(message):
            Text(message).font(.system(size: 12)).foregroundStyle(Color(hex: 0xF87171))
        case .idle:
            EmptyView()
        }
    }

    private func testURL() async {
        preview = .loading
        preview = await preview.reloaded { try await store.client.previewRSSURL(draft.url.trimmingCharacters(in: .whitespaces)) }
    }

    private func save() async {
        busy = true
        defer { busy = false }
        do {
            var trimmed = draft
            trimmed.name = draft.name.trimmingCharacters(in: .whitespaces)
            trimmed.url = draft.url.trimmingCharacters(in: .whitespaces)
            try await store.save(feed: feed, trimmed)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct RuleEditorSheet: View {
    @Environment(ServerSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    let store: SubscriptionsStore
    let rule: DownloadRule?
    let feeds: [RSSFeed]
    @State private var input = DownloadRuleInput()
    @State private var libraries: [Library] = []
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(rule == nil ? String(localized: "新增下載規則") : String(localized: "編輯下載規則")).font(.system(size: 16, weight: .bold))
            Form {
                Section {
                    TextField("名稱", text: $input.name, prompt: Text("葬送的芙莉蓮 1080p"))
                    Picker("訂閱來源", selection: $input.rssFeedID) {
                        Text("選擇來源…").tag("")
                        ForEach(feeds) { Text($0.name).tag($0.id) }
                    }
                    Toggle("啟用", isOn: $input.enabled)
                }
                Section("篩選") {
                    TextField("標題正則（必填）", text: $input.filterRegex, prompt: Text(".*芙莉蓮.*1080p.*"))
                        .font(.system(.body, design: .monospaced))
                    TextField("排除正則", text: $input.excludeRegex, prompt: Text(".*720p.*"))
                        .font(.system(.body, design: .monospaced))
                    Picker("比對方式", selection: $input.matchMode) {
                        Text("模糊").tag("fuzzy")
                        Text("精確").tag("exact")
                    }
                    Picker("解析度", selection: $input.resolutionFilter) {
                        Text("任意").tag("")
                        ForEach(DownloadRule.resolutions.filter { !$0.isEmpty }, id: \.self) { Text($0).tag($0) }
                    }
                    TextField("字幕組（逗號分隔）", text: $input.subgroupFilter, prompt: Text("Lilith-Raws, ANi"))
                    Stepper("最少種子數：\(input.minSeeders)", value: $input.minSeeders, in: 0...100)
                }
                Section("集數") {
                    Picker("抓取範圍", selection: $input.episodeFilter) {
                        Text("全部").tag("all")
                        Text("只抓新集").tag("new")
                        Text("指定範圍").tag("range")
                    }
                    if input.episodeFilter == "range" {
                        TextField("集數範圍", text: $input.episodeRange, prompt: Text("1-12"))
                    }
                    Stepper("集數偏移：\(input.episodeOffset)", value: $input.episodeOffset, in: -100...100)
                }
                Section("存放") {
                    Picker("媒體庫", selection: $input.libraryID) {
                        Text("不指定").tag("")
                        ForEach(libraries) { Text($0.name).tag($0.id) }
                    }
                    TextField("存放目錄（選填）", text: $input.saveDir, prompt: Text("/media/anime"))
                    TextField("Bangumi ID（選填）", value: $input.bangumiID, format: .number)
                }
            }
            .formStyle(.grouped)
            .frame(minHeight: 420)
            if let error { Text(error).font(.system(size: 12)).foregroundStyle(Color(hex: 0xF87171)) }
            HStack {
                Spacer()
                Button("取消") { dismiss() }.keyboardShortcut(.cancelAction)
                Button(busy ? String(localized: "儲存中…") : String(localized: "儲存")) { Task { await save() } }
                    .keyboardShortcut(.defaultAction).glassProminentButtonStyle()
                    .disabled(busy || input.name.trimmingCharacters(in: .whitespaces).isEmpty || input.rssFeedID.isEmpty || input.filterRegex.isEmpty)
            }
        }
        .padding(20)
        .frame(width: 560)
        .onAppear {
            if let rule { input = DownloadRuleInput(rule) } else if feeds.count == 1 { input.rssFeedID = feeds[0].id }
        }
        .task { libraries = (try? await session.client.libraries()) ?? [] }
    }

    private func save() async {
        busy = true
        defer { busy = false }
        do {
            try await store.save(rule: rule, input)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// What the feed lists right now; rows a rule would take are highlighted.
struct FeedPreviewSheet: View {
    @Environment(ServerSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    let feed: RSSFeed
    let rules: [DownloadRule]
    @State private var ruleID = ""
    @State private var preview: Loadable<RSSPreview> = .idle

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(feed.name).font(.system(size: 16, weight: .bold))
                    Text(feed.url).font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary).lineLimit(1).truncationMode(.middle)
                }
                Spacer()
                Picker("規則", selection: $ruleID) {
                    Text("不套用規則").tag("")
                    ForEach(rules) { Text($0.name).tag($0.id) }
                }
                .fixedSize()
                .onChange(of: ruleID) { Task { await load() } }
            }
            switch preview {
            case let .loaded(result):
                Text(ruleID.isEmpty ? String(localized: "\(result.total) 個項目") : String(localized: "\(result.total) 個項目 · 規則會抓 \(result.matched) 個"))
                    .font(.system(size: 12)).foregroundStyle(Theme.Text.tertiary)
                Table(result.items) {
                    TableColumn("標題") { item in
                        HStack(spacing: 6) {
                            if item.alreadyDownloaded { Image(systemName: "checkmark.circle.fill").foregroundStyle(Color(hex: 0x4ADE80)).help("已下載過") }
                            Text(item.title).lineLimit(2).help(item.title)
                        }
                    }
                    TableColumn("集") { item in Text(item.episode) }.width(40)
                    TableColumn("字幕組") { item in Text(item.subgroup).foregroundStyle(Theme.Text.secondary) }.width(min: 80, ideal: 120)
                    TableColumn("大小") { item in Text(item.size).monospacedDigit() }.width(70)
                    TableColumn("發佈") { item in Text(item.publishDate).font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary) }.width(110)
                }
            case let .failed(message):
                ErrorBanner(message: message) { Task { await load() } }
            default:
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            HStack {
                Spacer()
                Button("關閉") { dismiss() }.keyboardShortcut(.cancelAction)
            }
        }
        .padding(20)
        .frame(width: 760, height: 520)
        .task { await load() }
    }

    private func load() async {
        preview = preview.reloading
        preview = await preview.reloaded { try await session.client.previewRSSFeed(id: feed.id, ruleID: ruleID.isEmpty ? nil : ruleID) }
    }
}
