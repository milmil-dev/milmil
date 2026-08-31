import MilmilAPI
import SwiftUI

/// The five destinations from the design canvas. Library, downloads,
/// notifications and history are reachable from the toolbar rather than the
/// tab bar: a phone tab bar holds five things well and nine badly.
enum Tab: String, CaseIterable, Identifiable {
    case home, schedule, discover, search, collection

    var id: String { rawValue }

    var title: String {
        switch self {
        case .home: "首頁"
        case .schedule: "時間表"
        case .discover: "探索"
        case .search: "搜尋"
        case .collection: "收藏"
        }
    }

    var symbol: String {
        switch self {
        case .home: "house.fill"
        case .schedule: "calendar"
        case .discover: "flame.fill"
        case .search: "magnifyingglass"
        case .collection: "bookmark.fill"
        }
    }
}

/// Where a pushed page goes. `NavigationStack` per tab would lose the pushed
/// page on a tab switch, so the shell owns one path.
enum Destination: Hashable {
    case detail(Int)
    case torrents(bangumiID: Int, title: String)
    case more
    case history
    case libraries
    case downloads
    case notifications
    case settings
}

/// The signed-in shell: a floating glass tab bar over the content, and one
/// navigation stack for everything that pushes.
struct Shell: View {
    let client: APIClient
    @Environment(SessionStore.self) private var session

    @State var tab: Tab = .home
    @State var path: [Destination] = []
    @State private var unread = 0
    @State private var danmaku = DanmakuSettings()
    @Namespace private var zoom

    var body: some View {
        NavigationStack(path: $path) {
            content
                .navigationTitle(tab == .home ? "" : tab.title)
                .navigationBarTitleDisplayMode(tab == .home ? .inline : .large)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            path.append(.more)
                        } label: {
                            Image(systemName: "ellipsis")
                                .badge(unread)
                        }
                        .accessibilityLabel("更多")
                    }
                }
                .navigationDestination(for: Destination.self) { destination in
                    view(for: destination)
                        .zoomDestination(destination, in: zoom)
                }
                .environment(\.zoomNamespace, zoom)
        }
        // Only over the tabs. A pushed page is not a place you switch tabs
        // from, and the bar was sitting on top of the detail page's own action.
        .safeAreaInset(edge: .bottom) {
            if path.isEmpty { tabBar }
        }
        .tint(Theme.accent)
        .task {
            await refreshBadge()
            applyDebugRoute()
        }
    }

    @ViewBuilder
    private var content: some View {
        switch tab {
        case .home: HomeView(client: client) { path.append(.detail($0)) }
        case .schedule: ScheduleView(client: client) { path.append(.detail($0)) }
        case .discover: DiscoverView(client: client) { path.append(.detail($0)) }
        case .search: SearchView(client: client) { path.append(.detail($0)) }
        case .collection: CollectionView(client: client) { path.append(.detail($0)) }
        }
    }

    @ViewBuilder
    private func view(for destination: Destination) -> some View {
        switch destination {
        case let .detail(bangumiID):
            DetailView(
                client: client,
                bangumiID: bangumiID,
                danmaku: danmaku,
                onFindTorrents: { title in path.append(.torrents(bangumiID: bangumiID, title: title)) }
            )
        case let .torrents(bangumiID, title):
            TorrentsView(client: client, bangumiID: bangumiID, title: title)
        case .more:
            MoreView(unread: unread) { path.append($0) }
        case .history:
            HistoryView(client: client) { path.append(.detail($0)) }
        case .libraries:
            LibrariesView(client: client)
        case .downloads:
            DownloadsView(client: client)
        case .notifications:
            NotificationsView(client: client) { unread = 0 }
        case .settings:
            SettingsView(danmaku: $danmaku)
        }
    }

    /// The Liquid Glass tab bar: a floating capsule, not a bar welded to the
    /// bottom edge. It is what makes the app read as iOS 26 rather than as a
    /// port of the desktop sidebar.
    private var tabBar: some View {
        HStack(spacing: 4) {
            ForEach(Tab.allCases) { item in
                Button {
                    tab = item
                    path.removeAll()
                } label: {
                    VStack(spacing: 3) {
                        Image(systemName: item.symbol).font(.system(size: 17, weight: .semibold))
                        Text(item.title).font(.system(size: 10, weight: .medium))
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .foregroundStyle(tab == item ? Theme.accent : Color.secondary)
                    // Without this the target is the glyph and the caption —
                    // about 20pt wide — and everything else in the slot falls
                    // through to whatever is scrolling underneath.
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 4)
        .glassSurface(in: Capsule())
        .padding(.horizontal, 18)
        .padding(.bottom, 4)
    }

    private func refreshBadge() async {
        unread = (try? await client.unreadNotificationCount()) ?? 0
    }
}

/// The desktop sidebar's other half. A list, because these are places you
/// visit occasionally rather than switch between while browsing.
struct MoreView: View {
    let unread: Int
    let open: (Destination) -> Void

    var body: some View {
        List {
            row("歷史", "clock.arrow.circlepath") { open(.history) }
            row("媒體庫", "folder") { open(.libraries) }
            row("下載", "arrow.down.circle") { open(.downloads) }
            row("通知", "bell", badge: unread) { open(.notifications) }
            row("設定", "gearshape") { open(.settings) }
        }
        .navigationTitle("更多")
    }

    private func row(_ title: String, _ symbol: String, badge: Int = 0, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                Label(title, systemImage: symbol)
                Spacer()
                if badge > 0 {
                    Text("\(badge)")
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, 7)
                        .padding(.vertical, 2)
                        .background(Theme.accent, in: Capsule())
                        .foregroundStyle(.black)
                }
            }
        }
        .tint(.primary)
    }
}

#if DEBUG
extension Shell {
    /// Debug-only navigation hooks, the iOS twins of the macOS client's
    /// `MILMIL_SNAPSHOT_DESTINATION` / `MILMIL_SNAPSHOT_ANIME`.
    ///
    /// `idb` can read this simulator's accessibility tree but cannot tap it
    /// (Xcode-beta ships no SimulatorKit), so without these every screen past
    /// the first is unverifiable on a headless run.
    func applyDebugRoute() {
        let environment = ProcessInfo.processInfo.environment
        if let raw = environment["MILMIL_TAB"], let wanted = Tab(rawValue: raw) {
            tab = wanted
        }
        if let raw = environment["MILMIL_MORE"] {
            switch raw {
            case "history": path = [.more, .history]
            case "libraries": path = [.more, .libraries]
            case "downloads": path = [.more, .downloads]
            case "notifications": path = [.more, .notifications]
            case "settings": path = [.more, .settings]
            default: path = [.more]
            }
        }
        if let raw = environment["MILMIL_ANIME"], let bangumiID = Int(raw) {
            path = [.detail(bangumiID)]
        }
        if let raw = environment["MILMIL_TORRENTS"], let bangumiID = Int(raw) {
            path = [.detail(bangumiID), .torrents(bangumiID: bangumiID, title: "")]
        }
    }
}
#else
extension Shell {
    func applyDebugRoute() {}
}
#endif

private extension View {
    /// Only a series page zooms; the management screens are pushes, and a zoom
    /// from nothing in particular is worse than a plain slide.
    @ViewBuilder
    func zoomDestination(_ destination: Destination, in namespace: Namespace.ID) -> some View {
        if case let .detail(bangumiID) = destination {
            navigationTransition(.zoom(sourceID: bangumiID, in: namespace))
        } else {
            self
        }
    }
}
