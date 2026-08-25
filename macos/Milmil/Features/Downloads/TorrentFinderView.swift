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
    @State private var showSubscribe = false
    @State private var searchTask: Task<Void, Never>?
    @ObserveInjection private var inject

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            controls
            if store.mode == .anime, store.selectedAnime == nil {
                animePicker
            } else {
                filters
                results
            }
        }
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

    private var controls: some View {
        HStack(spacing: 10) {
            Segmented(options: TorrentFinderStore.Mode.allCases, selection: $store.mode) { $0.label }
                .frame(width: 160)
                .onChange(of: store.mode) { store.reset() }
            if store.mode == .anime, let anime = store.selectedAnime {
                Button { store.select(nil) } label: { Label("換一部", systemImage: "chevron.left") }
                    .controlSize(.small)
                Text(anime.title).font(.system(size: 14, weight: .semibold)).lineLimit(1)
            } else {
                TextField(store.mode == .anime ? String(localized: "搜尋作品…") : String(localized: "搜尋所有來源…"), text: $store.query)
                    .textFieldStyle(.roundedBorder)
                    .frame(maxWidth: 360)
                    .onSubmit { kick(immediate: true) }
                    .onChange(of: store.query) { kick(immediate: false) }
            }
            Spacer()
        }
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
                ProgressView().frame(maxWidth: .infinity).padding(40)
            }
        }
    }

    private var filters: some View {
        HStack(spacing: 8) {
            Picker("來源", selection: $store.source) {
                Text("全部來源").tag("all")
                ForEach(TorrentResult.sources, id: \.self) { Text(Self.sourceLabel($0)).tag($0) }
            }
            .fixedSize()
            .onChange(of: store.source) { Task { await store.loadTorrents() } }
            Picker("解析度", selection: $store.resolution) {
                Text("任意解析度").tag("")
                ForEach(DownloadRule.resolutions.filter { !$0.isEmpty }, id: \.self) { Text($0).tag($0) }
            }
            .fixedSize()
            Picker("字幕組", selection: $store.subgroup) {
                Text("所有字幕組").tag("all")
                ForEach(store.subgroups, id: \.self) { Text($0).tag($0) }
            }
            .fixedSize()
            .disabled(store.subgroups.isEmpty)
            Spacer()
            if store.mode == .anime {
                Button { showSubscribe = true } label: { Label("訂閱此篩選", systemImage: "dot.radiowaves.up.forward") }
                    .glassProminentButtonStyle()
                    .help("以目前的來源 / 解析度 / 字幕組建立 RSS 訂閱規則，之後新集數自動下載")
            }
        }
    }

    private var results: some View {
        Group {
            switch store.torrents {
            case .idle:
                EmptyState(symbol: "magnet", title: String(localized: "搜尋種子"), message: String(localized: "輸入關鍵字，在所有來源搜尋。"))
                    .frame(maxWidth: .infinity).padding(.top, 40)
            case let .loaded(all) where all.isEmpty:
                EmptyState(symbol: "magnet", title: String(localized: "沒有找到種子"), message: String(localized: "換個來源或關鍵字試試。"))
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
                ProgressView().frame(maxWidth: .infinity).padding(40)
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
        case "dandanplay": "DanDanPlay"
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
                        .buttonStyle(.plain).foregroundStyle(Theme.accent).help("下載")
                        .disabled(hit.downloadURL.isEmpty)
                }
            }
            .width(32)
        }
        .contextMenu(forSelectionType: TorrentResult.ID.self) { ids in
            if let id = ids.first, let hit = hits.first(where: { $0.id == id }) {
                Button("下載") { download(hit) }
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
