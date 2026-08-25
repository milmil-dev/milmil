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
        case .home: String(localized: "首頁")
        case .schedule: String(localized: "時刻表")
        case .discover: String(localized: "探索")
        case .search: String(localized: "搜尋")
        case .collection: String(localized: "收藏")
        case .history: String(localized: "歷史")
        case .libraries: String(localized: "媒體庫")
        case .downloads: String(localized: "下載")
        case .notifications: String(localized: "通知")
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
        (String(localized: "首頁"), [.home, .schedule, .discover, .search]),
        (String(localized: "我的"), [.collection, .history]),
        (String(localized: "管理"), [.libraries, .downloads, .notifications]),
    ]
}

/// The logged-in window: sidebar + a NavigationStack per tab over the
/// shared backdrop, with the ⌘K palette layered on top.
struct MainShellView: View {
    @Environment(SessionStore.self) private var sessionStore
    @Environment(PlayerCoordinator.self) private var playerCoordinator
    @Environment(\.openWindow) private var openWindow
    @Environment(\.openSettings) private var openSettings
    @Environment(\.pendingOpenURLs) private var pendingOpenURLs
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
            playerCoordinator.session = session
            if let destination = DevSnapshot.initialDestination { router.select(destination) }
            if let anime = DevSnapshot.initialAnime { router.openAnime(anime) }
            if DevSnapshot.opensSettings { openSettings() }
            if let id = DevSnapshot.initialTorrents {
                Task { if let detail = try? await session.client.animeDetail(bangumiID: id) { router.findTorrents(for: detail.summary) } }
            }
            if let anime = DevSnapshot.initialPlayback {
                router.openWatch(bangumiID: anime, episodeID: nil)
                if ProcessInfo.processInfo.environment["MILMIL_SNAPSHOT_WINDOW"] == "player" {
                    playerCoordinator.play(PlaybackRequest(bangumiID: anime, title: "Snapshot"))
                    playerCoordinator.popOut()
                    openWindow(id: "player")
                }
            }
        }
        .onDisappear {
            session?.stop()
            playerCoordinator.session = nil
        }
        .onChange(of: pendingOpenURLs.links.wrappedValue.count, initial: true) { _, count in
            guard count > 0, session != nil else { return }
            for url in pendingOpenURLs.drainLinks() { router.handle(url: url) }
        }
        .onChange(of: pendingOpenURLs.files.wrappedValue.count, initial: true) { _, count in
            guard count > 0, let session else { return }
            let files = pendingOpenURLs.drainFiles().filter { $0.pathExtension.lowercased() == "torrent" }
            guard !files.isEmpty else { return }
            router.select(.downloads)
            Task {
                for file in files {
                    _ = try? await session.client.addDownload(url: file.absoluteString, name: file.deletingPathExtension().lastPathComponent)
                }
            }
        }
        .onChange(of: router.pendingPlayback) { _, request in
            guard let request else { return }
            router.pendingPlayback = nil
            playerCoordinator.play(request)
        }
    }

    private func shell(_ session: ServerSession) -> some View {
        @Bindable var router = router
        return NavigationSplitView(columnVisibility: Binding(get: { router.immersive ? .detailOnly : .all }, set: { _ in })) {
            Sidebar(version: version)
        } detail: {
            NavigationStack(path: $router.path) {
                root(for: router.destination)
                    .navigationDestination(for: Route.self) { route in
                        destination(for: route)
                            // ShellToolbar already provides 上一頁 — without
                            // this, pushed routes show the automatic back
                            // button next to it (two chevrons).
                            .navigationBarBackButtonHidden(true)
                            // Pushed destinations sit in their own opaque
                            // container that hides the stack's backdrop, so
                            // each pushed route carries its own copy — this
                            // is what puts the hero banner on the detail page.
                            .background(BackdropLayer())
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
        .sheet(item: $router.previewAnime) { AnimePreviewSheet(anime: $0) }
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
        case .libraries: LibrariesView()
        case .downloads: DownloadsView()
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
        case let .watch(bangumiID, episodeID):
            WatchView(bangumiID: bangumiID, episodeID: episodeID)
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
    @State private var hovering = false

    var body: some View {
        VStack(spacing: 0) {
            Divider()
            Menu {
                SettingsLink { Label("設定…", systemImage: "gear") }
                Divider()
                Button("切換伺服器", systemImage: "server.rack") { sessionStore.switchToNoServer() }
                Button("登出", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) {
                    Task { await sessionStore.logout() }
                }
            } label: {
                HStack(spacing: 10) {
                    avatar
                    VStack(alignment: .leading, spacing: 2) {
                        Text(session.user.username)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Theme.Text.primary)
                        Text("\(session.profile.name) · v\(version)")
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.Text.tertiary)
                    }
                    .lineLimit(1)
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(hovering ? Theme.Text.secondary : Theme.Text.tertiary)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 7)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(Theme.ink(hovering ? 0.07 : 0))
                )
            }
            .menuStyle(.button)
            .menuIndicator(.hidden)
            .buttonStyle(.plain)
            .onHover { hovering = $0 }
            .animation(.easeOut(duration: 0.12), value: hovering)
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .accessibilityLabel("帳號選單")
            .help("帳號選單")
        }
        .background(.bar)
    }

    /// Gradient monogram with the realtime-connection state as a corner badge.
    private var avatar: some View {
        Circle()
            .fill(LinearGradient(colors: [Color(hex: 0x6D28D9), Theme.accent], startPoint: .topLeading, endPoint: .bottomTrailing))
            .frame(width: 32, height: 32)
            .overlay(
                Text(String(session.user.username.prefix(1)).uppercased())
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
            )
            .overlay(alignment: .bottomTrailing) {
                Circle()
                    .fill(session.isRealtimeConnected ? .green : .orange)
                    .frame(width: 9, height: 9)
                    .overlay(Circle().strokeBorder(Theme.background, lineWidth: 1.5))
                    .offset(x: 1, y: 1)
            }
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
        // Flexible space — pins the search pill to the trailing edge (the
        // hidden-title unified toolbar otherwise packs items from the left).
        ToolbarItem(placement: .primaryAction) {
            Spacer()
        }
        ToolbarItem(placement: .primaryAction) {
            Button {
                router.paletteShown.toggle()
            } label: {
                Label("搜尋", systemImage: "magnifyingglass")
            }
            .labelStyle(.iconOnly)
            .keyboardShortcut("k", modifiers: .command)
            .help("搜尋（⌘K）")
        }
    }
}

#if DEBUG
#Preview("Main shell") {
    PreviewHost(phase: .ready(Preview.profile, user: Preview.user, version: "0.1.17")) {
        MainShellView(profile: Preview.profile, user: Preview.user, version: "0.1.17")
    }
}
#endif
