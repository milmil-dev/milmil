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
    private(set) var isRefreshing = false
    private(set) var loadedSearch = ""
    private let client: APIClient

    init(client: APIClient) {
        self.client = client
    }

    func load() async {
        selection = []
        isRefreshing = entries.value != nil
        entries = entries.reloading
        let search = search
        var cursor: String?
        entries = await entries.reloaded {
            let page = try await client.history(filter: filter, query: search)
            cursor = page.nextBefore
            return page.items
        }
        nextBefore = cursor
        loadedSearch = search
        isRefreshing = false
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

    func clearSelection() {
        selection = []
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
    var buckets: [(title: String, items: [ProgressEntry])] {
        DateBucket.group(entries.value ?? [], date: \.lastWatchedAt)
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
    }

    private func content(_ store: HistoryStore) -> some View {
        @Bindable var store = store
        let isEmpty = (store.entries.value ?? []).isEmpty
        return ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                PageBar {
                    FilterTabs(
                        tabs: [
                            FilterTab(value: HistoryFilter.all, label: String(localized: "全部")),
                            FilterTab(value: .inProgress, label: String(localized: "進行中")),
                            FilterTab(value: .completed, label: String(localized: "已完成")),
                        ],
                        selection: $store.filter
                    )
                } trailing: {
                    SearchField(prompt: String(localized: "搜尋歷史…"), text: $store.search)
                    RowIconButton(symbol: "trash", label: String(localized: "清空觀看歷史"), destructive: true) { confirmClear = true }
                        .disabled(isEmpty)
                        .opacity(isEmpty ? 0.4 : 1)
                }
                switch store.entries {
                case .loaded where isEmpty:
                    emptyState(store).frame(maxWidth: .infinity).padding(.top, 40)
                case .loaded:
                    VStack(alignment: .leading, spacing: 22) {
                        ForEach(store.buckets, id: \.title) { bucket in
                            VStack(alignment: .leading, spacing: 8) {
                                SectionLabel(title: bucket.title, count: bucket.items.count)
                                // Rows carry their own hover / selected card;
                                // a permanent group border made every entry
                                // look selected.
                                VStack(spacing: 2) {
                                    ForEach(bucket.items) { entry in
                                        row(entry, store)
                                    }
                                }
                            }
                        }
                        if store.loadingMore { ProgressView().controlSize(.small).frame(maxWidth: .infinity).padding() }
                    }
                    .opacity(store.isRefreshing ? 0.5 : 1)
                    .animation(.easeOut(duration: 0.2), value: store.isRefreshing)
                case let .failed(message):
                    ErrorBanner(message: message) { Task { await store.load() } }
                default:
                    HistorySkeleton()
                }
            }
            .padding(.horizontal, 40)
            .padding(.top, 16)
            .padding(.bottom, store.selection.isEmpty ? 40 : 96)
        }
        .overlay(alignment: .bottom) {
            if !store.selection.isEmpty {
                selectionBar(store)
                    .padding(.bottom, 20)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.spring(duration: 0.3, bounce: 0.1), value: store.selection.isEmpty)
        .onChange(of: store.filter) { Task { await store.load() } }
        .task(id: store.search) {
            guard store.search != store.loadedSearch else { return }
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await store.load()
        }
        .confirmationDialog("清空所有觀看歷史？", isPresented: $confirmClear, titleVisibility: .visible) {
            Button("清空", role: .destructive) { Task { await store.clearAll() } }
        } message: {
            Text("這會刪除所有進度記錄，無法復原。")
        }
    }

    private func row(_ entry: ProgressEntry, _ store: HistoryStore) -> some View {
        HistoryRow(entry: entry, selected: store.selection.contains(entry.id), selecting: !store.selection.isEmpty) {
            store.toggle(entry.id)
        } play: {
            play(entry)
        } open: {
            if let id = entry.animeBangumiID { router.openAnime(id) }
        } remove: {
            Task { await store.delete([entry.id]) }
        }
        .onAppear { if entry.id == store.entries.value?.last?.id { Task { await store.loadMore() } } }
    }

    private func play(_ entry: ProgressEntry) {
        guard let id = entry.animeBangumiID else { return }
        playerCoordinator.play(PlaybackRequest(
            bangumiID: id, episodeID: entry.episodeID, title: entry.displayTitle, coverImage: entry.animeCoverImage
        ))
        router.openWatch(bangumiID: id, episodeID: entry.episodeID)
    }

    /// Floating glass bar while rows are checked: count, cancel, delete.
    private func selectionBar(_ store: HistoryStore) -> some View {
        HStack(spacing: 14) {
            Text("已選取 \(store.selection.count) 項").font(.system(size: 13, weight: .semibold)).monospacedDigit()
            Button("取消") { store.clearSelection() }.glassButtonStyle()
            Button("刪除", systemImage: "trash", role: .destructive) {
                Task { await store.delete(store.selection) }
            }
            .glassProminentButtonStyle()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .glassSurface(in: Capsule())
        .overlay(Capsule().strokeBorder(Theme.ink(0.1), lineWidth: 1))
        .shadow(color: .black.opacity(0.25), radius: 16, y: 6)
    }

    @ViewBuilder
    private func emptyState(_ store: HistoryStore) -> some View {
        if !store.search.isEmpty {
            EmptyState(
                symbol: "magnifyingglass",
                title: String(localized: "找不到「\(store.search)」"),
                message: String(localized: "換個關鍵字，或清除搜尋看看整個清單。"),
                actionTitle: String(localized: "清除搜尋")
            ) { store.search = "" }
        } else if store.filter != .all {
            EmptyState(
                symbol: store.filter == .completed ? "checkmark.circle" : "play.circle",
                title: store.filter == .completed ? String(localized: "還沒有看完的集數") : String(localized: "沒有進行中的集數"),
                message: String(localized: "換個篩選條件試試。"),
                actionTitle: String(localized: "看全部")
            ) { store.filter = .all }
        } else {
            EmptyState(symbol: "clock", title: String(localized: "還沒有觀看記錄"), message: String(localized: "播放過的集數會出現在這裡，也會同步到 AniList / Bangumi。"))
        }
    }
}

/// Row-shaped placeholders while the first page loads.
private struct HistorySkeleton: View {
    var body: some View {
        VStack(spacing: 2) {
            ForEach(0..<4, id: \.self) { _ in
                HStack(spacing: 14) {
                    SkeletonBox().frame(width: 128, height: 72)
                    VStack(alignment: .leading, spacing: 8) {
                        SkeletonText(width: 220, height: 12)
                        SkeletonText(width: 140, height: 10)
                    }
                    Spacer()
                }
                .padding(.horizontal, 14).padding(.vertical, 10)
            }
        }
        .shimmering()
        .accessibilityLabel("載入中")
    }
}

/// One history entry: still with progress stripe, title, episode chip and
/// progress text, relative time, then the quiet actions and the checkbox at
/// the trailing edge — all of which only show on hover (or while a selection
/// is active), as does the row's own card. Click the still or double-click
/// the row to resume; right-click for the rest.
struct HistoryRow: View {
    let entry: ProgressEntry
    let selected: Bool
    var selecting = false
    var toggle: () -> Void
    var play: () -> Void
    var open: () -> Void
    var remove: () -> Void

    @State private var hovered = false

    var body: some View {
        HStack(spacing: 14) {
            still

            VStack(alignment: .leading, spacing: 5) {
                Text(entry.displayTitle).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                HStack(spacing: 8) {
                    Text(Formatters.episode(entry.episodeNumber))
                        .font(.system(size: 10, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(Theme.Text.secondary)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Theme.ink(0.08), in: RoundedRectangle(cornerRadius: 5, style: .continuous))
                    Text(progressText).font(.system(size: 12)).foregroundStyle(Theme.Text.tertiary).lineLimit(1)
                }
            }
            Spacer(minLength: 12)
            Text(Formatters.relative(entry.lastWatchedAt))
                .font(.system(size: 12)).foregroundStyle(Theme.Text.tertiary).monospacedDigit()
            HStack(spacing: 6) {
                RowIconButton(symbol: "info.circle", label: String(localized: "作品頁"), action: open)
                RowIconButton(symbol: "trash", label: String(localized: "刪除記錄"), destructive: true, action: remove)
            }
            .opacity(hovered ? 1 : 0)
            Button(action: toggle) {
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 16))
                    .foregroundStyle(selected ? Theme.accent : Theme.Text.muted)
                    .frame(width: 28, height: 28)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .opacity(hovered || selected || selecting ? 1 : 0)
            .accessibilityLabel(selected ? String(localized: "取消選取") : String(localized: "選取"))
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(rowBackground, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(rowBorder, lineWidth: 1))
        .contentShape(Rectangle())
        .onHover { hovered = $0 }
        .animation(.easeOut(duration: 0.15), value: hovered)
        .onTapGesture(count: 2) { if !selecting { play() } }
        .onTapGesture { if selecting { toggle() } }
        .contextMenu {
            Button(entry.completed ? "重看" : "繼續", systemImage: "play.fill", action: play)
            Button("作品頁", systemImage: "info.circle", action: open)
            Divider()
            Button("刪除記錄", systemImage: "trash", role: .destructive, action: remove)
        }
    }

    private var still: some View {
        Button(action: play) {
            ZStack {
                RemoteImage(url: entry.animeCoverImage, maxPixel: 320) { Rectangle().fill(Theme.animeGradient(entry.displayTitle)) }
                if hovered {
                    Color.black.opacity(0.35)
                    Image(systemName: "play.fill")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(.black.opacity(0.85))
                        .frame(width: 30, height: 30)
                        .background(.white, in: Circle())
                        .shadow(color: .black.opacity(0.35), radius: 6, y: 2)
                        .transition(.opacity.combined(with: .scale(0.8)))
                }
                if let fraction = entry.fraction, !entry.completed {
                    ProgressStripe(fraction: fraction).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                }
            }
            .frame(width: 128, height: 72)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(.white.opacity(0.08), lineWidth: 0.5))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(entry.completed ? String(localized: "重看") : String(localized: "繼續"))
    }

    private var rowBackground: Color {
        if selected { return Theme.accent.opacity(0.1) }
        return hovered ? Theme.ink(0.04) : .clear
    }

    private var rowBorder: Color {
        if selected { return Theme.accent.opacity(0.35) }
        return hovered ? Theme.ink(0.08) : .clear
    }

    private var progressText: String {
        if entry.completed { return String(localized: "已看完") }
        guard let fraction = entry.fraction else { return String(localized: "尚未開始") }
        let percent = String(localized: "看到 \(Int(fraction * 100))%")
        if let remaining = entry.remainingSeconds { return "\(percent) · \(Formatters.remaining(remaining))" }
        return percent
    }
}
