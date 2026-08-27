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
    /// Quiet suggestions above the rule list; dismissals stick per series.
    private(set) var advice: [SubscriptionAdvice] = []
    private let defaults = UserDefaults.standard
    private static let dismissedKey = "subscriptions.advice.dismissed"

    init(client: APIClient) {
        self.client = client
    }

    /// A rule whose series is complete on disk (nothing missing, nothing
    /// pending) can go quiet; a followed series whose franchise has a newer
    /// season airing without a rule of its own can be followed the same way.
    func loadAdvice() async {
        let active = (rules.value ?? []).filter { $0.enabled && ($0.bangumiID ?? 0) > 0 }.prefix(30)
        let dismissed = Set(defaults.stringArray(forKey: Self.dismissedKey) ?? [])
        let ruled = Set((rules.value ?? []).compactMap(\.bangumiID))
        let found = await withTaskGroup(of: [SubscriptionAdvice].self) { group in
            for rule in active {
                guard let bangumiID = rule.bangumiID else { continue }
                group.addTask { [client] in
                    var out: [SubscriptionAdvice] = []
                    if let report = try? await client.animeMissing(bangumiID: bangumiID),
                       !report.unknownTotal, report.total > 0, report.missing.isEmpty, report.airingPending.isEmpty {
                        out.append(SubscriptionAdvice(id: "disable-\(rule.id)", kind: .complete, rule: rule, sequel: nil))
                    }
                    if let franchise = try? await client.franchise(bangumiID: bangumiID),
                       let sequel = Self.airingSequel(of: bangumiID, in: franchise.mainSeries, excluding: ruled) {
                        out.append(SubscriptionAdvice(id: "sequel-\(sequel.bangumiID)", kind: .sequel, rule: rule, sequel: sequel))
                    }
                    return out
                }
            }
            var all: [SubscriptionAdvice] = []
            for await part in group { all.append(contentsOf: part) }
            return all
        }
        advice = found.filter { !dismissed.contains($0.id) }.sorted { $0.id < $1.id }
    }

    func dismiss(_ item: SubscriptionAdvice) {
        var list = defaults.stringArray(forKey: Self.dismissedKey) ?? []
        list.append(item.id)
        defaults.set(list, forKey: Self.dismissedKey)
        advice.removeAll { $0.id == item.id }
    }

    /// The next season after `bangumiID` in the franchise's main line that
    /// started airing within the last four months (or starts within a
    /// month) and has no rule yet.
    nonisolated static func airingSequel(of bangumiID: Int, in series: [FranchiseEntry], excluding ruled: Set<Int>, now: Date = Date()) -> FranchiseEntry? {
        guard let current = series.first(where: { $0.bangumiID == bangumiID }) else { return nil }
        let window = (now.addingTimeInterval(-120 * 24 * 3600))...(now.addingTimeInterval(30 * 24 * 3600))
        return series
            .filter { $0.bangumiID > 0 && $0.bangumiID != bangumiID && !ruled.contains($0.bangumiID) }
            .filter { $0.season > current.season || ($0.season == current.season && $0.part > current.part) }
            .filter { entry in Formatters.day(from: entry.airDate).map { window.contains($0) } ?? false }
            .min { ($0.season, $0.part) < ($1.season, $1.part) }
    }

    func load(quiet: Bool = false) async {
        if !quiet {
            feeds = feeds.reloading
            rules = rules.reloading
        }
        async let f = feeds.reloaded { try await self.client.rssFeeds() }
        async let r = rules.reloaded { try await self.client.downloadRules() }
        (feeds, rules) = await (f, r)
        await loadAdvice()
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
                adviceSection
                rulesSection(rules, feeds: feeds)
            case (.failed(let message), _), (_, .failed(let message)):
                ErrorBanner(message: message) { Task { await store.load() } }
            default:
                VStack(alignment: .leading, spacing: 22) {
                    SkeletonSection(rows: 3, leading: 0)
                    SkeletonSection(rows: 4, leading: 0)
                }
            }
        }
        .sheet(item: $feedSheet) { target in FeedEditorSheet(store: store, feed: target.feed) }
        .sheet(item: $ruleSheet) { target in RuleEditorSheet(store: store, rule: target.rule, prefill: target.prefill, feeds: store.feeds.value ?? []) }
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

    /// Quiet rows: a finished, complete series whose rule can rest; a newer
    /// season airing that the old rule could follow. Each dismisses for good.
    @ViewBuilder private var adviceSection: some View {
        if !store.advice.isEmpty {
            VStack(spacing: 6) {
                ForEach(store.advice) { item in adviceRow(item) }
            }
            .transition(.opacity)
        }
    }

    private func adviceRow(_ item: SubscriptionAdvice) -> some View {
        HStack(spacing: 10) {
            Image(systemName: item.kind == .complete ? "checkmark.seal" : "sparkles")
                .font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.accent)
            VStack(alignment: .leading, spacing: 2) {
                let name = item.rule.name
                switch item.kind {
                case .complete:
                    Text("「\(name)」呢套完咗，全部集數都齊，停用規則？").font(.system(size: 12, weight: .medium))
                case .sequel:
                    let title = item.sequel?.title ?? ""
                    Text("《\(title)》開始咗，要唔要照「\(name)」嘅規則追？").font(.system(size: 12, weight: .medium))
                }
            }
            Spacer(minLength: 8)
            switch item.kind {
            case .complete:
                Button("停用") { Task { await store.setEnabled(item.rule, false); store.dismiss(item) } }
                    .controlSize(.small)
            case .sequel:
                Button("照舊追") {
                    var input = DownloadRuleInput(item.rule)
                    input.name = item.sequel?.title ?? item.rule.name
                    input.bangumiID = item.sequel?.bangumiID
                    input.episodeRange = ""
                    ruleSheet = RuleEditorTarget(rule: nil, prefill: input)
                    store.dismiss(item)
                }
                .controlSize(.small)
            }
            Button {
                store.dismiss(item)
            } label: {
                Image(systemName: "xmark").font(.system(size: 10, weight: .bold))
            }
            .buttonStyle(.plain).foregroundStyle(Theme.Text.tertiary)
            .help("不再提示")
            .accessibilityLabel("不再提示")
        }
        .padding(.horizontal, 12).padding(.vertical, 9)
        .background(Theme.accent.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
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
    /// A new rule opened from an advice row starts from the old rule's fields.
    var prefill: DownloadRuleInput?
    var id: String { rule?.id ?? prefill.map { "new-\($0.bangumiID ?? 0)" } ?? "new" }
}

/// One suggestion row above the rule list.
struct SubscriptionAdvice: Identifiable, Equatable {
    enum Kind { case complete, sequel }
    let id: String
    let kind: Kind
    let rule: DownloadRule
    let sequel: FranchiseEntry?
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
    var prefill: DownloadRuleInput?
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
            if let rule {
                input = DownloadRuleInput(rule)
            } else if let prefill {
                input = prefill
            } else if feeds.count == 1 {
                input.rssFeedID = feeds[0].id
            }
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
