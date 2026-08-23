import MilmilAPI
import SwiftUI

/// Sidebar destinations, in the order the design canvas shows them.
enum Destination: String, CaseIterable, Identifiable {
    case home, schedule, discover, search
    case collection, history
    case libraries, downloads, notifications

    var id: String { rawValue }

    var title: String {
        switch self {
        case .home: "首頁"
        case .schedule: "時刻表"
        case .discover: "探索"
        case .search: "搜尋"
        case .collection: "收藏"
        case .history: "歷史"
        case .libraries: "媒體庫"
        case .downloads: "下載"
        case .notifications: "通知"
        }
    }

    var symbol: String {
        switch self {
        case .home: "house"
        case .schedule: "calendar"
        case .discover: "flame"
        case .search: "magnifyingglass"
        case .collection: "bookmark"
        case .history: "clock"
        case .libraries: "folder"
        case .downloads: "arrow.down.circle"
        case .notifications: "bell"
        }
    }

    static let sections: [(title: String, items: [Destination])] = [
        ("首頁", [.home, .schedule, .discover, .search]),
        ("我的", [.collection, .history]),
        ("管理", [.libraries, .downloads, .notifications]),
    ]
}

/// The logged-in window: sidebar + a NavigationStack per tab over the
/// shared backdrop, with the ⌘K palette layered on top.
struct MainShellView: View {
    @Environment(SessionStore.self) private var sessionStore
    let profile: ServerProfile
    let user: User
    let version: String

    @State private var session: ServerSession?
    @State private var router = Router()
    @State private var backdrop = BackdropStore()
    @ObserveInjection private var inject

    var body: some View {
        Group {
            if let session {
                shell(session)
                    .environment(session)
                    .environment(router)
                    .environment(backdrop)
            } else {
                Color.clear
            }
        }
        .task {
            guard session == nil, let client = sessionStore.client else { return }
            let session = ServerSession(profile: profile, user: user, client: client)
            self.session = session
            session.start()
            if let destination = DevSnapshot.initialDestination { router.select(destination) }
            if let anime = DevSnapshot.initialAnime { router.openAnime(anime) }
        }
        .onDisappear { session?.stop() }
    }

    private func shell(_ session: ServerSession) -> some View {
        @Bindable var router = router
        return NavigationSplitView {
            Sidebar(version: version)
        } detail: {
            NavigationStack(path: $router.path) {
                root(for: router.destination)
                    .navigationDestination(for: Route.self) { route in
                        destination(for: route)
                    }
            }
            .background(BackdropLayer())
        }
        .navigationSplitViewStyle(.balanced)
        .toolbar { ShellToolbar() }
        .overlay {
            if router.paletteShown {
                CommandPalette()
                    .transition(.opacity.combined(with: .scale(scale: 0.98)))
            }
        }
        .animation(.snappy(duration: 0.18), value: router.paletteShown)
        .background(Theme.background)
        .tint(Theme.accent)
        .onKeyPress(.escape) {
            guard router.paletteShown else { return .ignored }
            router.paletteShown = false
            return .handled
        }
    }

    @ViewBuilder
    private func root(for destination: Destination) -> some View {
        switch destination {
        case .home: HomeView()
        case .schedule: ScheduleView()
        case .discover: DiscoverView()
        case .search: SearchView()
        case .collection: CollectionView()
        case .history: HistoryView()
        case .libraries: PlaceholderPage(destination: .libraries)
        case .downloads: PlaceholderPage(destination: .downloads)
        case .notifications: NotificationsView()
        }
    }

    @ViewBuilder
    private func destination(for route: Route) -> some View {
        switch route {
        case let .anime(bangumiID):
            AnimeDetailView(bangumiID: bangumiID)
        case let .discoverCategory(title, route):
            DiscoverCategoryView(title: title, route: route)
        case .history:
            HistoryView()
        }
    }
}

private struct Sidebar: View {
    @Environment(Router.self) private var router
    @Environment(ServerSession.self) private var session
    @Environment(SessionStore.self) private var sessionStore
    let version: String

    var body: some View {
        @Bindable var router = router
        List(selection: Binding<Destination?>(get: { router.destination }, set: { if let value = $0, value != router.destination { router.select(value) } })) {
            ForEach(Destination.sections, id: \.title) { section in
                Section(section.title) {
                    ForEach(section.items) { item in
                        Label(item.title, systemImage: item.symbol)
                            .badge(item == .notifications ? session.unreadNotifications : 0)
                            .tag(item)
                    }
                }
            }
        }
        .listStyle(.sidebar)
        .navigationSplitViewColumnWidth(min: 200, ideal: 220, max: 260)
        .safeAreaInset(edge: .bottom) {
            SidebarAccountFooter(version: version)
        }
    }
}

private struct SidebarAccountFooter: View {
    @Environment(ServerSession.self) private var session
    @Environment(SessionStore.self) private var sessionStore
    let version: String

    var body: some View {
        VStack(spacing: 0) {
            Divider()
            HStack(spacing: 9) {
                Circle()
                    .fill(LinearGradient(colors: [Color(hex: 0x6D28D9), Theme.accent], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 26, height: 26)
                    .overlay(Text(String(session.user.username.prefix(1)).uppercased()).font(.system(size: 11, weight: .bold)).foregroundStyle(.white))
                VStack(alignment: .leading, spacing: 1) {
                    Text(session.user.username)
                        .font(.system(size: 12, weight: .semibold))
                    HStack(spacing: 4) {
                        Circle().fill(session.isRealtimeConnected ? .green : .orange).frame(width: 6, height: 6)
                        Text("\(session.profile.name) · v\(version)")
                    }
                    .font(.system(size: 10))
                    .foregroundStyle(Theme.Text.tertiary)
                    .lineLimit(1)
                }
                Spacer()
                Menu {
                    SettingsLink { Label("設定…", systemImage: "gear") }
                    Divider()
                    Button("登出", systemImage: "rectangle.portrait.and.arrow.right") {
                        Task { await sessionStore.logout() }
                    }
                    Button("切換伺服器", systemImage: "server.rack") { sessionStore.switchToNoServer() }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .menuStyle(.borderlessButton)
                .menuIndicator(.hidden)
                .frame(width: 24)
                .accessibilityLabel("帳號選單")
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
        }
        .background(.bar)
    }
}

/// Back + ⌘K search. Notifications live in the sidebar (badged), not here.
private struct ShellToolbar: ToolbarContent {
    @Environment(Router.self) private var router

    var body: some ToolbarContent {
        ToolbarItem(placement: .navigation) {
            Button("上一頁", systemImage: "chevron.left") { _ = router.path.popLast() }
                .disabled(router.path.isEmpty)
        }
        ToolbarItem(placement: .primaryAction) {
            Button {
                router.paletteShown.toggle()
            } label: {
                Label("搜尋", systemImage: "magnifyingglass")
                    .labelStyle(.titleAndIcon)
                    .frame(minWidth: 160, alignment: .leading)
                    .foregroundStyle(Theme.Text.tertiary)
            }
            .keyboardShortcut("k", modifiers: .command)
            .help("搜尋（⌘K）")
        }
    }
}

struct PlaceholderPage: View {
    let destination: Destination

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: destination.symbol)
                .font(.system(size: 36))
                .foregroundStyle(Theme.accent)
            Text(destination.title)
                .font(.system(size: 20, weight: .bold))
            Text("此畫面在 Phase 5（管理）實作。")
                .font(.system(size: 12))
                .foregroundStyle(Theme.Text.tertiary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .navigationTitle(destination.title)
    }
}

struct PlaceholderRoute: View {
    let title: String

    var body: some View {
        VStack(spacing: 12) {
            Text(title).font(.system(size: 20, weight: .bold))
            Text("此畫面在 Phase 1 的下一批實作。").font(.system(size: 12)).foregroundStyle(Theme.Text.tertiary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .navigationTitle(title)
    }
}

#if DEBUG
#Preview("Main shell") {
    PreviewHost(phase: .ready(Preview.profile, user: Preview.user, version: "0.1.17")) {
        MainShellView(profile: Preview.profile, user: Preview.user, version: "0.1.17")
    }
}
#endif
