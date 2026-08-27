import MilmilAPI
import SwiftUI

/// 找種子: pick a title (Bangumi search) and browse what every tracker has
/// for it — filter by source / resolution / sub-group, download one hit, or
/// turn the filter into an RSS subscription. Keyword mode is the web's raw
/// torrent search page.
@Observable
final class TorrentFinderStore {
    enum Mode: String, CaseIterable, Identifiable {
        case anime, keyword
        var id: String { rawValue }
        var label: String {
            switch self {
            case .anime: String(localized: "作品")
            case .keyword: String(localized: "關鍵字")
            }
        }
    }

    var mode: Mode = .anime
    var query = ""
    var selectedAnime: AnimeSummary?
    var source = "all"
    var resolution = ""
    var subgroup = "all"
    private(set) var animeResults: Loadable<[AnimeSummary]> = .idle
    private(set) var torrents: Loadable<[TorrentResult]> = .idle
    private(set) var pending: Set<String> = []
    private(set) var added: Set<String> = []
    var toast: String?
    private let client: APIClient

    init(client: APIClient) {
        self.client = client
    }

    var subgroups: [String] {
        Array(Set((torrents.value ?? []).map(\.subGroup).filter { !$0.isEmpty })).sorted()
    }

    /// Client-side filter on top of the server's per-source results, with the
    /// same resolution aliases the server's rule matcher uses.
    var filtered: [TorrentResult] {
        (torrents.value ?? []).filter { hit in
            (resolution.isEmpty || Self.matches(title: hit.title, resolution: resolution))
                && (subgroup == "all" || hit.subGroup == subgroup)
        }
    }

    static func matches(title: String, resolution: String) -> Bool {
        let aliases: [String: [String]] = [
            "2160p": ["4k", "2160p", "uhd"], "1080p": ["1080p", "fhd", "fullhd"], "720p": ["720p", "hd"]
        ]
        let lower = title.lowercased()
        return (aliases[resolution.lowercased()] ?? [resolution.lowercased()]).contains { lower.contains($0) }
    }

    func searchAnime() async {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { animeResults = .idle; return }
        animeResults = animeResults.reloading
        animeResults = await animeResults.reloaded { try await self.client.searchAnime(q) }
    }

    func reset() {
        query = ""
        selectedAnime = nil
        animeResults = .idle
        torrents = .idle
        subgroup = "all"
    }

    func select(_ anime: AnimeSummary?) {
        selectedAnime = anime
        torrents = .idle
        subgroup = "all"
        if anime != nil { Task { await loadTorrents() } }
    }

    func loadTorrents() async {
        torrents = torrents.reloading
        switch mode {
        case .anime:
            guard let anime = selectedAnime else { torrents = .idle; return }
            torrents = await torrents.reloaded { try await self.client.animeTorrents(bangumiID: anime.bangumiID, source: self.source) }
        case .keyword:
            let q = query.trimmingCharacters(in: .whitespaces)
            guard !q.isEmpty else { torrents = .idle; return }
            torrents = await torrents.reloaded { try await self.client.searchTorrents(q, source: self.source) }
        }
        if !subgroups.contains(subgroup) { subgroup = "all" }
    }

    func download(_ hit: TorrentResult) async {
        pending.insert(hit.id)
        defer { pending.remove(hit.id) }
        do {
            try await client.addTorrent(url: hit.downloadURL, name: hit.title)
            added.insert(hit.id)
            toast = String(localized: "已加入下載")
        } catch {
            toast = error.localizedDescription
        }
    }
}

struct TorrentFinderView: View {
    @Bindable var store: TorrentFinderStore
    var onSubscribed: () -> Void
    @Environment(ServerSession.self) private var session
    @State private var showSubscribe = false
    @State private var searchTask: Task<Void, Never>?
    @ObserveInjection private var inject

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            controls
            if store.mode == .anime, store.selectedAnime == nil {
                animePicker
            } else {
                // Filters only once there is something to filter; an idle
                // keyword search shows starters instead of three empty menus.
                if store.mode == .anime || store.torrents.value != nil {
                    filters
                }
                results
            }
        }
        .task { await loadStarters() }
        .sheet(isPresented: $showSubscribe) {
            if let anime = store.selectedAnime {
                SubscribeSheet(
                    anime: anime,
                    source: TorrentResult.rssSources.contains(store.source) ? store.source : "mikan",
                    resolution: store.resolution,
                    subgroup: store.subgroup == "all" ? "" : store.subgroup,
                    matchCount: store.filtered.count
                ) { onSubscribed() }
            }
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

    /// One search bar: the mode toggle sits inside its leading edge, the
    /// field takes the width, a clear button appears with text.
    private var controls: some View {
        HStack(spacing: 10) {
            Segmented(options: TorrentFinderStore.Mode.allCases, selection: $store.mode) { $0.label }
                .frame(width: 150)
                .onChange(of: store.mode) { store.reset() }
            if store.mode == .anime, let anime = store.selectedAnime {
                Button { store.select(nil) } label: { Label("換一部", systemImage: "chevron.left") }
                    .controlSize(.small)
                Text(anime.title).font(.system(size: 14, weight: .semibold)).lineLimit(1)
            } else {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.Text.tertiary)
                    TextField(store.mode == .anime ? String(localized: "搜尋作品…") : String(localized: "搜尋所有來源…"), text: $store.query)
                        .textFieldStyle(.plain)
                        .font(.system(size: 13))
                        .onSubmit { remember(store.query); kick(immediate: true) }
                        .onChange(of: store.query) { kick(immediate: false) }
                    if !store.query.isEmpty {
                        Button { store.query = "" } label: {
                            Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.Text.muted)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("清除")
                    }
                }
                .padding(.horizontal, 10)
                .frame(height: 32)
                .background(Theme.ink(0.06), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).strokeBorder(Theme.ink(0.08), lineWidth: 1))
                .frame(maxWidth: 520)
            }
            Spacer()
        }
    }

    // MARK: Starters (idle keyword search)

    private static let recentKey = "torrents.recentQueries"
    @State private var recentQueries: [String] = UserDefaults.standard.stringArray(forKey: recentKey) ?? []
    @State private var followedTitles: [String] = []

    private func remember(_ query: String) {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        var list = recentQueries.filter { $0.caseInsensitiveCompare(trimmed) != .orderedSame }
        list.insert(trimmed, at: 0)
        recentQueries = Array(list.prefix(8))
        UserDefaults.standard.set(recentQueries, forKey: Self.recentKey)
    }

    private func loadStarters() async {
        guard followedTitles.isEmpty, let watching = try? await session.client.collection(status: .watching) else { return }
        followedTitles = Array(watching.map(\.title).prefix(8))
    }

    private func start(_ query: String) {
        store.query = query
        remember(query)
        kick(immediate: true)
    }

    /// Recent keywords and the series being followed, as one-click searches —
    /// the empty state used to be a lone icon under three empty filter menus.
    /// Everything is centred under the icon and wraps, so one chip or eight
    /// read as part of the same block.
    private var starters: some View {
        VStack(spacing: 14) {
            EmptyState(symbol: "magnifyingglass", title: String(localized: "搜尋種子"), message: String(localized: "輸入關鍵字，在所有來源搜尋。"))
            if !recentQueries.isEmpty {
                starterRow(symbol: "clock", title: String(localized: "最近搜尋"), items: recentQueries)
            }
            if !followedTitles.isEmpty {
                starterRow(symbol: "bookmark", title: String(localized: "追緊嘅番"), items: followedTitles)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 24)
    }

    private func starterRow(symbol: String, title: String, items: [String]) -> some View {
        CenteredFlow(spacing: 8) {
            Label(title, systemImage: symbol)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.Text.tertiary)
                .padding(.trailing, 2)
            ForEach(items, id: \.self) { item in
                StarterChip(title: item) { start(item) }
            }
        }
        .frame(maxWidth: 760)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(title)
    }

    private func kick(immediate: Bool) {
        searchTask?.cancel()
        searchTask = Task {
            if !immediate { try? await Task.sleep(for: .milliseconds(450)) }
            guard !Task.isCancelled else { return }
            switch store.mode {
            case .anime: await store.searchAnime()
            case .keyword: await store.loadTorrents()
            }
        }
    }

    private var animePicker: some View {
        Group {
            switch store.animeResults {
            case .idle:
                EmptyState(symbol: "magnifyingglass", title: String(localized: "先選一部作品"), message: String(localized: "輸入作品名稱，從 Bangumi 搜尋結果挑一部，再看各站種子。"))
                    .frame(maxWidth: .infinity).padding(.top, 40)
            case let .loaded(items) where items.isEmpty:
                EmptyState(symbol: "magnifyingglass", title: String(localized: "沒有符合的作品"), message: String(localized: "試試原名或英文名。"))
                    .frame(maxWidth: .infinity).padding(.top, 40)
            case let .loaded(items):
                PosterGrid(items: items) { anime in
                    PosterCard(summary: anime, subtitle: Formatters.season(from: anime.airDate)) { store.select(anime) }
                }
            case let .failed(message):
                ErrorBanner(message: message) { Task { await store.searchAnime() } }
            default:
                PosterGridSkeleton(count: 8)
            }
        }
    }

    /// Filter chips: the value is the label (no "Source:" prefixes), accent
    /// when narrowed, sub-groups only once results say which exist.
    private var filters: some View {
        HStack(spacing: 8) {
            filterChip(String(localized: "全部來源"), value: store.source == "all" ? nil : Self.sourceLabel(store.source)) {
                Picker("來源", selection: $store.source) {
                    Text("全部來源").tag("all")
                    ForEach(TorrentResult.sources, id: \.self) { Text(Self.sourceLabel($0)).tag($0) }
                }
                .pickerStyle(.inline)
            }
            .onChange(of: store.source) { Task { await store.loadTorrents() } }
            filterChip(String(localized: "任意解析度"), value: store.resolution.isEmpty ? nil : store.resolution) {
                Picker("解析度", selection: $store.resolution) {
                    Text("任意解析度").tag("")
                    ForEach(DownloadRule.resolutions.filter { !$0.isEmpty }, id: \.self) { Text($0).tag($0) }
                }
                .pickerStyle(.inline)
            }
            if !store.subgroups.isEmpty {
                filterChip(String(localized: "所有字幕組"), value: store.subgroup == "all" ? nil : store.subgroup) {
                    Picker("字幕組", selection: $store.subgroup) {
                        Text("所有字幕組").tag("all")
                        ForEach(store.subgroups, id: \.self) { Text($0).tag($0) }
                    }
                    .pickerStyle(.inline)
                }
            }
            Spacer()
            if store.mode == .anime {
                Button { showSubscribe = true } label: { Label("訂閱此篩選", systemImage: "dot.radiowaves.up.forward") }
                    .glassProminentButtonStyle()
                    .help("以目前的來源 / 解析度 / 字幕組建立 RSS 訂閱規則，之後新集數自動下載")
            }
        }
    }

    private func filterChip(_ title: String, value: String?, @ViewBuilder menu: () -> some View) -> some View {
        Menu {
            menu()
        } label: {
            HStack(spacing: 4) {
                Text(value ?? title)
                Image(systemName: "chevron.down").font(.system(size: 8, weight: .bold))
            }
            .font(.system(size: 12, weight: .medium))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(value != nil ? Theme.accent.opacity(0.22) : Theme.ink(0.07), in: Capsule())
            .foregroundStyle(value != nil ? Theme.accent : Theme.Text.secondary)
        }
        .buttonStyle(.plain)
        .menuIndicator(.hidden)
        .fixedSize()
    }

    private var results: some View {
        Group {
            switch store.torrents {
            case .idle:
                starters
            case let .loaded(all) where all.isEmpty:
                EmptyState(symbol: "tray", title: String(localized: "沒有找到種子"), message: String(localized: "換個來源或關鍵字試試。"))
                    .frame(maxWidth: .infinity).padding(.top, 40)
            case .loaded:
                VStack(alignment: .leading, spacing: 6) {
                    Text("\(store.filtered.count) 個結果").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                    TorrentTable(hits: store.filtered, pending: store.pending, added: store.added) { hit in
                        Task { await store.download(hit) }
                    }
                    .frame(height: min(CGFloat(store.filtered.count) * 62 + 44, 1100))
                }
            case let .failed(message):
                ErrorBanner(message: message) { Task { await store.loadTorrents() } }
            default:
                SkeletonRows(count: 8, height: 62, leading: 0)
            }
        }
    }

    static func sourceLabel(_ source: String) -> String {
        switch source {
        case "nyaa": "Nyaa"
        case "dmhy": "DMHY"
        case "mikan": "Mikan"
        case "bangumi.moe": "Bangumi.moe"
        case "acg.rip": "ACG.RIP"
        default: source
        }
    }
}

struct TorrentTable: View {
    let hits: [TorrentResult]
    let pending: Set<String>
    let added: Set<String>
    var download: (TorrentResult) -> Void

    var body: some View {
        Table(hits) {
            TableColumn("標題") { hit in
                Text(hit.title).lineLimit(2).help(hit.title)
            }
            TableColumn("字幕組") { hit in Text(hit.subGroup).foregroundStyle(Theme.Text.secondary) }.width(min: 80, ideal: 120)
            TableColumn("大小") { hit in Text(hit.size).monospacedDigit() }.width(70)
            TableColumn("種子") { hit in
                Text("\(hit.seeders)").monospacedDigit().foregroundStyle(hit.seeders > 0 ? Color(hex: 0x4ADE80) : Theme.Text.tertiary)
            }
            .width(48)
            TableColumn("來源") { hit in Text(TorrentFinderView.sourceLabel(hit.sourceSite)).font(.system(size: 11)) }.width(90)
            TableColumn("日期") { hit in
                Text(hit.publishDate.map { Formatters.relative($0) } ?? "—").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
            }
            .width(80)
            TableColumn("") { hit in
                if added.contains(hit.id) {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(Color(hex: 0x4ADE80)).help("已加入下載")
                } else if pending.contains(hit.id) {
                    ProgressView().controlSize(.small)
                } else {
                    Button { download(hit) } label: { Image(systemName: "arrow.down.circle") }
                        .buttonStyle(.plain).foregroundStyle(Theme.accent).help("加入下載")
                        .disabled(hit.downloadURL.isEmpty)
                }
            }
            .width(32)
        }
        .contextMenu(forSelectionType: TorrentResult.ID.self) { ids in
            if let id = ids.first, let hit = hits.first(where: { $0.id == id }) {
                Button("加入下載") { download(hit) }
                Button("複製磁力連結") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(hit.downloadURL, forType: .string)
                }
                .disabled(hit.downloadURL.isEmpty)
            }
        }
    }
}

/// The web's SubscribePanel: confirm source / query / sub-group / resolution
/// / library, then `POST /subscribe` creates feed + rule in one go.
struct SubscribeSheet: View {
    @Environment(ServerSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    let anime: AnimeSummary
    @State var source: String
    @State var resolution: String
    @State var subgroup: String
    let matchCount: Int
    var onDone: () -> Void
    @State private var query: String = ""
    @State private var libraryID = ""
    @State private var libraries: [Library] = []
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("訂閱「\(anime.title)」").font(.system(size: 16, weight: .bold))
            Text("建立一條 RSS 訂閱規則：之後符合條件的新集數會自動加入下載。").font(.system(size: 12)).foregroundStyle(Theme.Text.tertiary)
            Form {
                Picker("來源", selection: $source) {
                    ForEach(TorrentResult.rssSources, id: \.self) { Text(TorrentFinderView.sourceLabel($0)).tag($0) }
                }
                TextField("搜尋關鍵字", text: $query, prompt: Text(anime.title))
                TextField("字幕組（選填）", text: $subgroup)
                Picker("解析度", selection: $resolution) {
                    Text("任意").tag("")
                    ForEach(DownloadRule.resolutions.filter { !$0.isEmpty }, id: \.self) { Text($0).tag($0) }
                }
                Picker("媒體庫", selection: $libraryID) {
                    Text("不指定").tag("")
                    ForEach(libraries) { Text($0.name).tag($0.id) }
                }
                LabeledContent("目前符合") { Text("\(matchCount) 個種子") }
            }
            .formStyle(.grouped)
            if let error { Text(error).font(.system(size: 12)).foregroundStyle(Color(hex: 0xF87171)) }
            HStack {
                Spacer()
                Button("取消") { dismiss() }.keyboardShortcut(.cancelAction)
                Button(busy ? String(localized: "建立中…") : String(localized: "訂閱")) { Task { await submit() } }
                    .keyboardShortcut(.defaultAction).glassProminentButtonStyle().disabled(busy)
            }
        }
        .padding(20)
        .frame(width: 460)
        .task { libraries = (try? await session.client.libraries()) ?? [] }
    }

    private func submit() async {
        busy = true
        defer { busy = false }
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        let input = SubscribeInput(
            animeName: anime.title, source: source, query: trimmed.isEmpty ? nil : trimmed,
            subGroup: subgroup.isEmpty ? nil : subgroup, resolution: resolution.isEmpty ? nil : resolution,
            libraryID: libraryID.isEmpty ? nil : libraryID, bangumiID: anime.bangumiID
        )
        do {
            _ = try await session.client.subscribe(input)
            dismiss()
            onDone()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// A one-click search suggestion; hover lifts it like the other chips.
private struct StarterChip: View {
    let title: String
    let action: () -> Void
    @State private var hovered = false

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 12, weight: .medium))
                .lineLimit(1)
                .truncationMode(.middle)
                .frame(maxWidth: 240)
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(Theme.ink(hovered ? 0.12 : 0.07), in: Capsule())
                .foregroundStyle(hovered ? Theme.Text.primary : Theme.Text.secondary)
        }
        .buttonStyle(.plain)
        .onHover { hovered = $0 }
        .animation(.easeOut(duration: 0.12), value: hovered)
    }
}

/// Wrapping row whose lines are centred — SwiftUI has no flow layout, and a
/// horizontal ScrollView would clip the second line of chips.
private struct CenteredFlow: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        return CGSize(width: width == .infinity ? 0 : width, height: rows(subviews, width: width).height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let layout = rows(subviews, width: bounds.width)
        var y = bounds.minY
        for row in layout.rows {
            let rowWidth = row.reduce(0) { $0 + subviews[$1].sizeThatFits(.unspecified).width } + spacing * CGFloat(max(0, row.count - 1))
            var x = bounds.minX + (bounds.width - rowWidth) / 2
            let rowHeight = row.map { subviews[$0].sizeThatFits(.unspecified).height }.max() ?? 0
            for index in row {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: y + (rowHeight - size.height) / 2), proposal: .unspecified)
                x += size.width + spacing
            }
            y += rowHeight + spacing
        }
    }

    private func rows(_ subviews: Subviews, width: CGFloat) -> (rows: [[Int]], height: CGFloat) {
        var rows: [[Int]] = [[]]
        var lineWidth: CGFloat = 0
        var height: CGFloat = 0
        var lineHeight: CGFloat = 0
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            if !rows[rows.count - 1].isEmpty, lineWidth + spacing + size.width > width {
                height += lineHeight + spacing
                rows.append([])
                lineWidth = 0
                lineHeight = 0
            }
            if !rows[rows.count - 1].isEmpty { lineWidth += spacing }
            rows[rows.count - 1].append(index)
            lineWidth += size.width
            lineHeight = max(lineHeight, size.height)
        }
        return (rows, height + lineHeight)
    }
}
