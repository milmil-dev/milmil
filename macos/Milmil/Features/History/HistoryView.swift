import MilmilAPI
import SwiftUI

@Observable
final class HistoryStore {
    var filter: HistoryFilter = .all
    var search = ""
    private(set) var entries: Loadable<[ProgressEntry]> = .idle
    private(set) var nextBefore: String?
    private(set) var loadingMore = false
    private(set) var selection: Set<String> = []
    private let client: APIClient

    init(client: APIClient) {
        self.client = client
    }

    func load() async {
        selection = []
        entries = entries.reloading
        var cursor: String?
        entries = await entries.reloaded {
            let page = try await client.history(filter: filter, query: search)
            cursor = page.nextBefore
            return page.items
        }
        nextBefore = cursor
    }

    func loadMore() async {
        guard let before = nextBefore, !loadingMore, let current = entries.value else { return }
        loadingMore = true
        defer { loadingMore = false }
        if let page = try? await client.history(filter: filter, before: before, query: search) {
            entries = .loaded(current + page.items)
            nextBefore = page.nextBefore
        }
    }

    func toggle(_ id: String) {
        if selection.contains(id) { selection.remove(id) } else { selection.insert(id) }
    }

    func delete(_ ids: Set<String>) async {
        if let current = entries.value { entries = .loaded(current.filter { !ids.contains($0.id) }) }
        selection.subtract(ids)
        try? await client.deleteProgress(ids: Array(ids))
    }

    func clearAll() async {
        entries = .loaded([])
        selection = []
        try? await client.clearHistory()
    }

    /// 今天 / 昨天 / 本週 / 更早.
    var buckets: [(title: String, entries: [ProgressEntry])] {
        guard let list = entries.value else { return [] }
        let calendar = Calendar.current
        let now = Date()
        var groups: [String: [ProgressEntry]] = [:]
        var order: [String] = []
        for entry in list {
            let title = Self.bucketTitle(for: entry.lastWatchedAt, calendar: calendar, now: now)
            if groups[title] == nil { order.append(title) }
            groups[title, default: []].append(entry)
        }
        return order.map { ($0, groups[$0] ?? []) }
    }

    private static func bucketTitle(for date: Date?, calendar: Calendar, now: Date) -> String {
        guard let date else { return String(localized: "更早") }
        if calendar.isDateInToday(date) { return String(localized: "今天") }
        if calendar.isDateInYesterday(date) { return String(localized: "昨天") }
        if let week = calendar.dateInterval(of: .weekOfYear, for: now), week.contains(date) { return String(localized: "本週") }
        return String(localized: "更早")
    }
}

struct HistoryView: View {
    @Environment(ServerSession.self) private var session
    @Environment(Router.self) private var router
    @Environment(BackdropStore.self) private var backdrop
    @Environment(PlayerCoordinator.self) private var playerCoordinator
    @State private var store: HistoryStore?
    @State private var confirmClear = false
    @ObserveInjection private var inject

    var body: some View {
        Group {
            if let store { content(store) } else { Color.clear }
        }
        .navigationTitle("觀看歷史")
        .task {
            if store == nil { store = HistoryStore(client: session.client) }
            backdrop.set(nil, seed: "history", dim: 0.6, owner: "history")
            await store?.load()
        }
        .onDisappear { backdrop.clear(owner: "history") }
    }

    private func content(_ store: HistoryStore) -> some View {
        @Bindable var store = store
        return ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                PageHeader(title: String(localized: "觀看歷史")) {
                    HStack(spacing: 8) {
                        TextField("搜尋歷史…", text: $store.search)
                            .textFieldStyle(.roundedBorder).frame(width: 180)
                            .onSubmit { Task { await store.load() } }
                        Segmented(options: HistoryFilter.allCases, selection: $store.filter) { filter in
                            switch filter {
                            case .all: String(localized: "全部")
                            case .inProgress: String(localized: "進行中")
                            case .completed: String(localized: "已完成")
                            }
                        }
                        if !store.selection.isEmpty {
                            Button("刪除 \(store.selection.count) 項", systemImage: "trash", role: .destructive) {
                                Task { await store.delete(store.selection) }
                            }
                            .glassButtonStyle()
                        } else {
                            Button("清空", systemImage: "trash", role: .destructive) { confirmClear = true }
                                .glassButtonStyle()
                                .disabled((store.entries.value ?? []).isEmpty)
                        }
                    }
                }
                switch store.entries {
                case .loaded where (store.entries.value ?? []).isEmpty:
                    EmptyState(symbol: "clock", title: String(localized: "還沒有觀看記錄"), message: String(localized: "播放過的集數會出現在這裡，也會同步到 AniList / Bangumi。"))
                        .frame(maxWidth: .infinity).padding(.top, 40)
                case .loaded:
                    ForEach(store.buckets, id: \.title) { bucket in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(bucket.title)
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(Theme.Text.tertiary)
                                .padding(.horizontal, 10).padding(.bottom, 6)
                            ForEach(bucket.entries) { entry in
                                HistoryRow(entry: entry, selected: store.selection.contains(entry.id)) {
                                    store.toggle(entry.id)
                                } play: {
                                    if let id = entry.animeBangumiID {
                                        playerCoordinator.play(PlaybackRequest(
                                            bangumiID: id, episodeID: entry.episodeID, title: entry.displayTitle, coverImage: entry.animeCoverImage
                                        ))
                                        router.openWatch(bangumiID: id, episodeID: entry.episodeID)
                                    }
                                } open: {
                                    if let id = entry.animeBangumiID { router.openAnime(id) }
                                } remove: {
                                    Task { await store.delete([entry.id]) }
                                }
                                .onAppear { if entry.id == store.entries.value?.last?.id { Task { await store.loadMore() } } }
                            }
                        }
                    }
                    if store.loadingMore { ProgressView().frame(maxWidth: .infinity).padding() }
                case let .failed(message):
                    ErrorBanner(message: message) { Task { await store.load() } }
                default:
                    ProgressView().frame(maxWidth: .infinity).padding(40)
                }
            }
            .padding(.horizontal, 40)
            .padding(.top, 20)
            .padding(.bottom, 40)
        }
        .onChange(of: store.filter) { Task { await store.load() } }
        .confirmationDialog("清空所有觀看歷史？", isPresented: $confirmClear, titleVisibility: .visible) {
            Button("清空", role: .destructive) { Task { await store.clearAll() } }
        } message: {
            Text("這會刪除所有進度記錄，無法復原。")
        }
    }
}

struct HistoryRow: View {
    let entry: ProgressEntry
    let selected: Bool
    var toggle: () -> Void
    var play: () -> Void
    var open: () -> Void
    var remove: () -> Void

    var body: some View {
        HStack(spacing: 14) {
            Button(action: toggle) {
                Image(systemName: selected ? "checkmark.square.fill" : "square")
                    .font(.system(size: 16))
                    .foregroundStyle(selected ? Theme.accent : Theme.Text.muted)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(selected ? String(localized: "取消選取") : String(localized: "選取"))

            ZStack {
                RemoteImage(url: entry.animeCoverImage, maxPixel: 320) { Rectangle().fill(Theme.animeGradient(entry.displayTitle)) }
                if let fraction = entry.fraction {
                    ProgressStripe(fraction: fraction).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                }
            }
            .frame(width: 120, height: 68)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))

            VStack(alignment: .leading, spacing: 3) {
                Text(entry.displayTitle).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                Text(detail).font(.system(size: 12)).foregroundStyle(Theme.Text.tertiary)
            }
            Spacer()
            Text(Formatters.relative(entry.lastWatchedAt)).font(.system(size: 12)).foregroundStyle(Theme.Text.tertiary).monospacedDigit()
            Button("繼續", systemImage: "play.fill", action: play)
                .glassButtonStyle().controlSize(.small)
            Menu {
                Button("作品頁", systemImage: "info.circle", action: open)
                Button("刪除記錄", systemImage: "trash", role: .destructive, action: remove)
            } label: {
                Image(systemName: "ellipsis")
            }
            .menuStyle(.borderlessButton).menuIndicator(.hidden).frame(width: 24)
        }
        .padding(.horizontal, 10).padding(.vertical, 8)
        .background(selected ? Theme.accent.opacity(0.08) : .clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .contentShape(Rectangle())
        .onTapGesture(count: 2, perform: play)
    }

    private var detail: String {
        let ep = Formatters.episode(entry.episodeNumber)
        if entry.completed { return String(localized: "\(ep) · 已看完") }
        if let fraction = entry.fraction { return String(localized: "\(ep) · 看到 \(Int(fraction * 100))%") }
        return ep
    }
}
