import MilmilAPI
import SwiftUI

@Observable
final class SearchStore {
    var query = ""
    var genre: Genre?
    var year: Int?
    var season: Season?
    var status: AiringStatus?
    var minScore: Double = 0
    var sort: BrowseQuery.Sort = .popularity

    private(set) var local: [LocalSearchHit] = []
    private(set) var remote: Loadable<[AnimeSummary]> = .idle
    private var searchTask: Task<Void, Never>?
    private let client: APIClient

    init(client: APIClient) {
        self.client = client
    }

    var hasQuery: Bool { !query.trimmingCharacters(in: .whitespaces).isEmpty }

    /// Changes whenever any filter changes; drives the debounced re-search.
    var filterSignature: String {
        let parts = [sort.rawValue, year.map(String.init) ?? "", season?.rawValue ?? "", status?.rawValue ?? "", genre?.rawValue ?? "", String(minScore)]
        return parts.joined(separator: "|")
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
        if text.isEmpty {
            // No text: browse with the filters only. AniList browse is the
            // flakiest upstream; with no filters, trending is an honest stand-in.
            local = []
            remote = remote.reloading
            let query = browseQuery
            let unfiltered = genre == nil && year == nil && season == nil && status == nil && minScore == 0
            remote = await remote.reloaded {
                do {
                    return try await client.browse(query)
                } catch APIError.serverUnavailable where unfiltered {
                    return try await client.trending(page: 1)
                }
            }
            return
        }
        async let localHits = (try? client.searchLibrary(text, limit: 8)) ?? []
        remote = remote.reloading
        remote = await remote.reloaded {
            let hits = try await client.searchAnime(text)
            return applyFilters(hits)
        }
        local = await localHits
    }

    private var browseQuery: BrowseQuery {
        BrowseQuery(genre: genre?.rawValue, sort: sort, year: year, season: season?.rawValue, minScore: minScore > 0 ? minScore : nil, status: status?.rawValue)
    }

    /// The search endpoint has no filters; apply the cheap ones client-side.
    private func applyFilters(_ items: [AnimeSummary]) -> [AnimeSummary] {
        items.filter { item in
            if let genre, !item.genres.contains(genre.rawValue), !item.genres.contains(genre.label) { return false }
            if let year, !(item.airDate?.hasPrefix(String(year)) ?? false) { return false }
            if minScore > 0, item.score < minScore { return false }
            return true
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
        }
        .onDisappear { backdrop.clear(owner: "search") }
    }

    private func content(_ store: SearchStore) -> some View {
        @Bindable var store = store
        return ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass").foregroundStyle(Theme.Text.tertiary)
                    TextField("搜尋作品（Bangumi / AniList）…", text: $store.query)
                        .textFieldStyle(.plain)
                        .font(.system(size: 20, weight: .semibold))
                        .focused($focused)
                        .onChange(of: store.query) { store.scheduleSearch() }
                        .onSubmit { Task { await store.search() } }
                    if store.hasQuery {
                        Button { store.query = "" } label: { Image(systemName: "xmark.circle.fill") }
                            .buttonStyle(.plain).foregroundStyle(Theme.Text.tertiary)
                    }
                }
                .padding(.horizontal, 16)
                .frame(height: 48)
                .background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(.white.opacity(focused ? 0.18 : 0.08)))

                filters(store)

                if !store.local.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        Label("在你的媒體庫", systemImage: "folder").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.Text.secondary)
                        HStack(spacing: 14) {
                            ForEach(store.local) { hit in
                                PosterCard(title: hit.title, cover: nil, badge: "媒體庫", onOpen: { if let id = hit.bangumiID { router.openAnime(id) } })
                            }
                        }
                    }
                }

                switch store.remote {
                case let .loaded(items):
                    if items.isEmpty {
                        EmptyState(symbol: "magnifyingglass", title: store.hasQuery ? "找不到「\(store.query)」" : "沒有符合的作品", message: "試試原名或英文名；⌘K 也會同時搜尋媒體庫。")
                            .frame(maxWidth: .infinity)
                    } else {
                        if store.hasQuery {
                            Label("Bangumi / AniList", systemImage: "flame").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.Text.secondary)
                        }
                        PosterGrid(items: items) { item in
                            PosterCard(summary: item, onOpen: { router.openAnime(item.bangumiID) })
                        }
                    }
                case let .failed(message):
                    ErrorBanner(message: message) { Task { await store.search() } }
                default:
                    ProgressView().frame(maxWidth: .infinity).padding(40)
                }
            }
            .padding(.horizontal, 40)
            .padding(.top, 20)
            .padding(.bottom, 40)
        }
    }

    private func filters(_ store: SearchStore) -> some View {
        @Bindable var store = store
        return HStack(spacing: 8) {
            Image(systemName: "line.3.horizontal.decrease").foregroundStyle(Theme.Text.tertiary)
            Picker("排序", selection: $store.sort) {
                Text("人氣").tag(BrowseQuery.Sort.popularity)
                Text("評分").tag(BrowseQuery.Sort.score)
                Text("趨勢").tag(BrowseQuery.Sort.trending)
                Text("日期").tag(BrowseQuery.Sort.date)
            }
            Picker("年份", selection: $store.year) {
                Text("全部").tag(Int?.none)
                ForEach((2000...Season.current().year + 1).reversed(), id: \.self) { Text(String($0)).tag(Int?.some($0)) }
            }
            Picker("季節", selection: $store.season) {
                Text("全部").tag(Season?.none)
                ForEach(Season.allCases) { Text($0.label).tag(Season?.some($0)) }
            }
            Picker("狀態", selection: $store.status) {
                Text("全部").tag(AiringStatus?.none)
                ForEach(AiringStatus.allCases) { Text($0.label).tag(AiringStatus?.some($0)) }
            }
            Picker("類型", selection: $store.genre) {
                Text("全部").tag(Genre?.none)
                ForEach(Genre.allCases) { Text($0.label).tag(Genre?.some($0)) }
            }
            Picker("最低分", selection: $store.minScore) {
                Text("不限").tag(0.0)
                ForEach([6.0, 7.0, 8.0, 9.0], id: \.self) { Text("\($0, format: .number.precision(.fractionLength(1)))+").tag($0) }
            }
            Spacer()
        }
        .pickerStyle(.menu)
        .controlSize(.small)
        .onChange(of: store.filterSignature) { store.scheduleSearch() }
    }
}
