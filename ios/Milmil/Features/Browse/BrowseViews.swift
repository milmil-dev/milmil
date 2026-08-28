import MilmilAPI
import SwiftUI

/// Every screen is loading, holding something, or explaining why it is not.
/// A plain enum rather than a type nested in the view, so a model can publish
/// one without naming the view that renders it.
enum Loadable<Value> {
    case loading
    case ready(Value)
    case failed(String)
}

/// Loading / failed / empty, once, so no screen invents its own.
struct Loaded<Value, Content: View>: View {
    let state: Loadable<Value>
    let empty: String
    @ViewBuilder let content: (Value) -> Content

    var body: some View {
        switch state {
        case .loading:
            ProgressView().controlSize(.large).tint(Theme.accent)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case let .failed(message):
            ContentUnavailableView("載入失敗", systemImage: "wifi.exclamationmark", description: Text(message))
        case let .ready(value):
            if let collection = value as? any Collection, collection.isEmpty {
                ContentUnavailableView(empty, systemImage: "tray")
            } else {
                content(value)
            }
        }
    }
}

/// A poster with its title, the one card every browsing screen uses.
struct PosterCard: View {
    let title: String
    let cover: URL?
    var width: CGFloat = 108

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            AsyncImage(url: cover) { image in
                image.resizable().aspectRatio(contentMode: .fill)
            } placeholder: {
                RoundedRectangle(cornerRadius: 14).fill(.white.opacity(0.06))
            }
            .frame(width: width, height: width * 1.42)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            Text(title).font(.footnote.weight(.medium)).lineLimit(2)
        }
        .frame(width: width, alignment: .leading)
    }
}

@Observable
@MainActor
final class WeekModel {
    private(set) var state: Loadable<[CalendarDay]> = .loading
    private let client: APIClient
    init(client: APIClient) { self.client = client }

    func load() async {
        do { state = .ready(try await client.calendar()) }
        catch { state = .failed(error.localizedDescription) }
    }
}

struct ScheduleView: View {
    let client: APIClient
    let open: (Int) -> Void
    @State private var model: WeekModel

    init(client: APIClient, open: @escaping (Int) -> Void) {
        self.client = client
        self.open = open
        _model = State(initialValue: WeekModel(client: client))
    }

    var body: some View {
        Loaded(state: model.state, empty: "呢個星期冇新番") { week in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 22) {
                    ForEach(week, id: \.weekdayEN) { day in
                        VStack(alignment: .leading, spacing: 10) {
                            Text(day.weekday).font(.title3.weight(.semibold)).padding(.horizontal, 16)
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(alignment: .top, spacing: 12) {
                                    ForEach(day.items) { anime in
                                        Button { open(anime.bangumiID) } label: {
                                            PosterCard(title: anime.title, cover: anime.coverImage)
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                                .padding(.horizontal, 16)
                            }
                        }
                    }
                }
                .padding(.bottom, 96)
            }
        }
        .background(Theme.background)
        .task { await model.load() }
    }
}

@Observable
@MainActor
final class DiscoverModel {
    private(set) var state: Loadable<[AnimeSummary]> = .loading
    private let client: APIClient
    init(client: APIClient) { self.client = client }

    func load() async {
        do { state = .ready(try await client.browse(BrowseQuery(page: 1))) }
        catch { state = .failed(error.localizedDescription) }
    }
}

struct DiscoverView: View {
    let client: APIClient
    let open: (Int) -> Void
    @State private var model: DiscoverModel

    init(client: APIClient, open: @escaping (Int) -> Void) {
        self.client = client
        self.open = open
        _model = State(initialValue: DiscoverModel(client: client))
    }

    private let columns = [GridItem(.adaptive(minimum: 104), spacing: 12)]

    var body: some View {
        Loaded(state: model.state, empty: "冇結果") { items in
            ScrollView {
                LazyVGrid(columns: columns, spacing: 16) {
                    ForEach(items) { anime in
                        Button { open(anime.bangumiID) } label: {
                            PosterCard(title: anime.title, cover: anime.coverImage, width: 104)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 96)
            }
        }
        .background(Theme.background)
        .task { await model.load() }
    }
}

@Observable
@MainActor
final class SearchModel {
    private(set) var results: Loadable<[AnimeSummary]>?
    var query = ""
    private var task: Task<Void, Never>?
    private let client: APIClient
    init(client: APIClient) { self.client = client }

    /// Debounced: the search endpoint is remote and a keystroke is not a query.
    func search() {
        task?.cancel()
        let text = query.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else {
            results = nil
            return
        }
        task = Task {
            try? await Task.sleep(for: .milliseconds(320))
            guard !Task.isCancelled else { return }
            results = .loading
            do { results = .ready(try await client.searchAnime(text)) }
            catch { results = .failed(error.localizedDescription) }
        }
    }
}

struct SearchView: View {
    let client: APIClient
    let open: (Int) -> Void
    @State private var model: SearchModel

    init(client: APIClient, open: @escaping (Int) -> Void) {
        self.client = client
        self.open = open
        _model = State(initialValue: SearchModel(client: client))
    }

    var body: some View {
        Group {
            if let results = model.results {
                Loaded(state: results, empty: "搵唔到") { items in
                    List(items) { anime in
                        Button { open(anime.bangumiID) } label: {
                            SearchRow(anime: anime)
                        }
                        .tint(.primary)
                    }
                    .listStyle(.plain)
                    .safeAreaPadding(.bottom, 96)
                }
            } else {
                ContentUnavailableView("搜尋動畫", systemImage: "magnifyingglass", description: Text("輸入片名開始搜尋"))
            }
        }
        .background(Theme.background)
        .searchable(text: Bindable(model).query, prompt: "搜尋動畫")
        .onChange(of: model.query) { _, _ in model.search() }
    }
}

private struct SearchRow: View {
    let anime: AnimeSummary

    var body: some View {
        HStack(spacing: 14) {
            AsyncImage(url: anime.coverImage) { image in
                image.resizable().aspectRatio(contentMode: .fill)
            } placeholder: {
                RoundedRectangle(cornerRadius: 8).fill(.white.opacity(0.06))
            }
            .frame(width: 52, height: 74)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            VStack(alignment: .leading, spacing: 3) {
                Text(anime.title).font(.body.weight(.medium)).lineLimit(2)
                Text(summary).font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private var summary: String {
        var parts: [String] = []
        if let year = anime.airDate?.prefix(4), !year.isEmpty { parts.append(String(year)) }
        if anime.episodeCount > 0 { parts.append("\(anime.episodeCount) 集") }
        return parts.joined(separator: " · ")
    }
}

@Observable
@MainActor
final class CollectionModel {
    private(set) var state: Loadable<[CollectionItem]> = .loading
    private(set) var counts: [WatchStatusCount] = []
    private let client: APIClient
    init(client: APIClient) { self.client = client }

    func load() async {
        async let countsCall = try? await client.collectionStatusCounts()
        do { state = .ready(try await client.collection()) }
        catch { state = .failed(error.localizedDescription) }
        counts = await countsCall ?? []
    }
}

struct CollectionView: View {
    let client: APIClient
    let open: (Int) -> Void
    @State private var model: CollectionModel

    init(client: APIClient, open: @escaping (Int) -> Void) {
        self.client = client
        self.open = open
        _model = State(initialValue: CollectionModel(client: client))
    }

    var body: some View {
        VStack(spacing: 0) {
            if !model.counts.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(model.counts, id: \.watchStatus) { tally in
                            Text("\(label(for: tally.watchStatus)) \(tally.count)")
                                .font(.footnote.weight(.medium))
                                .padding(.horizontal, 14)
                                .padding(.vertical, 7)
                                .glassSurface(in: Capsule())
                        }
                    }
                    .padding(.horizontal, 16)
                }
                .padding(.vertical, 8)
            }
            Loaded(state: model.state, empty: "收藏係空嘅") { rows in
                List(rows) { row in
                    Button { row.bangumiID.map(open) } label: {
                        CollectionRow(item: row)
                    }
                    .tint(.primary)
                    .disabled(row.bangumiID == nil)
                }
                .listStyle(.plain)
                .safeAreaPadding(.bottom, 96)
            }
        }
        .background(Theme.background)
        .task { await model.load() }
    }
}

private struct CollectionRow: View {
    let item: CollectionItem

    var body: some View {
        HStack(spacing: 14) {
            AsyncImage(url: item.coverImage) { image in
                image.resizable().aspectRatio(contentMode: .fill)
            } placeholder: {
                RoundedRectangle(cornerRadius: 8).fill(.white.opacity(0.06))
            }
            .frame(width: 52, height: 74)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            VStack(alignment: .leading, spacing: 4) {
                Text(item.titleZh ?? item.title).font(.body.weight(.medium)).lineLimit(2)
                Text("\(item.localFileCount) / \(item.totalEpisodes ?? 0) 集")
                    .font(.caption).foregroundStyle(.secondary)
                if let total = item.totalEpisodes, total > 0 {
                    ProgressView(value: Double(item.localFileCount), total: Double(total))
                        .tint(Theme.accent)
                }
            }
        }
    }
}

/// The API answers with its internal status names; every other client shows
/// these translated, and an English chip in a Chinese app reads as unfinished.
func label(for status: WatchStatus) -> String {
    switch status {
    case .watching: "睇緊"
    case .completed: "睇晒"
    case .planning: "打算睇"
    case .paused: "暫停"
    case .dropped: "棄坑"
    case .none: "未收藏"
    }
}
