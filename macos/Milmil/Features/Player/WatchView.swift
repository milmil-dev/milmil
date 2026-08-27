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
    @State private var token = UUID()
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
        .navigationTitle(store?.detail.value?.title ?? coordinator.controller?.request?.title ?? String(localized: "播放"))
        .toolbar(router.immersive ? .hidden : .automatic, for: .windowToolbar)
        .background(Theme.background)
        .task(id: bangumiID) {
            backdrop.set(nil, seed: "watch", dim: 0.7, owner: "watch")
            let store = WatchStore(bangumiID: bangumiID, client: session.client)
            self.store = store
            coordinator.watchDidAppear(token: token)
            if !coordinator.isPlaying(bangumiID: bangumiID, episodeID: episodeID) {
                coordinator.play(PlaybackRequest(bangumiID: bangumiID, episodeID: episodeID, title: store.detail.value?.title ?? ""))
            } else {
                coordinator.controller?.resumeCurrentEpisode()
            }
            await store.load()
            if let detail = store.detail.value { coordinator.controller?.updateTitle(detail.title, cover: detail.coverImage) }
            coordinator.controller?.updateEpisodeImages(store.episodeImages)
        }
        .onDisappear {
            router.immersive = false
            surfaceModel.detach()
            // Pushing 作品頁 on top also fires this; only a real pop stops playback.
            let stillOnStack = router.path.contains { if case .watch = $0 { return true } else { return false } }
            coordinator.watchDidDisappear(token: token, stillOnStack: stillOnStack)
        }
        .onChange(of: surfaceModel.isFullscreen) { _, full in router.immersive = full }
        // 視窗 › 播放器全螢幕 etc. act on this surface while the main window is key.
        .focusedSceneValue(surfaceModel)
        // Handoff: the same series / episode on the web watch page
        // (`/watch/<id>?ep=<number>`) from another device's Safari.
        .userActivity(Self.handoffActivity) { activity in
            activity.title = store?.detail.value?.title ?? coordinator.controller?.request?.title
            activity.webpageURL = handoffURL
            activity.isEligibleForHandoff = true
            activity.isEligibleForSearch = false
            activity.isEligibleForPublicIndexing = false
        }
    }

    static let handoffActivity = "dev.milmil.watch"

    private var handoffURL: URL? {
        var components = URLComponents(url: session.profile.baseURL, resolvingAgainstBaseURL: false)
        components?.path = "/watch/\(bangumiID)"
        if let number = coordinator.controller?.episode?.number {
            components?.queryItems = [URLQueryItem(name: "ep", value: number)]
        }
        return components?.url
    }

    private func content(_ controller: PlayerController, _ store: WatchStore) -> some View {
        let immersive = router.immersive
        return GeometryReader { proxy in
            let inspectorShown = !theater && !immersive
            // The column widths are pinned to the geometry on both sides:
            // a child that wants more (a wide segmented control, a long
            // action row) must not be able to push the inspector off the
            // window edge — it gets clipped inside its own column instead.
            let columnWidth = inspectorShown ? proxy.size.width - Self.sidebarWidth : proxy.size.width
            HStack(spacing: 0) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        playerArea(controller, available: proxy.size, immersive: immersive)
                        if !immersive {
                            // Its own strip under the player, not part of the card.
                            DanmakuComposeBar(controller: controller, focused: $composeFocused)
                                .padding(.horizontal, 12)
                                .frame(height: 44)
                                .background(Theme.ink(0.04), in: RoundedRectangle(cornerRadius: theater ? 0 : 10, style: .continuous))
                                .padding(.horizontal, theater ? 0 : 20)
                                .padding(.top, theater ? 0 : 10)
                            WatchTitleBar(store: store, controller: controller)
                                .padding(.horizontal, 20)
                                .padding(.top, 16)
                            if let detail = store.detail.value {
                                WatchInfoSection(detail: detail)
                                    .padding(.horizontal, 20)
                                    .padding(.top, 14)
                                    .padding(.bottom, 40)
                            }
                        }
                    }
                    .frame(width: columnWidth, alignment: .leading)
                }
                .scrollDisabled(immersive)
                .frame(width: columnWidth)
                .clipped()
                if inspectorShown {
                    // No rule between the columns: the inspector's own
                    // background is the boundary.
                    PlayerInspector(controller: controller)
                        .frame(width: Self.sidebarWidth)
                        .frame(maxHeight: .infinity)
                        .clipped()
                }
            }
        }
        .animation(.snappy(duration: 0.25), value: theater)
    }

    @ViewBuilder
    private func playerArea(_ controller: PlayerController, available: CGSize, immersive: Bool) -> some View {
        // Normal layout: the player is a rounded card inset like the rest of
        // the column (web `rounded-xl` + page gutter); theater / immersive
        // go edge to edge.
        let inset: CGFloat = theater || immersive ? 0 : 20
        let columnWidth = available.width - (theater || immersive ? 0 : Self.sidebarWidth) - inset * 2
        // Web: 16:9, capped by the viewport height in theater / immersive mode.
        let capped = immersive ? available.height : (theater ? available.height - 80 : .greatestFiniteMagnitude)
        let height = min(columnWidth * 9 / 16, capped)
        let shape = RoundedRectangle(cornerRadius: inset > 0 ? 14 : 0, style: .continuous)
        if coordinator.presentation == .window {
            VStack(spacing: 12) {
                Image(systemName: "macwindow.on.rectangle").font(.system(size: 36)).foregroundStyle(Theme.Text.tertiary)
                Text("正在獨立視窗播放").font(.system(size: 14, weight: .semibold))
                Button("拉回此頁") { dismissPopOut() }.glassProminentButtonStyle()
            }
            .frame(width: columnWidth, height: height)
            .background(Color.black)
            .clipShape(shape)
            .padding(.horizontal, inset).padding(.top, inset * 0.6)
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
            .clipShape(shape)
            .padding(.horizontal, inset).padding(.top, inset * 0.6)
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

    /// Stills by episode `sort` from the discover list (web merges these into
    /// the playable episodes because the local DB may lack thumbnails).
    private(set) var episodeImages: [Double: URL] = [:]

    func load() async {
        detail = detail.reloading
        async let episodes = try? client.discoverEpisodes(bangumiID: bangumiID)
        detail = await detail.reloaded { try await client.animeDetail(bangumiID: bangumiID) }
        let stills = (await episodes ?? []).compactMap { episode in episode.image.map { (episode.sort, $0) } }
        episodeImages = Dictionary(stills, uniquingKeysWith: { first, _ in first })
    }
}

/// Title, year · episodes, and the page actions (rate / collect / details).
/// Theater and pop-out live on the OSC only — one home per control.
struct WatchTitleBar: View {
    let store: WatchStore
    let controller: PlayerController

    @Environment(Router.self) private var router
    @State private var scorePrompt = false
    @State private var scoreText = ""

    var body: some View {
        let detail = store.detail.value
        let scored = controller.playable?.userScore != nil
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(detail?.title ?? controller.request?.title ?? "")
                        .font(.system(size: 18, weight: .semibold)).lineLimit(1)
                    if let episode = controller.episode {
                        Text("第 \(episode.number) 集\(episode.displayTitle.map { " · \($0)" } ?? "")")
                            .font(.system(size: 13)).foregroundStyle(Theme.Text.secondary).lineLimit(1)
                    }
                }
                Spacer(minLength: 12)
                // Page actions as real buttons, top-aligned with the title
                // (the plain text links sat on the meta line, far from it).
                HStack(spacing: 8) {
                    Button {
                        scoreText = controller.playable?.userScore.map(String.init) ?? ""
                        scorePrompt = true
                    } label: {
                        Label(
                            controller.playable?.userScore.map { "\($0)" } ?? String(localized: "評分"),
                            systemImage: scored ? "star.fill" : "star"
                        )
                        .foregroundStyle(scored ? Color(hex: 0xFBBF24) : Theme.Text.primary)
                    }
                    .glassButtonStyle()
                    if controller.isInCollection {
                        Button {
                            Task { await controller.toggleCollection() }
                        } label: {
                            Label("已收藏", systemImage: "bookmark.fill")
                        }
                        .glassProminentButtonStyle()
                    } else {
                        Button {
                            Task { await controller.toggleCollection() }
                        } label: {
                            Label("加入收藏", systemImage: "bookmark")
                        }
                        .glassButtonStyle()
                    }
                    Button {
                        router.openAnime(store.bangumiID)
                    } label: {
                        Label("作品頁", systemImage: "info.circle")
                    }
                    .glassButtonStyle()
                    .help("開啟作品頁")
                }
                .controlSize(.small)
                .labelStyle(.titleAndIcon)
            }
            Text(meta(detail)).font(.system(size: 12)).foregroundStyle(Theme.Text.tertiary)
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
        if let count = detail?.summary.episodeCount, count > 0 { parts.append(String(localized: "\(count) 集")) }
        if controller.state.status.isActive { parts.append(controller.state.stage.localizedLabel) }
        return parts.joined(separator: " · ")
    }
}

/// Synopsis + genres, the web's `AnimeInfoSection`.
struct WatchInfoSection: View {
    let detail: AnimeDetail
    @Environment(Router.self) private var router
    @State private var expanded = false

    /// Four lines of 12.5 pt text hold roughly this much; anything longer
    /// gets the explicit 更多 / 收合 toggle (the ellipsis alone is not an
    /// affordance).
    private static let foldThreshold = 200

    var body: some View {
        // Web `AnimeInfoSection`: a quiet card — cover on the left, synopsis
        // and genre pills on the right — instead of text floating in space.
        HStack(alignment: .top, spacing: 12) {
            if let cover = detail.coverImage {
                RemoteImage(url: cover, maxPixel: 240) { Rectangle().fill(Theme.ink(0.08)) }
                    .frame(width: 56, height: 80)
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            }
            VStack(alignment: .leading, spacing: 8) {
                if let synopsis = detail.synopsis?.strippingHTML ?? detail.summary.description?.strippingHTML {
                    Text(synopsis)
                        .font(.system(size: 12.5))
                        .foregroundStyle(Theme.Text.secondary)
                        .lineSpacing(3)
                        .lineLimit(expanded ? nil : 4)
                        .onTapGesture { expanded.toggle() }
                    if synopsis.count > Self.foldThreshold {
                        Button(expanded ? String(localized: "收合") : String(localized: "更多")) {
                            withAnimation(.snappy(duration: 0.2)) { expanded.toggle() }
                        }
                        .buttonStyle(.plain)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Theme.accent)
                    }
                }
                FlowLayout(spacing: 6) {
                    if let season = Formatters.season(from: detail.summary.airDate) { Chip(text: season, small: true) }
                    ForEach(detail.summary.genres.prefix(6), id: \.self) { genre in
                        Button {
                            router.openSearch(SearchPrefill(genres: [genre]))
                        } label: {
                            Chip(text: Genre.label(for: genre), small: true)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(12)
        .frame(maxWidth: 760, alignment: .leading)
        .background(Theme.ink(0.03), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}
