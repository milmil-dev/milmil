import MilmilAPI
import SwiftUI

@Observable
final class CollectionStore {
    var status: WatchStatus = .none
    var search = ""
    var sortByName = false
    private(set) var items: Loadable<[CollectionItem]> = .idle
    private(set) var counts: [WatchStatus: Int] = [:]
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
        items = items.reloading
        items = await items.reloaded {
            try await client.collection(status: status, search: search, sortByName: sortByName)
        }
    }
}

/// The user's list: status tabs with counts, search, sort, poster grid.
struct CollectionView: View {
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
        .onDisappear { backdrop.clear(owner: "collection") }
    }

    private func content(_ store: CollectionStore) -> some View {
        @Bindable var store = store
        return ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                PageHeader(title: String(localized: "收藏"), subtitle: String(localized: "\(store.total) 部")) {
                    HStack(spacing: 8) {
                        TextField("在收藏中搜尋…", text: $store.search)
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 200)
                            .onSubmit { Task { await store.loadItems() } }
                        Picker("排序", selection: $store.sortByName) {
                            Text("最近更新").tag(false)
                            Text("名稱").tag(true)
                        }
                        .pickerStyle(.menu)
                        .fixedSize()
                    }
                }
                statusTabs(store)
                switch store.items {
                case let .loaded(items):
                    if items.isEmpty {
                        EmptyState(
                            symbol: "bookmark",
                            title: String(localized: "這個清單還是空的"),
                            message: String(localized: "在作品頁按「加入收藏」，或開始播放時自動加入「在看」。"),
                            actionTitle: String(localized: "去探索")
                        ) { router.select(.discover) }
                            .frame(maxWidth: .infinity).padding(.top, 40)
                    } else {
                        PosterGrid(items: items) { item in
                            PosterCard(
                                title: item.displayTitle,
                                cover: item.coverImage,
                                score: item.score,
                                cornerBadge: cornerBadge(item),
                                subtitle: subtitle(item),
                                watchStatus: item.watchStatus,
                                onOpen: { if let id = item.bangumiID { router.openAnime(id) } }
                            )
                        }
                    }
                case let .failed(message):
                    ErrorBanner(message: message) { Task { await store.loadItems() } }
                default:
                    ProgressView().frame(maxWidth: .infinity).padding(40)
                }
            }
            .padding(.horizontal, 40)
            .padding(.top, 20)
            .padding(.bottom, 40)
        }
        .onChange(of: store.status) { Task { await store.loadItems() } }
        .onChange(of: store.sortByName) { Task { await store.loadItems() } }
    }

    private func statusTabs(_ store: CollectionStore) -> some View {
        HStack(spacing: 4) {
            ForEach([WatchStatus.none, .watching, .planning, .completed, .paused, .dropped], id: \.self) { status in
                let isOn = store.status == status
                let count = status == .none ? store.total : (store.counts[status] ?? 0)
                Button {
                    store.status = status
                } label: {
                    HStack(spacing: 6) {
                        Text(status == .none ? String(localized: "全部") : status.label)
                        Text("\(count)").font(.system(size: 11, weight: .semibold)).foregroundStyle(isOn ? Theme.accent : Theme.Text.muted)
                    }
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(isOn ? .white : Theme.Text.tertiary)
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .background(isOn ? .white.opacity(0.12) : .clear, in: Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(3)
        .background(.white.opacity(0.06), in: Capsule())
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
