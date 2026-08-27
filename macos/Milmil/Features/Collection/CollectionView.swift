import MilmilAPI
import SwiftUI

@Observable
final class CollectionStore {
    var status: WatchStatus = .none
    var search = ""
    var sortByName = false
    private(set) var items: Loadable<[CollectionItem]> = .idle
    private(set) var counts: [WatchStatus: Int] = [:]
    /// True while a loaded grid is being replaced (tab / search / sort
    /// change) so the view can dim instead of flashing a spinner.
    private(set) var isRefreshing = false
    /// The query the current `items` were fetched with; the debounced
    /// search skips a reload when nothing changed.
    private(set) var loadedSearch = ""
    private let client: APIClient

    init(client: APIClient) {
        self.client = client
    }

    var total: Int { counts.values.reduce(0, +) }

    func load() async {
        async let countsTask: Void = loadCounts()
        async let itemsTask: Void = loadItems()
        _ = await (countsTask, itemsTask)
    }

    func loadCounts() async {
        if let rows = try? await client.collectionStatusCounts() {
            counts = Dictionary(uniqueKeysWithValues: rows.map { ($0.watchStatus, $0.count) })
        }
    }

    func loadItems() async {
        isRefreshing = items.value != nil
        items = items.reloading
        let search = search
        items = await items.reloaded {
            try await client.collection(status: status, search: search, sortByName: sortByName)
        }
        loadedSearch = search
        isRefreshing = false
    }

    /// Optimistically moves `item` to `newStatus` (`.none` removes it),
    /// then resyncs counts and the grid with the server.
    func setStatus(_ item: CollectionItem, to newStatus: WatchStatus) async {
        guard let bangumiID = item.bangumiID, newStatus != item.watchStatus else { return }
        counts[item.watchStatus] = max(0, (counts[item.watchStatus] ?? 1) - 1)
        if newStatus != .none { counts[newStatus, default: 0] += 1 }
        let staysVisible = status == .none ? newStatus != .none : newStatus == status
        if !staysVisible, let list = items.value {
            items = .loaded(list.filter { $0.id != item.id })
        }
        try? await client.setWatchStatus(bangumiID: bangumiID, newStatus)
        await load()
    }
}

/// The user's list: underline status tabs with counts, live search, sort,
/// poster grid. Right-click a poster to move it between statuses.
struct CollectionView: View {
    static let statuses: [WatchStatus] = [.watching, .planning, .completed, .paused, .dropped]

    @Environment(ServerSession.self) private var session
    @Environment(Router.self) private var router
    @Environment(BackdropStore.self) private var backdrop
    @State private var store: CollectionStore?
    @ObserveInjection private var inject

    var body: some View {
        Group {
            if let store { content(store) } else { Color.clear }
        }
        .navigationTitle("收藏")
        .task {
            if store == nil { store = CollectionStore(client: session.client) }
            backdrop.set(nil, seed: "collection", dim: 0.6, owner: "collection")
            await store?.load()
        }
        .task(id: session.eventGeneration) {
            guard session.eventGeneration > 0 else { return }
            await store?.load()
        }
    }

    private func content(_ store: CollectionStore) -> some View {
        @Bindable var store = store
        return ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                PageBar {
                    FilterTabs(tabs: tabs(store), selection: $store.status)
                } trailing: {
                    SearchField(prompt: String(localized: "在收藏中搜尋…"), text: $store.search)
                    ChipMenu(title: store.sortByName ? String(localized: "名稱") : String(localized: "最近更新"), symbol: "arrow.up.arrow.down") {
                        Picker("排序", selection: $store.sortByName) {
                            Text("最近更新").tag(false)
                            Text("名稱").tag(true)
                        }
                        .pickerStyle(.inline)
                    }
                }
                switch store.items {
                case let .loaded(loaded):
                    let offlineOnly = session.offlineSince != nil
                    let kept = OfflineStore.shared.seriesWithCopies
                    let items = offlineOnly ? loaded.filter { $0.bangumiID.map(kept.contains) ?? false } : loaded
                    if offlineOnly {
                        Label("連唔到 server，只顯示本機可播嘅番劇", systemImage: "arrow.down.circle")
                            .font(.system(size: 12)).foregroundStyle(Theme.Text.secondary)
                    }
                    if items.isEmpty {
                        emptyState(store).frame(maxWidth: .infinity).padding(.top, 40)
                    } else {
                        PosterGrid(items: items) { item in
                            card(item, store)
                        }
                        .opacity(store.isRefreshing ? 0.5 : 1)
                        .animation(.easeOut(duration: 0.2), value: store.isRefreshing)
                    }
                case let .failed(message):
                    ErrorBanner(message: message) { Task { await store.loadItems() } }
                default:
                    PosterGridSkeleton()
                }
            }
            .padding(.horizontal, 40)
            .padding(.top, 16)
            .padding(.bottom, 40)
        }
        .onChange(of: store.status) { Task { await store.loadItems() } }
        .onChange(of: store.sortByName) { Task { await store.loadItems() } }
        .task(id: store.search) {
            guard store.search != store.loadedSearch else { return }
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await store.loadItems()
        }
    }

    private func tabs(_ store: CollectionStore) -> [FilterTab<WatchStatus>] {
        [FilterTab(value: .none, label: String(localized: "全部"), badge: store.total)]
            + Self.statuses.map { FilterTab(value: $0, label: $0.label, badge: store.counts[$0] ?? 0) }
    }

    private func card(_ item: CollectionItem, _ store: CollectionStore) -> some View {
        PosterCard(
            title: item.displayTitle,
            cover: item.coverImage,
            score: item.score,
            cornerBadge: cornerBadge(item),
            offline: item.bangumiID.map { OfflineStore.shared.hasCopies(bangumiID: $0) } ?? false,
            subtitle: subtitle(item),
            watchStatus: item.watchStatus,
            onOpen: { if let id = item.bangumiID { router.openAnime(id) } }
        )
        .contextMenu {
            Button("作品頁", systemImage: "info.circle") { if let id = item.bangumiID { router.openAnime(id) } }
            Divider()
            ForEach(Self.statuses, id: \.self) { status in
                Button {
                    Task { await store.setStatus(item, to: status) }
                } label: {
                    if status == item.watchStatus {
                        Label(status.label, systemImage: "checkmark")
                    } else {
                        Text(status.label)
                    }
                }
            }
            Divider()
            Button("從收藏移除", systemImage: "bookmark.slash", role: .destructive) {
                Task { await store.setStatus(item, to: .none) }
            }
        }
    }

    @ViewBuilder
    private func emptyState(_ store: CollectionStore) -> some View {
        if !store.search.isEmpty {
            EmptyState(
                symbol: "magnifyingglass",
                title: String(localized: "找不到「\(store.search)」"),
                message: String(localized: "換個關鍵字，或清除搜尋看看整個清單。"),
                actionTitle: String(localized: "清除搜尋")
            ) { store.search = "" }
        } else if store.status != .none {
            EmptyState(
                symbol: store.status.symbol,
                title: String(localized: "沒有「\(store.status.label)」的作品"),
                message: String(localized: "在作品頁把狀態改成「\(store.status.label)」，或在這裡右鍵海報移動它。"),
                actionTitle: String(localized: "看全部")
            ) { store.status = .none }
        } else {
            EmptyState(
                symbol: "bookmark",
                title: String(localized: "這個清單還是空的"),
                message: String(localized: "在作品頁按「加入收藏」，或開始播放時自動加入「在看」。"),
                actionTitle: String(localized: "去探索")
            ) { router.select(.discover) }
        }
    }

    private func cornerBadge(_ item: CollectionItem) -> String? {
        if let total = item.totalEpisodes, total > 0 {
            return item.localFileCount > 0 ? String(localized: "\(item.localFileCount)/\(total) 集") : String(localized: "\(total) 集")
        }
        return item.localFileCount > 0 ? String(localized: "\(item.localFileCount) 集") : nil
    }

    private func subtitle(_ item: CollectionItem) -> String? {
        if let score = item.userScore { return String(localized: "我的評分 \(score)") }
        if let date = item.watchStatusUpdatedAt { return String(localized: "更新於 \(Formatters.relative(date))") }
        return Formatters.season(from: item.airDate)
    }
}
