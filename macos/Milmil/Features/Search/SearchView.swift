import MilmilAPI
import SwiftUI

@Observable
final class SearchStore {
    var query = ""
    var genres: Set<Genre> = []
    /// Bangumi tags (from the hot-tags row); tag browse is a server-side mode.
    var tags: [String] = []
    var year: Int?
    var season: Season?
    var status: AiringStatus?
    var minScore: Double = 0
    var sort: BrowseQuery.Sort = .popularity
    var adult = false

    private(set) var local: [LocalSearchHit] = []
    private(set) var remote: Loadable<[AnimeSummary]> = .idle
    private(set) var hotTags: [HotTag] = []
    /// A refresh is in flight while the previous results stay on screen.
    private(set) var searching = false
    private(set) var loadingMore = false
    private var page = 1
    private var exhausted = false
    private var searchTask: Task<Void, Never>?
    private let client: APIClient

    init(client: APIClient) {
        self.client = client
    }

    var hasQuery: Bool { !query.trimmingCharacters(in: .whitespaces).isEmpty }
    var isTagMode: Bool { !hasQuery && !tags.isEmpty }

    /// Anything the "清除篩選" button would reset.
    var hasActiveFilters: Bool {
        !genres.isEmpty || !tags.isEmpty || year != nil || season != nil || status != nil || minScore > 0 || adult || sort != .popularity
    }

    /// Changes whenever any filter changes; drives the debounced re-search.
    var filterSignature: String {
        let parts = [
            sort.rawValue, year.map(String.init) ?? "", season?.rawValue ?? "", status?.rawValue ?? "",
            genres.map(\.rawValue).sorted().joined(separator: ","), tags.joined(separator: ","),
            String(minScore), String(adult),
        ]
        return parts.joined(separator: "|")
    }

    func toggleGenre(_ genre: Genre) {
        if genres.remove(genre) == nil { genres.insert(genre) }
    }

    /// Tag browse can't refine a text search (summaries carry no tags), so
    /// entering tag mode clears the query — mirroring the web page.
    func toggleTag(_ tag: String) {
        if let index = tags.firstIndex(of: tag) {
            tags.remove(at: index)
        } else {
            tags.append(tag)
            query = ""
        }
    }

    func clearFilters() {
        genres = []
        tags = []
        year = nil
        season = nil
        status = nil
        minScore = 0
        sort = .popularity
        adult = false
    }

    func loadHotTags() async {
        guard hotTags.isEmpty else { return }
        hotTags = (try? await client.hotTags()) ?? []
    }

    /// Debounced: the web waits 300 ms too.
    func scheduleSearch() {
        searchTask?.cancel()
        searchTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await search()
        }
    }

    func search() async {
        let text = query.trimmingCharacters(in: .whitespaces)
        page = 1
        exhausted = false
        searching = true
        defer { searching = false }
        remote = remote.reloading

        if text.isEmpty {
            local = []
            let result = await remote.reloaded { try await fetchPage(1) }
            guard !Task.isCancelled else { return }
            exhausted = (result.value?.count ?? 0) < 20
            remote = result
            return
        }

        // Text search is a single page; the endpoint has no filters, so apply
        // the cheap ones client-side.
        exhausted = true
        async let localHits = (try? client.searchLibrary(text, limit: 8)) ?? []
        let result = await remote.reloaded {
            let hits = try await client.searchAnime(text, adult: adult)
            return applyFilters(hits)
        }
        let localValue = await localHits
        guard !Task.isCancelled else { return }
        remote = result
        local = localValue
    }

    /// Next page for browse / tag mode, appended without duplicates.
    func loadMore() async {
        guard !hasQuery, !exhausted, !loadingMore, case let .loaded(items) = remote else { return }
        loadingMore = true
        defer { loadingMore = false }
        page += 1
        do {
            let batch = try await fetchPage(page)
            let fresh = batch.filter { new in !items.contains { $0.id == new.id } }
            remote = .loaded(items + fresh)
            exhausted = batch.count < 20
        } catch {
            exhausted = true
        }
    }

    private func fetchPage(_ page: Int) async throws -> [AnimeSummary] {
        if isTagMode {
            return try await client.browse(tag: tags.joined(separator: ","), sort: sort, page: page)
        }
        // AniList browse is the flakiest upstream; with no filters, trending
        // is an honest stand-in.
        let unfiltered = !hasActiveFilters
        do {
            return try await client.browse(browseQuery(page: page))
        } catch APIError.serverUnavailable where unfiltered {
            return try await client.trending(page: page)
        }
    }

    private func browseQuery(page: Int) -> BrowseQuery {
        BrowseQuery(
            genre: genres.isEmpty ? nil : genres.map(\.rawValue).sorted().joined(separator: ","),
            sort: sort,
            year: year,
            season: season?.rawValue,
            minScore: minScore > 0 ? minScore : nil,
            status: status?.rawValue,
            adult: adult,
            page: page
        )
    }

    private func applyFilters(_ items: [AnimeSummary]) -> [AnimeSummary] {
        items.filter { item in
            if !genres.isEmpty {
                let itemGenres = Set(item.genres)
                guard genres.allSatisfy({ itemGenres.contains($0.rawValue) || itemGenres.contains($0.label) }) else { return false }
            }
            if let year, !(item.airDate?.hasPrefix(String(year)) ?? false) { return false }
            if minScore > 0, item.score < minScore { return false }
            return true
        }
    }
}

extension BrowseQuery.Sort {
    var label: String {
        switch self {
        case .popularity: String(localized: "人氣")
        case .score: String(localized: "評分")
        case .trending: String(localized: "趨勢")
        case .date: String(localized: "日期")
        }
    }
}

struct SearchView: View {
    @Environment(ServerSession.self) private var session
    @Environment(Router.self) private var router
    @Environment(BackdropStore.self) private var backdrop
    @State private var store: SearchStore?
    @FocusState private var focused: Bool
    @ObserveInjection private var inject

    var body: some View {
        Group {
            if let store { content(store) } else { Color.clear }
        }
        .navigationTitle("搜尋")
        .task {
            if store == nil {
                store = SearchStore(client: session.client)
                await store?.search()
            }
            focused = true
            backdrop.set(nil, seed: "search", dim: 0.6, owner: "search")
            await store?.loadHotTags()
        }
        .onDisappear { backdrop.clear(owner: "search") }
    }

    private func content(_ store: SearchStore) -> some View {
        @Bindable var store = store
        return ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                searchField(store)
                chips(store)
                filters(store)

                if !store.local.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        Label("在你的媒體庫", systemImage: "folder").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.Text.secondary)
                        Shelf {
                            ForEach(store.local) { hit in
                                PosterCard(title: hit.title, cover: nil, badge: String(localized: "媒體庫")) {
                                    if let id = hit.bangumiID { router.openAnime(id) }
                                }
                            }
                        }
                    }
                }

                results(store)
            }
            .padding(.horizontal, 40)
            .padding(.top, 20)
            .padding(.bottom, 40)
        }
        .background(
            // Page-local ⌘F jumps back to the query field.
            Button("") { focused = true }.keyboardShortcut("f", modifiers: .command).hidden()
        )
    }

    private func searchField(_ store: SearchStore) -> some View {
        @Bindable var store = store
        return HStack(spacing: 10) {
            Image(systemName: "magnifyingglass").foregroundStyle(Theme.Text.tertiary)
            TextField("搜尋作品（Bangumi / AniList）…", text: $store.query)
                .textFieldStyle(.plain)
                .font(.system(size: 20, weight: .semibold))
                .focused($focused)
                .onChange(of: store.query) {
                    // Typing leaves tag mode: tags can't refine a text search.
                    if store.hasQuery, !store.tags.isEmpty { store.tags = [] }
                    store.scheduleSearch()
                }
                .onSubmit { Task { await store.search() } }
            if store.hasQuery {
                Button { store.query = "" } label: { Image(systemName: "xmark.circle.fill") }
                    .buttonStyle(.plain).foregroundStyle(Theme.Text.tertiary)
            }
        }
        .padding(.horizontal, 16)
        .frame(height: 48)
        .background(Theme.ink(0.07), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(focused ? Theme.accent.opacity(0.45) : Theme.ink(0.08)))
        .shadow(color: Theme.accent.opacity(focused ? 0.18 : 0), radius: 18, y: 4)
        .animation(.easeOut(duration: 0.2), value: focused)
    }

    /// Genre quick-filters plus the top Bangumi tags, like the web page's chip rows.
    private func chips(_ store: SearchStore) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            FlowLayout(spacing: 8) {
                ForEach(Genre.allCases) { genre in
                    Button { store.toggleGenre(genre) } label: { Chip(text: genre.label, isOn: store.genres.contains(genre)) }
                        .buttonStyle(.plain)
                }
            }
            if !store.hotTags.isEmpty {
                FlowLayout(spacing: 8) {
                    ForEach(store.hotTags.prefix(14)) { tag in
                        Button { store.toggleTag(tag.name) } label: {
                            Chip(text: tag.name, isOn: store.tags.contains(tag.name), small: true)
                                .opacity(store.tags.contains(tag.name) ? 1 : 0.75)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    /// Filter pills: each shows its chosen value and tints accent when active,
    /// so the row itself is the filter summary.
    private func filters(_ store: SearchStore) -> some View {
        @Bindable var store = store
        return HStack(spacing: 8) {
            Image(systemName: "line.3.horizontal.decrease").foregroundStyle(Theme.Text.tertiary)
            filterMenu(String(localized: "排序"), value: store.sort == .popularity ? nil : store.sort.label) {
                Picker("排序", selection: $store.sort) {
                    ForEach(BrowseQuery.Sort.allCases, id: \.self) { Text($0.label).tag($0) }
                }
            }
            filterMenu(String(localized: "年份"), value: store.year.map(String.init)) {
                Picker("年份", selection: $store.year) {
                    Text("全部").tag(Int?.none)
                    ForEach((2000...Season.current().year + 1).reversed(), id: \.self) { Text(String($0)).tag(Int?.some($0)) }
                }
            }
            filterMenu(String(localized: "季節"), value: store.season?.label) {
                Picker("季節", selection: $store.season) {
                    Text("全部").tag(Season?.none)
                    ForEach(Season.allCases) { Text($0.label).tag(Season?.some($0)) }
                }
            }
            filterMenu(String(localized: "狀態"), value: store.status?.label) {
                Picker("狀態", selection: $store.status) {
                    Text("全部").tag(AiringStatus?.none)
                    ForEach(AiringStatus.allCases) { Text($0.label).tag(AiringStatus?.some($0)) }
                }
            }
            filterMenu(String(localized: "最低分"), value: store.minScore > 0 ? store.minScore.formatted(.number.precision(.fractionLength(1))) + "+" : nil) {
                Picker("最低分", selection: $store.minScore) {
                    Text("不限").tag(0.0)
                    ForEach([6.0, 7.0, 8.0, 9.0], id: \.self) { Text("\($0, format: .number.precision(.fractionLength(1)))+").tag($0) }
                }
            }
            Button { store.adult.toggle() } label: {
                Text("NSFW")
                    .font(.system(size: 11, weight: .bold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(store.adult ? Color.red.opacity(0.18) : Theme.ink(0.07), in: Capsule())
                    .foregroundStyle(store.adult ? Color(hex: 0xF87171) : Theme.Text.tertiary)
            }
            .buttonStyle(.plain)
            if store.hasActiveFilters {
                Button {
                    store.clearFilters()
                } label: {
                    Label("清除篩選", systemImage: "xmark")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(Theme.Text.tertiary)
                }
                .buttonStyle(.plain)
            }
            Spacer()
        }
        .onChange(of: store.filterSignature) { store.scheduleSearch() }
    }

    private func filterMenu(_ title: String, value: String?, @ViewBuilder menu: () -> some View) -> some View {
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
            .foregroundStyle(value != nil ? Color(hex: 0xD6CCFF) : Theme.Text.secondary)
        }
        .buttonStyle(.plain)
        .menuIndicator(.hidden)
        .fixedSize()
    }

    @ViewBuilder
    private func results(_ store: SearchStore) -> some View {
        switch store.remote {
        case let .loaded(items):
            if items.isEmpty {
                EmptyState(
                    symbol: "magnifyingglass",
                    title: store.hasQuery ? String(localized: "找不到「\(store.query)」") : String(localized: "沒有符合的作品"),
                    message: String(localized: "試試原名或英文名；⌘K 也會同時搜尋媒體庫。")
                )
                .frame(maxWidth: .infinity)
            } else {
                resultsHeader(store, count: items.count)
                PosterGrid(
                    items: items,
                    onReachEnd: { Task { await store.loadMore() } },
                    card: { item in PosterCard(summary: item, onOpen: { router.open(item) }) }
                )
                .opacity(store.searching ? 0.5 : 1)
                .animation(.easeOut(duration: 0.2), value: store.searching)
                if store.loadingMore {
                    ProgressView().frame(maxWidth: .infinity).padding()
                }
            }
        case let .failed(message):
            ErrorBanner(message: message) { Task { await store.search() } }
        default:
            PosterGridSkeleton()
        }
    }

    @ViewBuilder
    private func resultsHeader(_ store: SearchStore, count: Int) -> some View {
        if store.hasQuery {
            Label("Bangumi / AniList", systemImage: "flame").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.Text.secondary)
        } else if store.hasActiveFilters {
            let parts = store.tags + store.genres.map(\.label).sorted()
                + [store.year.map(String.init), store.season?.label, store.status?.label].compactMap(\.self)
            SectionHeader(title: parts.isEmpty ? String(localized: "篩選結果") : parts.joined(separator: " · "), count: "\(count)")
                .padding(.bottom, -14)
        } else {
            SectionHeader(title: String(localized: "熱門動畫"), count: "\(count)")
                .padding(.bottom, -14)
        }
    }
}
