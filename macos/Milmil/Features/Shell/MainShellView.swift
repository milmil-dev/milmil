import MilmilAPI
import MilmilRealtime
import SwiftUI

/// Sidebar destinations, in the order the design canvas shows them.
enum Destination: String, CaseIterable, Identifiable {
    case home, schedule, search
    case collection, history
    case libraries, downloads, notifications

    var id: String { rawValue }

    var title: String {
        switch self {
        case .home: String(localized: "首頁")
        case .schedule: String(localized: "時刻表")
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
        case .search: "magnifyingglass"
        case .collection: "bookmark"
        case .history: "clock"
        case .libraries: "folder"
        case .downloads: "arrow.down.circle"
        case .notifications: "bell"
        }
    }

    static let sections: [(title: String, items: [Destination])] = [
        (String(localized: "瀏覽"), [.home, .schedule, .search]),
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
    /// Version whose update banner was closed; a newer release shows again.
    @State private var dismissedUpdate: String?
    @State private var resumeReminder: ResumeReminder?
    @State private var weeklyDigest: WeeklyDigestScheduler?
    /// Bare `/` → search, unless a text field has the keyboard.
    @State private var slashMonitor: Any?
    @ObserveInjection private var inject

    var body: some View {
        Group {
            if let session {
                shell(session)
                    .environment(session)
                    .environment(router)
                    .environment(backdrop)
                    // The menu bar's 前往 / 顯示方式 items drive this window's router.
                    .focusedSceneValue(router)
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
            CurrentSession.shared.session = session
            let reminder = ResumeReminder(coordinator: playerCoordinator)
            reminder.start()
            resumeReminder = reminder
            let digest = WeeklyDigestScheduler(client: client)
            digest.start()
            weeklyDigest = digest
            installSlashMonitor()
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
            CurrentSession.shared.session = nil
            resumeReminder?.stop()
            resumeReminder = nil
            weeklyDigest?.stop()
            weeklyDigest = nil
            if let slashMonitor { NSEvent.removeMonitor(slashMonitor) }
            slashMonitor = nil
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
        let columns = Binding<NavigationSplitViewVisibility>(
            get: { router.immersive || router.sidebarCollapsed ? .detailOnly : .all },
            set: { visibility in
                guard !router.immersive else { return }
                router.sidebarCollapsed = visibility == .detailOnly
            }
        )
        return NavigationSplitView(columnVisibility: columns) {
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
            .safeAreaInset(edge: .top, spacing: 0) {
                VStack(spacing: 0) {
                    if session.offlineSince != nil, !router.immersive {
                        OfflineBanner(session: session)
                            .transition(.move(edge: .top).combined(with: .opacity))
                    }
                    if let update = session.updateAvailable, update.latest != dismissedUpdate, !router.immersive {
                        UpdateBanner(update: update) { dismissedUpdate = update.latest }
                            .transition(.move(edge: .top).combined(with: .opacity))
                    }
                }
            }
            .animation(.snappy(duration: 0.25), value: session.updateAvailable?.latest)
            .animation(.snappy(duration: 0.25), value: session.offlineSince)
        }
        .navigationSplitViewStyle(.balanced)
        .toolbar { ShellToolbar() }
        .onChange(of: backdropOwners, initial: true) { _, owners in backdrop.show(owners) }
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

    /// `/` as a bare key: an NSMenu key equivalent without modifiers would
    /// take the character away from every text field, so the shell watches
    /// key-downs itself and only acts when nothing is editing text.
    private func installSlashMonitor() {
        guard slashMonitor == nil else { return }
        slashMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [router] event in
            guard event.charactersIgnoringModifiers == "/", event.modifierFlags.isDisjoint(with: .deviceIndependentFlagsMask),
                  let window = event.window, window.identifier?.rawValue.hasPrefix("main") ?? window.isMainWindow,
                  !(window.firstResponder is NSTextView) else { return event }
            FocusSearch.perform(router)
            return nil
        }
    }

    /// `BackdropStore` owner keys for what is on screen, root first. Each
    /// page publishes under the same key (`HomeView` → "home", the detail
    /// page → "detail-<id>"…), so the store can restore a covered page's
    /// banner the moment the route above it pops.
    private var backdropOwners: [String] {
        [router.destination.rawValue] + router.path.map { route in
            switch route {
            case let .anime(bangumiID): "detail-\(bangumiID)"
            case .history: "history"
            case .watch: "watch"
            }
        }
    }

    @ViewBuilder
    private func root(for destination: Destination) -> some View {
        switch destination {
        case .home: HomeView()
        case .schedule: ScheduleView()
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
        // No row is highlighted while a route is pushed (the watch page is
        // not "Library"); clicking the tab you came from pops back to it.
        let selection = Binding<Destination?>(
            get: { router.path.isEmpty ? router.destination : nil },
            set: { value in
                guard let value else { return }
                if value != router.destination {
                    router.select(value)
                } else if !router.path.isEmpty {
                    router.popToRoot()
                }
            }
        )
        List(selection: selection) {
            ForEach(Destination.sections, id: \.title) { section in
                Section(section.title) {
                    ForEach(section.items) { item in
                        HStack(spacing: 8) {
                            Label(item.title, systemImage: item.symbol)
                            Spacer(minLength: 4)
                            if item == .notifications, session.unreadNotifications > 0 {
                                SidebarBadge(count: session.unreadNotifications)
                            }
                        }
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

/// Unread count as a Mail-style capsule: accent fill, white digits, instead
/// of `.badge`'s grey text that read like a caption. "99+" past two digits —
/// a three-digit badge is noise, not information.
private struct SidebarBadge: View {
    let count: Int

    var body: some View {
        Text(count > 99 ? "99+" : String(count))
            .font(.system(size: 11, weight: .semibold))
            .monospacedDigit()
            .foregroundStyle(.white)
            .padding(.horizontal, 7)
            .padding(.vertical, 2)
            .background(Theme.accent, in: Capsule())
            .accessibilityLabel(String(localized: "\(count) 未讀"))
    }
}

private struct SidebarAccountFooter: View {
    @Environment(ServerSession.self) private var session
    @Environment(SessionStore.self) private var sessionStore
    let version: String
    @State private var hovering = false
    @State private var avatarStore: AvatarStore?
    @State private var pickingCharacter = false
    @State private var dropTargeted = false

    var body: some View {
        VStack(spacing: 0) {
            Divider()
            Menu {
                SettingsLink { Label("設定…", systemImage: "gear") }
                if let avatarStore {
                    Menu("頭像") {
                        AvatarActions(store: avatarStore, hasAvatar: session.user.avatarURL != nil, pickingCharacter: $pickingCharacter)
                    }
                }
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
            // Drop an image on the account row to make it the avatar.
            .onDrop(of: [.fileURL, .image], isTargeted: $dropTargeted) { providers in
                avatarStore?.handleDrop(providers) ?? false
            }
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(Theme.accent, lineWidth: dropTargeted ? 1.5 : 0)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 6)
            )
        }
        .background(.bar)
        .task { if avatarStore == nil { avatarStore = AvatarStore(session: session) } }
        .sheet(isPresented: $pickingCharacter) {
            if let avatarStore { CharacterPickerSheet(session: session, store: avatarStore) }
        }
        .overlay(alignment: .top) {
            if let avatarStore { ToastLabel(text: Binding(get: { avatarStore.toast }, set: { avatarStore.toast = $0 })).padding(.bottom, 4) }
        }
    }

    /// The avatar with the realtime-connection state as a corner badge.
    private var avatar: some View {
        UserAvatarView(user: session.user, client: session.client, size: 32)
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
        // Only while a route is pushed — a permanently disabled glass
        // capsule on the root pages reads as a dead button.
        if !router.path.isEmpty {
            ToolbarItem(placement: .navigation) {
                Button("上一頁", systemImage: "chevron.left") { router.pop() }
            }
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
                Label("快速搜尋", systemImage: "magnifyingglass")
            }
            .labelStyle(.iconOnly)
            .help("快速搜尋（⌘K）")
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

/// `system:update-available` (the web's toast): the version, the release
/// notes, and the Homebrew one-liner since that is how the app installs.
private struct UpdateBanner: View {
    let update: UpdateAvailable
    let dismiss: () -> Void
    @Environment(\.openURL) private var openURL

    var body: some View {
        let version = update.latest
        HStack(spacing: 12) {
            Image(systemName: "arrow.down.app.fill").foregroundStyle(Theme.accent)
            VStack(alignment: .leading, spacing: 2) {
                Text("milmil \(version) 已釋出").font(.system(size: 12, weight: .semibold))
                Text(verbatim: "brew upgrade --cask milmil").font(.system(size: 11, design: .monospaced)).foregroundStyle(Theme.Text.tertiary)
                    .textSelection(.enabled)
            }
            Spacer()
            if let url = update.releaseURL {
                Button("查看更新") { openURL(url) }.glassButtonStyle().controlSize(.small)
            }
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark").font(.system(size: 10, weight: .bold))
            }
            .buttonStyle(.plain).foregroundStyle(Theme.Text.tertiary)
            .help("關閉")
            .accessibilityLabel("關閉")
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(Theme.accent.opacity(0.1))
        .overlay(alignment: .bottom) { Divider() }
    }
}

/// The realtime stream dropped and stayed down: what the app is doing about
/// it, so a stale page reads as "reconnecting", not "broken".
private struct OfflineBanner: View {
    let session: ServerSession

    var body: some View {
        let seconds = session.nextRetrySeconds
        HStack(spacing: 12) {
            ProgressView().controlSize(.small)
            VStack(alignment: .leading, spacing: 2) {
                Text("連唔到 server，重試中…").font(.system(size: 12, weight: .semibold))
                Text("每 \(seconds) 秒重試一次；連上後會自動更新。").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
            }
            Spacer()
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(Color(hex: 0xF59E0B).opacity(0.12))
        .overlay(alignment: .bottom) { Divider() }
    }
}
