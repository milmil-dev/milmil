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

/// 時間表.
///
/// Not a stack of poster shelves — that is the home page, and it says nothing
/// a schedule is for. The web page groups a day by air time and puts a weekday
/// strip on top; this is that, at phone width: you pick a day, and read down
/// it in the order the episodes actually go out.
struct ScheduleView: View {
    let client: APIClient
    let open: (Int) -> Void
    @Environment(\.zoomNamespace) private var zoom
    @State private var model: WeekModel
    @State private var selected: String?

    init(client: APIClient, open: @escaping (Int) -> Void) {
        self.client = client
        self.open = open
        _model = State(initialValue: WeekModel(client: client))
    }

    var body: some View {
        Loaded(state: model.state, empty: "呢個星期冇新番") { week in
            let wanted = selected ?? key(todayEN)
            let day = week.first { key($0.weekdayEN) == wanted } ?? week.first
            VStack(spacing: 0) {
                dayStrip(week)
                if let day {
                    timeline(day)
                } else {
                    ContentUnavailableView("今日冇新番", systemImage: "calendar")
                }
            }
        }
        .background(Theme.background)
        .task { await model.load() }
    }

    private var todayEN: String {
        Date.now.formatted(.dateTime.weekday(.abbreviated).locale(.init(identifier: "en_US_POSIX")))
    }

    /// The server spells a weekday "Fri" in one place and "Friday" in another,
    /// and comparing the two spellings directly selected the wrong day — the
    /// dot landed on today while the highlight sat three days away.
    private func key(_ weekdayEN: String) -> String {
        String(weekdayEN.prefix(3)).lowercased()
    }

    /// Seven pills: the weekday, the date, and a dot under today. Horizontally
    /// scrollable because seven of them do not fit a phone at a comfortable
    /// touch size, and a cramped week is worse than a scrolled one.
    private func dayStrip(_ week: [CalendarDay]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(week) { day in
                    let isToday = key(day.weekdayEN) == key(todayEN)
                    let isSelected = key(day.weekdayEN) == (selected ?? key(todayEN))
                    Button { selected = key(day.weekdayEN) } label: {
                        VStack(spacing: 3) {
                            Text(day.weekday.replacingOccurrences(of: "星期", with: ""))
                                .font(.subheadline.weight(.semibold))
                            Text(date(for: key(day.weekdayEN)))
                                .font(.caption2)
                                .monospacedDigit()
                                .foregroundStyle(isSelected ? .primary : .secondary)
                            Circle()
                                .fill(isToday ? Theme.accent : .clear)
                                .frame(width: 4, height: 4)
                        }
                        .frame(width: 48, height: 58)
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(isSelected ? Theme.accent : Color.primary)
                    .background {
                        if isSelected {
                            RoundedRectangle(cornerRadius: 14).fill(Theme.accent.opacity(0.16))
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
    }

    /// The date that weekday falls on this week, so "星期三" has something
    /// concrete under it.
    private func date(for weekdayKey: String) -> String {
        let order = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
        guard let target = order.firstIndex(of: weekdayKey),
              let todayIndex = order.firstIndex(of: key(todayEN)),
              let date = Calendar.current.date(byAdding: .day, value: target - todayIndex, to: .now)
        else { return "" }
        return date.formatted(.dateTime.month(.defaultDigits).day())
    }

    private func timeline(_ day: CalendarDay) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                if day.items.isEmpty {
                    ContentUnavailableView("呢日冇新番", systemImage: "calendar")
                        .padding(.top, 60)
                }
                ForEach(groupByTime(day.items), id: \.time) { group in
                    HStack(spacing: 10) {
                        // A title the server has no time for sorts first but
                        // must not claim to air at midnight.
                        Text(group.time == "00:00" ? "時間未定" : group.time)
                            .font(.footnote.weight(.semibold))
                            .monospacedDigit()
                            .foregroundStyle(Theme.accent)
                        Rectangle()
                            .fill(.white.opacity(0.08))
                            .frame(height: 1)
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 18)
                    .padding(.bottom, 8)

                    ForEach(group.animes) { anime in
                        Button { open(anime.bangumiID) } label: {
                            ScheduleRow(anime: anime)
                        }
                        .buttonStyle(PressableCard())
                        .zoomSource(anime.bangumiID, in: zoom)
                        .padding(.horizontal, Theme.Space.margin)
                        .padding(.bottom, 8)
                    }
                }
            }
            .padding(.bottom, 96)
        }
    }

    /// Sorted by air time and grouped, the way the web timeline builds it.
    /// A title with no time sorts to `00:00` rather than disappearing.
    private func groupByTime(_ items: [AnimeSummary]) -> [(time: String, animes: [AnimeSummary])] {
        var groups: [(time: String, animes: [AnimeSummary])] = []
        for anime in items.sorted(by: { ($0.airTime ?? "00:00") < ($1.airTime ?? "00:00") }) {
            let time = anime.airTime ?? "00:00"
            if groups.last?.time == time {
                groups[groups.count - 1].animes.append(anime)
            } else {
                groups.append((time, [anime]))
            }
        }
        return groups
    }
}

/// One row of the timeline: the cover, the title, and which episode is due.
private struct ScheduleRow: View {
    let anime: AnimeSummary

    var body: some View {
        HStack(spacing: 12) {
            Poster(title: anime.title, url: anime.coverImage, width: 54)

            VStack(alignment: .leading, spacing: 5) {
                Text(anime.title)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.ink(0.92))
                    .lineLimit(2)
                HStack(spacing: 6) {
                    if let episode = anime.nextEpisode, episode > 0 {
                        Text("第 \(episode) 集")
                            .font(.system(size: 11, weight: .semibold))
                            .padding(.horizontal, 7)
                            .padding(.vertical, 2)
                            .background(Theme.accent.opacity(0.18), in: Capsule())
                            .foregroundStyle(Theme.accent)
                    }
                    if anime.score > 0 {
                        Text("★ \(anime.score.formatted(.number.precision(.fractionLength(0...1))))")
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.ink(0.45))
                    }
                }
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.ink(0.25))
        }
        .padding(10)
        .cardBackground()
        .contentShape(.rect)
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
                            PosterCard(
                                title: anime.title,
                                url: anime.coverImage,
                                width: 104,
                                score: anime.score
                            )
                        }
                        .buttonStyle(PressableCard())
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
    @Environment(\.zoomNamespace) private var zoom
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
                    ScrollView {
                        LazyVStack(spacing: 8) {
                            ForEach(items) { anime in
                                Button { open(anime.bangumiID) } label: {
                                    SearchRow(anime: anime)
                                }
                                .buttonStyle(PressableCard())
                                .zoomSource(anime.bangumiID, in: zoom)
                            }
                        }
                        .padding(.horizontal, Theme.Space.margin)
                        .padding(.bottom, 110)
                    }
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
        HStack(spacing: 12) {
            Poster(title: anime.title, url: anime.coverImage, width: 54)
            VStack(alignment: .leading, spacing: 4) {
                Text(anime.title)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.ink(0.92))
                    .lineLimit(2)
                Text(summary)
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.ink(0.45))
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.ink(0.25))
        }
        .padding(10)
        .cardBackground()
        .contentShape(.rect)
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
    @Environment(\.zoomNamespace) private var zoom
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
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(rows) { row in
                            Button { row.bangumiID.map(open) } label: {
                                CollectionRow(item: row)
                            }
                            .buttonStyle(PressableCard())
                            .zoomSource(row.bangumiID ?? 0, in: zoom)
                            .disabled(row.bangumiID == nil)
                        }
                    }
                    .padding(.horizontal, Theme.Space.margin)
                    .padding(.bottom, 110)
                }
            }
        }
        .background(Theme.background)
        .task { await model.load() }
    }
}

private struct CollectionRow: View {
    let item: CollectionItem

    var body: some View {
        HStack(spacing: 12) {
            Poster(
                title: item.titleZh ?? item.title,
                url: item.coverImage,
                width: 54,
                progress: fraction
            )
            VStack(alignment: .leading, spacing: 4) {
                Text(item.titleZh ?? item.title)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.ink(0.92))
                    .lineLimit(2)
                Text("\(item.localFileCount) / \(item.totalEpisodes ?? 0) 集喺伺服器")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.ink(0.45))
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.ink(0.25))
        }
        .padding(10)
        .cardBackground()
        .contentShape(.rect)
    }

    private var fraction: Double {
        guard let total = item.totalEpisodes, total > 0 else { return 0 }
        return min(1, Double(item.localFileCount) / Double(total))
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
