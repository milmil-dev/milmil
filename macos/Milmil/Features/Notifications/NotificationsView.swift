import MilmilAPI
import SwiftUI

@Observable
final class NotificationsStore {
    var category: MilmilNotification.Category = .all
    private(set) var items: Loadable<[MilmilNotification]> = .idle
    private(set) var isRefreshing = false
    private let client: APIClient

    init(client: APIClient) {
        self.client = client
    }

    /// 今天 / 昨天 / 本週 / 更早.
    var buckets: [(title: String, items: [MilmilNotification])] {
        DateBucket.group(items.value ?? [], date: \.createdAt)
    }

    func load() async {
        isRefreshing = items.value != nil
        items = items.reloading
        items = await items.reloaded { try await client.notifications(category: category, limit: 100) }
        isRefreshing = false
    }

    func markRead(_ id: String) async {
        if let list = items.value { items = .loaded(list.map { $0.id == id ? $0.markedRead : $0 }) }
        try? await client.markNotificationRead(id: id)
    }

    func markAllRead() async {
        if let list = items.value { items = .loaded(list.map(\.markedRead)) }
        try? await client.markAllNotificationsRead()
    }

    func clear() async {
        items = .loaded([])
        try? await client.clearNotifications()
    }
}

extension MilmilNotification {
    /// Local copy with `read = true` for optimistic updates.
    var markedRead: MilmilNotification {
        var copy = self
        copy.read = true
        return copy
    }
}

/// 通知: category tabs, unread pill, day-grouped cards. Unread rows carry
/// an accent dot and a hover "mark read" action; clicking a row reads it.
struct NotificationsView: View {
    @Environment(ServerSession.self) private var session
    @Environment(Router.self) private var router
    @Environment(BackdropStore.self) private var backdrop
    @State private var store: NotificationsStore?
    @State private var confirmClear = false
    @ObserveInjection private var inject

    var body: some View {
        Group {
            if let store { content(store) } else { Color.clear }
        }
        .navigationTitle("通知")
        .task {
            if store == nil { store = NotificationsStore(client: session.client) }
            backdrop.set(nil, seed: "notifications", dim: 0.6, owner: "notifications")
            await store?.load()
        }
        .task(id: session.eventGeneration) {
            guard session.eventGeneration > 0, session.lastEvent?.type == ServerEventTypeNames.notificationNew else { return }
            await store?.load()
        }
    }

    private func content(_ store: NotificationsStore) -> some View {
        @Bindable var store = store
        let unread = session.unreadNotifications
        let isEmpty = (store.items.value ?? []).isEmpty
        return ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                PageBar {
                    FilterTabs(
                        tabs: [
                            FilterTab(value: MilmilNotification.Category.all, label: String(localized: "全部")),
                            FilterTab(value: .download, label: String(localized: "下載")),
                            FilterTab(value: .library, label: String(localized: "媒體庫")),
                            FilterTab(value: .system, label: String(localized: "系統")),
                            FilterTab(value: .anime, label: String(localized: "番劇")),
                        ],
                        selection: $store.category
                    )
                } trailing: {
                    if unread > 0 {
                        StatusPill(text: String(localized: "\(unread) 未讀"))
                    }
                    ChipButton(title: String(localized: "全部標為已讀"), symbol: "checkmark.circle") {
                        Task {
                            await store.markAllRead()
                            session.setUnread(0)
                        }
                    }
                    .disabled(unread == 0)
                    RowIconButton(symbol: "trash", label: String(localized: "清空通知"), destructive: true) { confirmClear = true }
                        .disabled(isEmpty)
                        .opacity(isEmpty ? 0.4 : 1)
                }
                switch store.items {
                case .loaded where isEmpty:
                    emptyState(store).frame(maxWidth: .infinity).padding(.top, 40)
                case .loaded:
                    VStack(alignment: .leading, spacing: 22) {
                        ForEach(store.buckets, id: \.title) { bucket in
                            VStack(alignment: .leading, spacing: 8) {
                                SectionLabel(title: bucket.title, count: bucket.items.count)
                                VStack(spacing: 0) {
                                    ForEach(Array(bucket.items.enumerated()), id: \.element.id) { index, item in
                                        if index > 0 { RowDivider(inset: 62) }
                                        NotificationRow(
                                            item: item,
                                            markRead: { markRead(item, store) },
                                            open: item.bangumiID.map { id in { router.handle(url: URL(string: "milmil://anime/\(id)")!) } },
                                            play: item.bangumiID.flatMap { id in
                                                item.episodeID.map { episode in { router.handle(url: URL(string: "milmil://watch/\(id)?ep=\(episode)")!) } }
                                            }
                                        )
                                    }
                                }
                                .groupedCard()
                            }
                        }
                    }
                    .opacity(store.isRefreshing ? 0.5 : 1)
                    .animation(.easeOut(duration: 0.2), value: store.isRefreshing)
                case let .failed(message):
                    ErrorBanner(message: message) { Task { await store.load() } }
                default:
                    VStack(alignment: .leading, spacing: 22) {
                        SkeletonSection(rows: 4)
                        SkeletonSection(rows: 3)
                    }
                }
            }
            .padding(.horizontal, 40)
            .padding(.top, 16)
            .padding(.bottom, 40)
        }
        .onChange(of: store.category) { Task { await store.load() } }
        .confirmationDialog("清空所有通知？", isPresented: $confirmClear, titleVisibility: .visible) {
            Button("清空", role: .destructive) {
                Task {
                    await store.clear()
                    session.setUnread(0)
                }
            }
        }
    }

    private func markRead(_ item: MilmilNotification, _ store: NotificationsStore) {
        guard !item.read else { return }
        Task {
            await store.markRead(item.id)
            session.setUnread(max(0, session.unreadNotifications - 1))
        }
    }

    @ViewBuilder
    private func emptyState(_ store: NotificationsStore) -> some View {
        if store.category != .all {
            EmptyState(
                symbol: "bell",
                title: String(localized: "這個分類沒有通知"),
                message: String(localized: "換個分類，或看全部通知。"),
                actionTitle: String(localized: "看全部")
            ) { store.category = .all }
        } else {
            EmptyState(symbol: "bell", title: String(localized: "沒有通知"), message: String(localized: "下載完成、掃描結果與系統訊息會出現在這裡。"))
        }
    }
}

/// Names shared with `ServerEventType` without importing MilmilRealtime here.
enum ServerEventTypeNames {
    static let notificationNew = "notification:new"
}

struct NotificationRow: View {
    let item: MilmilNotification
    var markRead: () -> Void
    /// Series page / playback for events that name an anime; nil hides them.
    var open: (() -> Void)?
    var play: (() -> Void)?
    @State private var hovered = false

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Circle()
                .fill(Theme.accent)
                .frame(width: 6, height: 6)
                .opacity(item.read ? 0 : 1)
                .padding(.top, 13)
            Image(systemName: symbol)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(item.read ? Theme.Text.tertiary : tint)
                .frame(width: 32, height: 32)
                .background(item.read ? Theme.ink(0.05) : tint.opacity(0.14), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(item.title)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(item.read ? Theme.Text.secondary : Theme.Text.primary)
                        .lineLimit(1)
                    Spacer(minLength: 8)
                    Text(Formatters.relative(item.createdAt)).font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary).monospacedDigit()
                }
                Text(item.message)
                    .font(.system(size: 12))
                    .foregroundStyle(item.read ? Theme.Text.tertiary : Theme.Text.secondary)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 6) {
                if let play { RowIconButton(symbol: "play.fill", label: String(localized: "播放"), prominent: true, action: play) }
                if let open { RowIconButton(symbol: "info.circle", label: String(localized: "作品頁"), action: open) }
                if !item.read { RowIconButton(symbol: "checkmark", label: String(localized: "標為已讀"), action: markRead) }
            }
            .opacity(hovered ? 1 : 0)
            .padding(.top, 2)
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(hovered ? Theme.ink(0.04) : .clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .padding(4)
        .contentShape(Rectangle())
        .onHover { hovered = $0 }
        .animation(.easeOut(duration: 0.15), value: hovered)
        .onTapGesture(perform: markRead)
        .contextMenu {
            if let play { Button("播放", systemImage: "play.fill", action: play) }
            if let open { Button("作品頁", systemImage: "info.circle", action: open) }
            if !item.read { Button("標為已讀", systemImage: "checkmark.circle", action: markRead) }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(item.read ? [] : .isButton)
    }

    private var symbol: String {
        switch item.category {
        case .download: "arrow.down.circle"
        case .library: "folder"
        case .anime: item.type == "anime.airing" ? "clock" : "sparkles.tv"
        case .system, .all: item.severity == .error ? "exclamationmark.triangle" : "info.circle"
        }
    }

    private var tint: Color {
        switch item.severity {
        case .success: Color(hex: 0x4ADE80)
        case .error: Color(hex: 0xF87171)
        case .info: item.category == .library ? Theme.accent : Color(hex: 0x7DD3FC)
        }
    }
}
