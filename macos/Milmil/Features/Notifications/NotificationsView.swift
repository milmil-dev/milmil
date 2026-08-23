import MilmilAPI
import SwiftUI

@Observable
final class NotificationsStore {
    var category: MilmilNotification.Category = .all
    private(set) var items: Loadable<[MilmilNotification]> = .idle
    private let client: APIClient

    init(client: APIClient) {
        self.client = client
    }

    func load() async {
        items = items.reloading
        items = await items.reloaded { try await client.notifications(category: category, limit: 100) }
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
        .onDisappear { backdrop.clear(owner: "notifications") }
    }

    private func content(_ store: NotificationsStore) -> some View {
        @Bindable var store = store
        return ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                PageHeader(title: "通知", subtitle: session.unreadNotifications > 0 ? "\(session.unreadNotifications) 未讀" : nil) {
                    HStack(spacing: 8) {
                        Segmented(options: MilmilNotification.Category.allCases, selection: $store.category) { category in
                            switch category {
                            case .all: "全部"
                            case .download: "下載"
                            case .library: "媒體庫"
                            case .system: "系統"
                            }
                        }
                        Button("全部標為已讀") {
                            Task {
                                await store.markAllRead()
                                session.setUnread(0)
                            }
                        }
                        .buttonStyle(.bordered)
                        Button("清空", systemImage: "trash", role: .destructive) { confirmClear = true }.buttonStyle(.bordered)
                    }
                }
                switch store.items {
                case .loaded where (store.items.value ?? []).isEmpty:
                    EmptyState(symbol: "bell", title: "沒有通知", message: "下載完成、掃描結果與系統訊息會出現在這裡。")
                        .frame(maxWidth: .infinity).padding(.top, 40)
                case let .loaded(items):
                    VStack(spacing: 2) {
                        ForEach(items) { item in
                            NotificationRow(item: item) {
                                Task {
                                    if !item.read {
                                        await store.markRead(item.id)
                                        session.setUnread(session.unreadNotifications - 1)
                                    }
                                }
                            }
                        }
                    }
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
}

/// Names shared with `ServerEventType` without importing MilmilRealtime here.
enum ServerEventTypeNames {
    static let notificationNew = "notification:new"
}

struct NotificationRow: View {
    let item: MilmilNotification
    var tap: () -> Void

    var body: some View {
        Button(action: tap) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: symbol)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(tint)
                    .frame(width: 32, height: 32)
                    .background(tint.opacity(0.14), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(item.title).font(.system(size: 13, weight: .semibold))
                        if !item.read { Circle().fill(Theme.accent).frame(width: 6, height: 6) }
                        Spacer()
                        Text(Formatters.relative(item.createdAt)).font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                    }
                    Text(item.message).font(.system(size: 12)).foregroundStyle(Theme.Text.secondary).lineLimit(3)
                }
            }
            .padding(.horizontal, 12).padding(.vertical, 10)
            .background(item.read ? .clear : .white.opacity(0.03), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var symbol: String {
        switch item.category {
        case .download: "arrow.down.circle"
        case .library: "folder"
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
