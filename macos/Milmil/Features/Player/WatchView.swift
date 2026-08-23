import AppKit
import MilmilAPI
import SwiftUI

/// In-app watch page (the web's WatchPage): player on top, title bar,
/// synopsis; the right column is the player inspector (episodes, subtitle,
/// audio, video, danmaku). Theater mode hides the column; fullscreen goes
/// immersive (sidebar + toolbar hidden).
struct WatchView: View {
    let bangumiID: Int
    let episodeID: String?

    @Environment(ServerSession.self) private var session
    @Environment(Router.self) private var router
    @Environment(BackdropStore.self) private var backdrop
    @Environment(PlayerCoordinator.self) private var coordinator
    @Environment(\.openWindow) private var openWindow
    @AppStorage("watch.theater") private var theater = false
    @State private var store: WatchStore?
    @State private var surfaceModel = PlayerWindowModel()
    @FocusState private var composeFocused: Bool
    @ObserveInjection private var inject

    private static let sidebarWidth: CGFloat = 380

    var body: some View {
        Group {
            if let controller = coordinator.controller, let store {
                content(controller, store)
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle(store?.detail.value?.title ?? coordinator.controller?.request?.title ?? "播放")
        .toolbar(router.immersive ? .hidden : .automatic, for: .windowToolbar)
        .background(Theme.background)
        .task(id: bangumiID) {
            backdrop.set(nil, seed: "watch", dim: 0.7, owner: "watch")
            let store = WatchStore(bangumiID: bangumiID, client: session.client)
            self.store = store
            coordinator.watchVisible = true
            if !coordinator.isPlaying(bangumiID: bangumiID, episodeID: episodeID) {
                coordinator.play(PlaybackRequest(bangumiID: bangumiID, episodeID: episodeID, title: store.detail.value?.title ?? ""))
            } else {
                coordinator.controller?.resumeCurrentEpisode()
            }
            await store.load()
            if let detail = store.detail.value { coordinator.controller?.updateTitle(detail.title, cover: detail.coverImage) }
        }
        .onDisappear {
            backdrop.clear(owner: "watch")
            router.immersive = false
            surfaceModel.detach()
            // Pushing 作品頁 on top also fires this; only a real pop stops playback.
            let stillOnStack = router.path.contains { if case .watch = $0 { return true } else { return false } }
            coordinator.watchDidDisappear(stillOnStack: stillOnStack)
        }
        .onChange(of: surfaceModel.isFullscreen) { _, full in router.immersive = full }
    }

    private func content(_ controller: PlayerController, _ store: WatchStore) -> some View {
        let immersive = router.immersive
        return GeometryReader { proxy in
            HStack(spacing: 0) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        playerArea(controller, available: proxy.size, immersive: immersive)
                        if !immersive {
                            DanmakuComposeBar(controller: controller, focused: $composeFocused)
                                .padding(.horizontal, 20)
                                .padding(.top, 8)
                            WatchTitleBar(store: store, controller: controller, theater: $theater) {
                                coordinator.popOut()
                                openWindow(id: "player")
                            }
                            .padding(.horizontal, 20)
                            .padding(.top, 10)
                            if let detail = store.detail.value {
                                WatchInfoSection(detail: detail)
                                    .padding(.horizontal, 20)
                                    .padding(.top, 14)
                                    .padding(.bottom, 40)
                            }
                        }
                    }
                }
                .scrollDisabled(immersive)
                if !theater, !immersive {
                    Divider()
                    PlayerInspector(controller: controller)
                        .frame(width: Self.sidebarWidth)
                }
            }
        }
        .animation(.snappy(duration: 0.25), value: theater)
    }

    @ViewBuilder
    private func playerArea(_ controller: PlayerController, available: CGSize, immersive: Bool) -> some View {
        let columnWidth = available.width - (theater || immersive ? 0 : Self.sidebarWidth + 1)
        // Web: 16:9, capped by the viewport height in theater / immersive mode.
        let capped = immersive ? available.height : (theater ? available.height - 80 : .greatestFiniteMagnitude)
        let height = min(columnWidth * 9 / 16, capped)
        if coordinator.presentation == .window {
            VStack(spacing: 12) {
                Image(systemName: "macwindow.on.rectangle").font(.system(size: 36)).foregroundStyle(Theme.Text.tertiary)
                Text("正在獨立視窗播放").font(.system(size: 14, weight: .semibold))
                Button("拉回此頁") { dismissPopOut() }.buttonStyle(.borderedProminent)
            }
            .frame(width: columnWidth, height: height)
            .background(Color.black)
        } else {
            PlayerSurface(controller: controller, model: surfaceModel, embedded: true) { action in
                switch action {
                case .theater: theater.toggle()
                case .popOut:
                    coordinator.popOut()
                    openWindow(id: "player")
                case .composeDanmaku: composeFocused = true
                }
            }
            .frame(width: columnWidth, height: height)
            .clipped()
        }
    }

    private func dismissPopOut() {
        for window in NSApp.windows where window.identifier?.rawValue == "player" { window.close() }
    }
}

/// Anime detail for the title bar / info section.
@Observable
final class WatchStore {
    let bangumiID: Int
    private(set) var detail: Loadable<AnimeDetail> = .idle
    private let client: APIClient

    init(bangumiID: Int, client: APIClient) {
        self.bangumiID = bangumiID
        self.client = client
    }

    func load() async {
        detail = detail.reloading
        detail = await detail.reloaded { try await client.animeDetail(bangumiID: bangumiID) }
    }
}

/// Title, year · episodes, score / collect / copy-link, theater & pop-out.
struct WatchTitleBar: View {
    let store: WatchStore
    let controller: PlayerController
    @Binding var theater: Bool
    var popOut: () -> Void

    @Environment(Router.self) private var router
    @State private var scorePrompt = false
    @State private var scoreText = ""

    var body: some View {
        let detail = store.detail.value
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(detail?.title ?? controller.request?.title ?? "")
                    .font(.system(size: 17, weight: .semibold)).lineLimit(1)
                if let episode = controller.episode {
                    Text("第 \(episode.number) 集\(episode.displayTitle.map { " · \($0)" } ?? "")")
                        .font(.system(size: 13)).foregroundStyle(Theme.Text.secondary).lineLimit(1)
                }
                Spacer()
            }
            HStack(spacing: 6) {
                Text(meta(detail)).font(.system(size: 12)).foregroundStyle(Theme.Text.tertiary)
                Spacer()
                Button {
                    scoreText = controller.playable?.userScore.map(String.init) ?? ""
                    scorePrompt = true
                } label: {
                    Label(controller.playable?.userScore.map { "\($0)" } ?? "評分", systemImage: controller.playable?.userScore == nil ? "star" : "star.fill")
                }
                .foregroundStyle(controller.playable?.userScore == nil ? Theme.Text.secondary : Color(hex: 0xFBBF24))
                Button {
                    Task { await controller.toggleCollection() }
                } label: {
                    Label(controller.isInCollection ? "已收藏" : "收藏", systemImage: controller.isInCollection ? "bookmark.fill" : "bookmark")
                }
                .foregroundStyle(controller.isInCollection ? Theme.accent : Theme.Text.secondary)
                Button {
                    router.openAnime(store.bangumiID)
                } label: {
                    Label("作品頁", systemImage: "info.circle")
                }
                Divider().frame(height: 14)
                Button {
                    theater.toggle()
                } label: {
                    Label(theater ? "預設檢視" : "劇院模式", systemImage: theater ? "rectangle.inset.filled" : "rectangle.expand.vertical")
                }
                .help(theater ? "預設檢視（T）" : "劇院模式（T）")
                Button(action: popOut) {
                    Label("獨立視窗", systemImage: "macwindow.badge.plus")
                }
                .help("在獨立視窗播放")
            }
            .buttonStyle(.plain)
            .font(.system(size: 12, weight: .medium))
            .labelStyle(.titleAndIcon)
        }
        .alert("評分（1–10）", isPresented: $scorePrompt) {
            TextField("8", text: $scoreText)
            Button("儲存") {
                Task { await controller.setScore(Int(scoreText)) }
            }
            Button("清除", role: .destructive) { Task { await controller.setScore(nil) } }
            Button("取消", role: .cancel) {}
        }
    }

    private func meta(_ detail: AnimeDetail?) -> String {
        var parts: [String] = []
        if let date = detail?.summary.airDate, date.count >= 4 { parts.append(String(date.prefix(4))) }
        if let count = detail?.summary.episodeCount, count > 0 { parts.append("\(count) 集") }
        if controller.state.status.isActive { parts.append(controller.state.stage.label) }
        return parts.joined(separator: " · ")
    }
}

/// Synopsis + genres, the web's `AnimeInfoSection`.
struct WatchInfoSection: View {
    let detail: AnimeDetail
    @Environment(Router.self) private var router
    @State private var expanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let synopsis = detail.synopsis?.strippingHTML ?? detail.summary.description?.strippingHTML {
                Text(synopsis)
                    .font(.system(size: 13))
                    .foregroundStyle(.white.opacity(0.75))
                    .lineSpacing(4)
                    .lineLimit(expanded ? nil : 3)
                    .frame(maxWidth: 760, alignment: .leading)
                    .onTapGesture { expanded.toggle() }
            }
            FlowLayout(spacing: 6) {
                if let season = Formatters.season(from: detail.summary.airDate) { Chip(text: season, small: true) }
                ForEach(detail.summary.genres.prefix(6), id: \.self) { genre in
                    Button {
                        router.push(.discoverCategory(title: Genre.label(for: genre), query: .genre(genre)))
                    } label: {
                        Chip(text: Genre.label(for: genre), small: true)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}
