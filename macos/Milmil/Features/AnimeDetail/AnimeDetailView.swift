import MilmilAPI
import SwiftUI

/// Cinematic header + Resume-with-context, then episodes and related work.
struct AnimeDetailView: View {
    @Environment(ServerSession.self) private var session
    @Environment(Router.self) private var router
    @Environment(BackdropStore.self) private var backdrop
    @Environment(\.openURL) private var openURL
    @Environment(\.openWindow) private var openWindow
    @Environment(PlayerCoordinator.self) private var playerCoordinator
    @Environment(TrailerCoordinator.self) private var trailers
    let bangumiID: Int

    @State private var store: AnimeDetailStore?
    @State private var episodeFilter: EpisodeFilter = .all
    /// Content-column width; gates the floating resume card like the web's
    /// `lg:` breakpoint.
    @State private var pageWidth: CGFloat = 0
    /// Drives the staged entrance; flipped once the detail lands so the page
    /// assembles instead of replacing the skeleton in one frame.
    @State private var revealed = false
    @ObserveInjection private var inject

    var body: some View {
        Group {
            if let store { content(store) } else { Color.clear }
        }
        .navigationTitle(store?.detail.value?.title ?? "")
        .task(id: bangumiID) {
            let store = AnimeDetailStore(bangumiID: bangumiID, client: session.client, cacheScope: session.profile.id.uuidString)
            self.store = store
            await store.load()
        }
        .onChange(of: store?.detail.value?.id) {
            if let detail = store?.detail.value {
                backdrop.set(detail.bannerImage ?? detail.coverImage, seed: detail.title, style: .hero, owner: "detail-\(bangumiID)")
            }
        }
    }

    private func content(_ store: AnimeDetailStore) -> some View {
        ScrollViewReader { proxy in
            scrollContent(store, proxy)
        }
    }

    private func scrollContent(_ store: AnimeDetailStore, _ proxy: ScrollViewProxy) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                switch store.detail {
                case let .loaded(detail):
                    header(detail, store).appearStep(0, active: revealed)
                    maintenanceCards(store).appearStep(1, active: revealed)
                    HStack(alignment: .top, spacing: 28) {
                        episodesSection(store, proxy)
                        sideColumn(detail, store)
                    }
                    .appearStep(2, active: revealed)
                    charactersSection(detail).appearStep(3, active: revealed)
                    franchiseSection(detail, store).appearStep(4, active: revealed)
                    recommendationsSection(detail, store).appearStep(4, active: revealed)
                    reviewsSection(detail).appearStep(4, active: revealed)
                    commentsSection(store).appearStep(4, active: revealed)
                case let .failed(message):
                    ErrorBanner(message: message) { Task { await store.loadDetail() } }.padding(.top, 60)
                default:
                    HeroSkeleton().padding(.top, 60)
                    EpisodeGridSkeleton(columns: episodeColumns)
                }
            }
            .padding(.horizontal, 40)
            .padding(.top, 24)
            .padding(.bottom, 40)
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { pageWidth = $0 }
        // The skeleton cross-fades out as the real header lifts in; without
        // this the two swap in a single frame and the page looks like it
        // jumped rather than loaded.
        .animation(.easeOut(duration: 0.25), value: store.detail.value?.id)
        .task(id: store.detail.value?.id) {
            guard store.detail.value != nil else { return }
            revealed = true
        }
        // Web BannerImage: past ~100px the banner snaps to opacity 0.05 with
        // a 1s fade — a decisive fade-out, not a gradual darken.
        .onScrollGeometryChange(for: Double.self) { geometry in
            geometry.contentOffset.y > 120 ? 0.95 : 0
        } action: { _, dim in
            backdrop.setDim(dim, owner: "detail-\(bangumiID)")
        }
        .alert("操作失敗", isPresented: Binding(get: { store.actionError != nil }, set: { if !$0 { store.clearActionError() } })) {
            Button("好") {}
        } message: {
            Text(store.actionError ?? "")
        }
        .alert("訂閱已更新", isPresented: Binding(get: { store.autoRuleNotice != nil }, set: { if !$0 { store.clearAutoRuleNotice() } })) {
            Button("好") {}
        } message: {
            Text(store.autoRuleNotice ?? "")
        }
    }

    // MARK: Header

    private func header(_ detail: AnimeDetail, _ store: AnimeDetailStore) -> some View {
        HStack(alignment: .top, spacing: 28) {
            PosterCard(title: detail.title, cover: detail.coverImage, width: 200)
                .allowsHitTesting(false)
            VStack(alignment: .leading, spacing: 10) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(detail.title).font(.system(size: 32, weight: .heavy)).tracking(-0.5).lineLimit(2)
                    if let original = detail.summary.titleOriginal, original != detail.title {
                        Text(original).font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.Text.secondary)
                    }
                }
                metaRow(detail, store)
                tagRow(detail)
                seasonTabs(store)
                if !store.capabilityBadges.isEmpty {
                    HStack(spacing: 6) {
                        ForEach(store.capabilityBadges, id: \.self) { Chip(text: $0, small: true, onArtwork: true).opacity(0.85) }
                        if session.profile.baseURL.host() == "127.0.0.1" { Chip(text: String(localized: "本機"), small: true, onArtwork: true).opacity(0.85) }
                    }
                }
                actionRow(store)
                if let synopsis = detail.synopsis?.strippingHTML ?? detail.summary.description?.strippingHTML {
                    Text(synopsis)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Theme.ink(0.7))
                        .lineSpacing(5)
                        .lineLimit(6)
                        // Web caps the whole hero block at 700 with the poster
                        // inside it, so the banner art keeps the right half.
                        .frame(maxWidth: 500, alignment: .leading)
                        .padding(.top, 4)
                }
            }
            .padding(.top, 6)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 60)
        // Web hero: round glassy refresh + external-site buttons floating at
        // the banner's top-right corner.
        .overlay(alignment: .topTrailing) { externalLinkRow(store) }
        // Web hero: the floating「繼續觀看」card at the banner's bottom-right,
        // hidden on narrow windows exactly like the web's `hidden lg:block`.
        .overlay(alignment: .bottomTrailing) {
            if pageWidth >= 1150, case let .resume(episode, _) = store.primaryAction {
                ResumeCard(title: detail.title, cover: detail.coverImage, episode: episode) {
                    startPlayback(episode, store)
                }
            }
        }
    }

    /// The web's top-right hero circles: refresh metadata, then one link per
    /// known tracker id.
    private func externalLinkRow(_ store: AnimeDetailStore) -> some View {
        HStack(spacing: 8) {
            HeroCircleButton(help: String(localized: "重新整理中繼資料")) {
                Task { await store.refreshMetadata() }
            } label: {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 12, weight: .semibold))
            }
            .disabled(store.detail.isLoading)
            HeroCircleButton(help: "Bangumi") {
                openURL(URL(string: "https://bgm.tv/subject/\(bangumiID)")!)
            } label: {
                Image(systemName: "tv").font(.system(size: 11, weight: .semibold))
            }
            if let anilistID = store.detail.value?.summary.anilistID, anilistID > 0 {
                HeroCircleButton(help: "AniList") {
                    openURL(URL(string: "https://anilist.co/anime/\(anilistID)")!)
                } label: {
                    Text(verbatim: "AL").font(.system(size: 10, weight: .bold))
                }
            }
            if let malID = store.playable.value??.malID, malID > 0 {
                HeroCircleButton(help: "MyAnimeList") {
                    openURL(URL(string: "https://myanimelist.net/anime/\(malID)")!)
                } label: {
                    Text(verbatim: "MAL").font(.system(size: 9, weight: .bold))
                }
            }
            if let tmdbID = store.playable.value??.tmdbID, tmdbID > 0 {
                HeroCircleButton(help: "TMDB") {
                    openURL(URL(string: "https://www.themoviedb.org/tv/\(tmdbID)")!)
                } label: {
                    Text(verbatim: "TMDB").font(.system(size: 8, weight: .bold))
                }
            }
            if let anidbID = store.playable.value??.anidbID, anidbID > 0 {
                HeroCircleButton(help: "AniDB") {
                    openURL(URL(string: "https://anidb.net/anime/\(anidbID)")!)
                } label: {
                    Text(verbatim: "AniDB").font(.system(size: 8, weight: .bold))
                }
            }
        }
        .padding(.top, 12)
    }

    private func metaRow(_ detail: AnimeDetail, _ store: AnimeDetailStore) -> some View {
        HStack(spacing: 10) {
            if detail.summary.score > 0 {
                Label(detail.summary.score.formatted(.number.precision(.fractionLength(1))), systemImage: "heart.fill")
                    .font(.system(size: 15, weight: .bold)).foregroundStyle(Theme.accent)
            }
            if let type = detail.summary.mediaType { PillBadge(text: type, tint: Theme.ink(0.1), foreground: Theme.ink(0.9)) }
            if detail.summary.episodeCount > 0 { meta(String(localized: "\(detail.summary.episodeCount) 集")) }
            if let date = detail.summary.airDate { meta(String(date.prefix(7))) }
            if detail.rating.total > 0 { Text("\(detail.rating.total) 評分").font(.system(size: 11)).foregroundStyle(Theme.ink(0.52)) }
            if isUpcoming(detail.summary.airDate) {
                statusDot(String(localized: "尚未播出"), color: Color(hex: 0xFBBF24), text: Color(hex: 0xFCD34D), tint: Color(hex: 0xF59E0B))
            } else if detail.summary.nextEpisode != nil {
                statusDot(String(localized: "放送中"), color: Color(hex: 0xFBBF24), text: Color(hex: 0xFCD34D), tint: Color(hex: 0xF59E0B))
            }
            if store.hasSubscription {
                statusDot(String(localized: "已訂閱"), color: Color(hex: 0x4ADE80), text: Color(hex: 0x4ADE80), tint: Color(hex: 0x22C55E))
            }
        }
    }

    private func statusDot(_ label: String, color: Color, text: Color, tint: Color) -> some View {
        HStack(spacing: 4) {
            Circle().fill(color).frame(width: 6, height: 6)
            Text(label)
        }
        .font(.system(size: 10, weight: .semibold))
        .foregroundStyle(text)
        .padding(.horizontal, 7).padding(.vertical, 3)
        .background(tint.opacity(0.2), in: Capsule())
    }

    /// S1/S2/… pills jumping between seasons of the same franchise. A split
    /// season is one capsule — "S1 | 1 | 2" — with a tab per cour.
    @ViewBuilder
    private func seasonTabs(_ store: AnimeDetailStore) -> some View {
        let groups = store.seasonGroups
        if groups.count > 1 {
            HStack(spacing: 6) {
                ForEach(groups) { group in
                    if group.parts.count == 1, let tab = group.parts.first {
                        seasonButton(tab) { Chip(text: tab.label, isOn: tab.isCurrent, small: true, onArtwork: true) }
                    } else {
                        splitSeasonPill(group)
                    }
                }
            }
        }
    }

    private func seasonButton(_ tab: AnimeDetailStore.SeasonTab, @ViewBuilder label: () -> some View) -> some View {
        Button {
            guard !tab.isCurrent, tab.bangumiID > 0 else { return }
            router.openAnime(tab.bangumiID)
        } label: {
            label().opacity(tab.bangumiID > 0 || tab.isCurrent ? 1 : 0.4)
        }
        .buttonStyle(.plain)
        .disabled(tab.bangumiID <= 0)
        .help(tab.title)
    }

    private func splitSeasonPill(_ group: AnimeDetailStore.SeasonGroup) -> some View {
        let onColor = Color(hex: 0xD6CCFF)
        return HStack(spacing: 0) {
            Text(verbatim: "S\(group.season)")
                .padding(.leading, 8)
                .padding(.trailing, 6)
                .padding(.vertical, 3)
                .foregroundStyle(group.isCurrent ? onColor : Theme.Text.secondary)
            ForEach(group.parts) { tab in
                seasonButton(tab) {
                    Text(verbatim: tab.label)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(tab.isCurrent ? Theme.accent.opacity(0.3) : .clear)
                        .foregroundStyle(tab.isCurrent ? onColor : Theme.Text.secondary)
                        .overlay(alignment: .leading) { Rectangle().fill(Theme.ink(0.12)).frame(width: 1) }
                }
            }
        }
        .font(.system(size: 11, weight: .medium))
        .background(group.isCurrent ? Theme.accent.opacity(0.22) : Theme.ink(0.14), in: Capsule())
        .background(Theme.background.opacity(0.55), in: Capsule())
        .clipShape(Capsule())
    }

    private func meta(_ text: String) -> some View {
        Text(text).font(.system(size: 12, weight: .medium)).foregroundStyle(Theme.ink(0.68))
    }

    private func tagRow(_ detail: AnimeDetail) -> some View {
        FlowLayout(spacing: 6) {
            if let season = Formatters.season(from: detail.summary.airDate) { Chip(text: season, small: true, onArtwork: true) }
            ForEach(detail.summary.genres.prefix(5), id: \.self) { genre in
                Button {
                    router.openSearch(SearchPrefill(genres: [genre]))
                } label: {
                    Chip(text: Genre.label(for: genre), small: true, onArtwork: true)
                }
                .buttonStyle(.plain)
            }
            ForEach(detail.tags.prefix(4), id: \.self) { tag in
                Button { router.openSearch(SearchPrefill(tags: [tag])) } label: { Chip(text: tag, small: true, onArtwork: true).opacity(0.9) }
                    .buttonStyle(.plain)
            }
        }
    }

    private func actionRow(_ store: AnimeDetailStore) -> some View {
        HStack(spacing: 8) {
            let action = store.primaryAction
            Button {
                startPlayback(action.episode, store)
            } label: {
                Label(action.title, systemImage: "play.fill")
            }
            .buttonStyle(HeroButtonStyle(primary: true))
            .disabled(action.episode == nil)

            Menu {
                ForEach(WatchStatus.allCases, id: \.self) { status in
                    Button(status == .none ? String(localized: "移出收藏") : status.label, systemImage: status.symbol) {
                        Task { await store.setWatchStatus(status) }
                    }
                }
            } label: {
                let collected = store.watchStatus.isInCollection
                Label(collected ? store.watchStatus.label : String(localized: "加入收藏"), systemImage: collected ? "bookmark.fill" : "bookmark")
            }
            .menuStyle(.button)
            .buttonStyle(HeroButtonStyle(primary: false))

            Menu {
                ForEach((1...10).reversed(), id: \.self) { score in
                    Button("\(score)") { Task { await store.setScore(score) } }
                }
                if store.userScore != nil {
                    Divider()
                    Button("清除評分") { Task { await store.setScore(nil) } }
                }
            } label: {
                Label(store.userScore.map(String.init) ?? String(localized: "評分"), systemImage: "star.fill")
            }
            .menuStyle(.button)
            .buttonStyle(HeroButtonStyle(primary: false))

            if let summary = store.detail.value?.summary {
                Button { router.findTorrents(for: summary) } label: { Label("找種子", systemImage: "magnet") }
                    .buttonStyle(HeroButtonStyle(primary: false))
                    .help("在各站搜尋這部作品的種子，或建立自動下載訂閱")
            }

            if let detail = store.detail.value {
                Menu {
                    // The web page for this series on the same server.
                    ShareLink(item: session.profile.baseURL.appending(path: "anime/\(bangumiID)"), subject: Text(detail.title)) {
                        Label("分享作品頁", systemImage: "square.and.arrow.up")
                    }
                    if let trailer = store.detail.value?.trailerURL {
                        Button("預告片", systemImage: "play.rectangle") {
                            let detail = store.detail.value
                            playTrailer(trailer, title: detail?.title ?? "", artwork: detail?.bannerImage ?? detail?.coverImage)
                        }
                    }
                    if store.isInLibrary {
                        Button("保留整套喺呢部 Mac", systemImage: "arrow.down.circle") {
                            Task { await OfflineStore.shared.keep(bangumiID: bangumiID, title: detail.title) }
                        }
                        if OfflineStore.shared.hasCopies(bangumiID: bangumiID) {
                            Button("移除呢套嘅本機副本", systemImage: "arrow.down.circle.dotted") {
                                OfflineStore.shared.removeSeries(bangumiID: bangumiID)
                            }
                        }
                    }
                    if (store.playable.value ?? nil) != nil {
                        Button(
                            store.syncDisabled ? String(localized: "恢復追蹤同步") : String(localized: "排除追蹤同步"),
                            systemImage: store.syncDisabled ? "arrow.triangle.2.circlepath" : "arrow.triangle.2.circlepath.circle"
                        ) { Task { await store.toggleSyncDisabled() } }
                    }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .menuStyle(.button)
                .buttonStyle(HeroButtonStyle(primary: false))
            }
        }
        .padding(.top, 4)
    }

    // MARK: Episodes

    /// Heading + segmented filter, then the shared series map (legend, locate,
    /// one cell per episode) the player inspector also shows, then the grid.
    private func episodesSection(_ store: AnimeDetailStore, _ proxy: ScrollViewProxy) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            let currentID = store.primaryAction.episode?.id
            let shown = filteredEpisodes(store)
            HStack {
                Text("集數").font(.system(size: 20, weight: .bold))
                if store.episodes.isEmpty, !store.discoverEpisodes.isEmpty {
                    Text("\(store.discoverEpisodes.count) 集").font(.system(size: 13)).foregroundStyle(Theme.Text.tertiary)
                }
                Spacer()
                if !store.episodes.isEmpty {
                    Segmented(options: EpisodeFilter.allCases, selection: $episodeFilter) { $0.label }
                }
            }
            if !store.episodes.isEmpty {
                SeriesMap(
                    episodes: store.episodes, currentID: currentID, filter: $episodeFilter,
                    canLocate: shown.contains { $0.id == currentID }, showsFilter: false
                ) { id in
                    withAnimation(.easeInOut(duration: 0.3)) { proxy.scrollTo(id, anchor: .center) }
                }
            }
            if store.episodes.isEmpty {
                if store.discoverEpisodes.isEmpty, store.playable.isLoading || store.discoverLoading {
                    EpisodeGridSkeleton(columns: episodeColumns)
                } else if store.discoverEpisodes.isEmpty {
                    EmptyState(symbol: "film", title: String(localized: "還沒有集數資料"), message: String(localized: "這部作品尚未加入媒體庫，也沒有 Bangumi 的集數資訊。"))
                } else {
                    LazyVGrid(columns: episodeColumns, alignment: .leading, spacing: 10) {
                        ForEach(store.discoverEpisodes) { episode in
                            DiscoverEpisodeRow(episode: episode)
                        }
                    }
                }
            } else {
                let extras = store.discoverBySort
                LazyVGrid(columns: episodeColumns, alignment: .leading, spacing: 10) {
                    ForEach(shown) { episode in
                        EpisodeRow(
                            episode: episode,
                            still: extras[episode.sort]?.image,
                            synopsis: extras[episode.sort]?.synopsis,
                            isCurrent: episode.id == currentID,
                            offline: episode.mediaFile.flatMap { OfflineStore.shared.entry(fileID: $0.id) },
                            serverOffline: session.offlineSince != nil,
                            keepOffline: {
                                let title = store.detail.value?.title ?? ""
                                Task { await OfflineStore.shared.keep(bangumiID: bangumiID, title: title, episodeIDs: [episode.episodeID]) }
                            },
                            removeOffline: { if let file = episode.mediaFile { OfflineStore.shared.remove(fileID: file.id) } },
                            play: { startPlayback(episode, store) },
                            restart: { startPlayback(episode, store, fromStart: true) },
                            markWatched: { watched in Task { await store.markEpisode(episode, watched: watched) } },
                            findTorrents: { if let summary = store.detail.value?.summary { router.findTorrents(for: summary) } }
                        )
                        .id(episode.id)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// The web's two-up rows: wide cards that wrap to one column when narrow.
    private var episodeColumns: [GridItem] {
        [GridItem(.adaptive(minimum: 430, maximum: 720), spacing: 20)]
    }

    private func filteredEpisodes(_ store: AnimeDetailStore) -> [PlayableEpisode] {
        store.episodes.filter(episodeFilter.includes)
    }

    private func startPlayback(_ episode: PlayableEpisode?, _ store: AnimeDetailStore, fromStart: Bool = false) {
        guard let episode, episode.hasFile, let detail = store.detail.value else { return }
        playerCoordinator.play(PlaybackRequest(
            bangumiID: bangumiID, episodeID: episode.episodeID, title: detail.title, coverImage: detail.coverImage, fromStart: fromStart
        ))
        router.openWatch(bangumiID: bangumiID, episodeID: episode.episodeID)
    }

    /// In-app trailer window when yt-dlp is installed, else the browser.
    private func playTrailer(_ url: URL, title: String, artwork: URL? = nil) {
        if trailers.canPlayInApp {
            let trailerLabel = String(localized: "預告片")
            trailers.play(url: url, title: title.isEmpty ? trailerLabel : title, caption: title.isEmpty ? nil : trailerLabel, artwork: artwork)
            openWindow(id: "trailer")
        } else {
            openURL(url)
        }
    }

    // MARK: Side column

    @ViewBuilder
    private func sideColumn(_ detail: AnimeDetail, _ store: AnimeDetailStore) -> some View {
        if let trailer = detail.trailerURL {
            TrailerCard(detail: detail) {
                playTrailer(trailer, title: detail.title, artwork: detail.bannerImage ?? detail.coverImage)
            }
        }
    }

    // MARK: Maintenance cards

    /// Missing-episode and duplicate-file cards; both self-hide when clean.
    @ViewBuilder
    private func maintenanceCards(_ store: AnimeDetailStore) -> some View {
        if let report = store.completeness, !report.missing.isEmpty || !report.airingPending.isEmpty {
            MissingEpisodesCard(report: report) {
                if let summary = store.detail.value?.summary { router.findTorrents(for: summary) }
            } createRule: {
                Task { await store.createAutoRuleForMissing() }
            }
        }
        if !store.duplicates.isEmpty {
            DuplicatesCard(sets: store.duplicates) { episodeID, fileID in
                Task { await store.setPreferredFile(episodeID: episodeID, mediaFileID: fileID) }
            } deleteFile: { fileID in
                Task { await store.deleteDuplicateFile(id: fileID) }
            }
        }
    }

    // MARK: Full-width sections

    /// Character/CV grid, mirroring the web's five-across cards.
    @ViewBuilder
    private func charactersSection(_ detail: AnimeDetail) -> some View {
        if !detail.characters.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                SectionHeader(title: String(localized: "角色 / 聲優"))
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 210), spacing: 12)], alignment: .leading, spacing: 12) {
                    ForEach(detail.characters) { entry in
                        CharacterCard(entry: entry)
                    }
                }
            }
        }
    }

    /// 系列作品 — franchise side stories, falling back to raw relations.
    @ViewBuilder
    private func franchiseSection(_ detail: AnimeDetail, _ store: AnimeDetailStore) -> some View {
        if let sideStories = store.franchise?.sideStories, !sideStories.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                SectionHeader(title: String(localized: "系列作品"))
                Shelf {
                    ForEach(sideStories) { entry in
                        PosterCard(
                            title: entry.title,
                            cover: entry.coverImage,
                            score: entry.score > 0 ? entry.score : nil,
                            subtitle: entry.mediaType ?? entry.relationType.map(Self.relationLabel),
                            width: 130
                        ) {
                            if entry.bangumiID > 0 { router.openAnime(entry.bangumiID) }
                        }
                        .opacity(entry.bangumiID > 0 ? 1 : 0.6)
                    }
                }
            }
        } else if !detail.relations.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                SectionHeader(title: String(localized: "關聯作品"))
                Shelf {
                    ForEach(detail.relations) { relation in
                        PosterCard(
                            title: relation.anime.title,
                            cover: relation.anime.coverImage,
                            subtitle: Self.relationLabel(relation.relationType),
                            width: 130
                        ) {
                            if relation.anime.bangumiID > 0 { router.openAnime(relation.anime.bangumiID) }
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func recommendationsSection(_ detail: AnimeDetail, _ store: AnimeDetailStore) -> some View {
        if !detail.recommendations.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                SectionHeader(title: String(localized: "推薦"))
                Shelf {
                    ForEach(detail.recommendations.prefix(10)) { rec in
                        PosterCard(
                            title: rec.title,
                            cover: rec.coverImage,
                            score: rec.score > 0 ? rec.score : nil,
                            badge: rec.episodeCount > 0 ? String(localized: "\(rec.episodeCount) 集") : nil,
                            width: 130
                        ) {
                            Task {
                                if let bangumiID = await store.resolveBangumiID(for: rec) { router.openAnime(bangumiID) }
                            }
                        }
                    }
                }
            }
        }
    }

    /// AniList long-form reviews; each opens in the browser.
    @ViewBuilder
    private func reviewsSection(_ detail: AnimeDetail) -> some View {
        if !detail.reviews.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                SectionHeader(title: String(localized: "評價"))
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(detail.reviews) { review in
                        Button { openURL(URL(string: "https://anilist.co/review/\(review.id)")!) } label: {
                            HStack(alignment: .top, spacing: 10) {
                                avatar(review.avatar, fallbackSeed: review.username, size: 30)
                                VStack(alignment: .leading, spacing: 3) {
                                    HStack(spacing: 8) {
                                        Text(review.username).font(.system(size: 12, weight: .semibold))
                                        Text("\(review.score)/100").font(.system(size: 11, weight: .bold)).foregroundStyle(Theme.accent)
                                    }
                                    Text(review.summary).font(.system(size: 12)).foregroundStyle(Theme.Text.secondary).lineLimit(2)
                                }
                                Spacer(minLength: 0)
                                Image(systemName: "arrow.up.right").font(.system(size: 10)).foregroundStyle(Theme.Text.muted)
                            }
                            .padding(12)
                            .background(Theme.ink(0.03), in: RoundedRectangle(cornerRadius: 10))
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .frame(maxWidth: 700, alignment: .leading)
            }
        }
    }

    /// Bangumi 吐槽 in the web's two-column grid.
    @ViewBuilder
    private func commentsSection(_ store: AnimeDetailStore) -> some View {
        if !store.comments.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                SectionHeader(title: String(localized: "評論"), count: "\(store.comments.count)")
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 360), spacing: 12)], alignment: .leading, spacing: 12) {
                    ForEach(store.comments) { comment in
                        HStack(alignment: .top, spacing: 10) {
                            avatar(comment.avatar, fallbackSeed: comment.username, size: 26)
                            VStack(alignment: .leading, spacing: 3) {
                                HStack(spacing: 6) {
                                    Text(comment.nickname.isEmpty ? comment.username : comment.nickname)
                                        .font(.system(size: 11, weight: .semibold)).lineLimit(1)
                                    if comment.rate > 0 {
                                        Text("★ \(comment.rate)").font(.system(size: 10, weight: .bold)).foregroundStyle(Color(hex: 0xFBBF24))
                                    }
                                }
                                Text(comment.comment).font(.system(size: 12)).foregroundStyle(Theme.Text.secondary).lineLimit(3)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(12)
                        .background(Theme.ink(0.03), in: RoundedRectangle(cornerRadius: 10))
                    }
                }
            }
        }
    }

    private func avatar(_ url: URL?, fallbackSeed: String, size: CGFloat) -> some View {
        RemoteImage(url: url, maxPixel: 80) { Circle().fill(Theme.animeGradient(fallbackSeed)) }
            .frame(width: size, height: size)
            .clipShape(Circle())
    }

    private static func relationLabel(_ raw: String) -> String {
        switch raw.uppercased() {
        case "SEQUEL": String(localized: "續篇")
        case "PREQUEL": String(localized: "前傳")
        case "SIDE_STORY": String(localized: "外傳")
        case "PARENT": String(localized: "本篇")
        case "ADAPTATION", "SOURCE": String(localized: "原作")
        case "SUMMARY": String(localized: "總集篇")
        case "ALTERNATIVE": String(localized: "另一版本")
        case "SPIN_OFF": String(localized: "衍生")
        case "CHARACTER": String(localized: "角色客串")
        default: raw.capitalized
        }
    }
}

/// One of the web hero's top-right circles: dark glass, muted glyph,
/// brightening on hover. Sits over the banner so the colors stay literal.
private struct HeroCircleButton<Content: View>: View {
    let help: String
    var action: () -> Void
    @ViewBuilder var label: () -> Content

    @State private var hovered = false

    var body: some View {
        Button(action: action) {
            label()
                .foregroundStyle(.white.opacity(hovered ? 1 : 0.6))
                .frame(width: 30, height: 30)
                .background(.black.opacity(hovered ? 0.6 : 0.4), in: Circle())
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .onHover { hovered = $0 }
        .animation(.easeOut(duration: 0.15), value: hovered)
        .help(help)
    }
}

/// The web hero's floating「繼續觀看」card: cover behind a circular progress
/// ring and play button, EP + timestamps beside it, dark glass all around.
private struct ResumeCard: View {
    let title: String
    let cover: URL?
    let episode: PlayableEpisode
    var play: () -> Void

    @State private var hovered = false

    private var fraction: Double {
        guard let progress = episode.progress, progress.durationSeconds > 0 else { return 0 }
        return Double(progress.positionSeconds) / Double(progress.durationSeconds)
    }

    var body: some View {
        Button(action: play) {
            HStack(spacing: 16) {
                ZStack {
                    RemoteImage(url: cover, maxPixel: 300) { Rectangle().fill(Theme.animeGradient(title)) }
                    Color.black.opacity(hovered ? 0.15 : 0.25)
                    progressRing
                }
                .frame(width: 86, height: 115)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

                VStack(alignment: .leading, spacing: 5) {
                    Text(title)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .frame(maxWidth: 190, alignment: .leading)
                    if let progress = episode.progress {
                        let clock = "\(Formatters.clock(Double(progress.positionSeconds))) / \(Formatters.clock(Double(progress.durationSeconds)))"
                        Text(verbatim: "EP \(episode.number) · \(clock)")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(.white.opacity(0.45))
                        Text(Formatters.remaining(progress.remainingSeconds))
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(.white.opacity(0.3))
                            .padding(.top, 2)
                    } else {
                        Text(verbatim: "EP \(episode.number)")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(.white.opacity(0.45))
                    }
                }
                .padding(.trailing, 8)
            }
            .padding(8)
            .background {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(.black.opacity(0.55)))
            }
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(.white.opacity(hovered ? 0.15 : 0.08)))
            .shadow(color: .black.opacity(0.4), radius: 16, y: 8)
            .scaleEffect(hovered ? 1.02 : 1)
            .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .onHover { hovered = $0 }
        .animation(.easeOut(duration: 0.18), value: hovered)
        .accessibilityLabel(String(localized: "繼續播放第 \(episode.number) 集"))
    }

    /// Accent progress ring around a white play puck, like the web's SVG ring.
    private var progressRing: some View {
        ZStack {
            Circle()
                .stroke(.white.opacity(0.12), lineWidth: 2.5)
            Circle()
                .trim(from: 0, to: fraction)
                .stroke(Theme.accent, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .shadow(color: Theme.accent.opacity(0.4), radius: 4)
            Image(systemName: "play.fill")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(.black)
                .frame(width: 34, height: 34)
                .background(.white.opacity(0.9), in: Circle())
                .scaleEffect(hovered ? 1.1 : 1)
        }
        .frame(width: 64, height: 64)
    }
}

/// Web's CharacterCard: character portrait with the CV tucked behind it.
private struct CharacterCard: View {
    let entry: AnimeCharacter

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .bottom, spacing: 0) {
                RemoteImage(url: entry.character.image, maxPixel: 160) { Rectangle().fill(Theme.animeGradient(entry.character.name)) }
                    .frame(width: 48, height: 56)
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                if let actor = entry.voiceActor {
                    RemoteImage(url: actor.image, maxPixel: 120) { Rectangle().fill(Theme.animeGradient(actor.name)) }
                        .frame(width: 40, height: 48)
                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(.black.opacity(0.4)))
                        .offset(x: -14)
                }
                Spacer(minLength: 0)
                if entry.role == "MAIN" {
                    PillBadge(text: "MAIN", tint: Theme.accent.opacity(0.15), foreground: Theme.accent)
                }
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.character.name).font(.system(size: 12, weight: .semibold)).lineLimit(1)
                if let actor = entry.voiceActor {
                    Text("CV \(actor.name)").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary).lineLimit(1)
                }
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.ink(0.03), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Theme.ink(0.05)))
    }
}

/// Placeholder rows in the episode grid's own geometry (192×108 still, number,
/// title, two synopsis lines) so the page keeps its shape while the list loads.
private struct EpisodeGridSkeleton: View {
    let columns: [GridItem]

    var body: some View {
        LazyVGrid(columns: columns, alignment: .leading, spacing: 10) {
            ForEach(0..<6, id: \.self) { _ in
                HStack(alignment: .top, spacing: 14) {
                    SkeletonBox().frame(width: 192, height: 108)
                    VStack(alignment: .leading, spacing: 8) {
                        SkeletonText(width: 64, height: 12)
                        SkeletonText(width: 220, height: 15)
                        SkeletonText(height: 12, maxWidth: .infinity)
                        SkeletonText(width: 180, height: 12)
                    }
                    .padding(.top, 4)
                }
                .padding(6)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .shimmering()
        .accessibilityLabel("載入中")
    }
}

/// Which episodes are missing from disk, plus a one-click auto-download rule.
private struct MissingEpisodesCard: View {
    let report: CompletenessReport
    var findTorrents: () -> Void
    var createRule: () -> Void

    @State private var confirmRule = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("集數狀態", systemImage: "exclamationmark.circle")
                .font(.system(size: 13, weight: .bold))
            if !report.missing.isEmpty {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("缺少：\(episodeRanges(report.missing.sorted()))")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Text.secondary)
                    Button("搜尋種子") { findTorrents() }
                        .buttonStyle(.plain)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Theme.accent)
                    Button("自動下載缺集") { confirmRule = true }
                        .buttonStyle(.plain)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Theme.accent)
                }
            }
            if !report.airingPending.isEmpty {
                Text("未放送：\(episodeRanges(report.airingPending.sorted()))")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.Text.tertiary)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.ink(0.03), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Theme.ink(0.06)))
        .confirmationDialog("為 \(report.missing.count) 個缺集建立自動下載規則？", isPresented: $confirmRule) {
            Button("建立規則") { createRule() }
            Button("取消", role: .cancel) {}
        }
    }
}

/// "1, 2, 5-8" for [1, 2, 5, 6, 7, 8].
private func episodeRanges(_ numbers: [Double]) -> String {
    var parts: [String] = []
    var index = 0
    while index < numbers.count {
        var end = index
        while end + 1 < numbers.count, numbers[end + 1] == numbers[end] + 1 { end += 1 }
        let first = episodeNumber(numbers[index])
        parts.append(index == end ? first : "\(first)-\(episodeNumber(numbers[end]))")
        index = end + 1
    }
    return parts.joined(separator: ", ")
}

/// Episodes with more than one file: pick the preferred copy or delete extras.
private struct DuplicatesCard: View {
    let sets: [DupSet]
    var setPreferred: (_ episodeID: String, _ fileID: String) -> Void
    var deleteFile: (_ fileID: String) -> Void

    @State private var pendingDelete: DupFileInfo?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("重複檔案", systemImage: "doc.on.doc")
                .font(.system(size: 13, weight: .bold))
            ForEach(sets) { set in
                VStack(alignment: .leading, spacing: 5) {
                    Text("第 \(episodeNumber(set.episodeNumber)) 集 · \(set.files.count) 個檔案")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.Text.secondary)
                    ForEach(set.files) { file in
                        HStack(spacing: 8) {
                            if file.id == set.preferredID {
                                Image(systemName: "star.fill").font(.system(size: 10)).foregroundStyle(Color(hex: 0xFBBF24))
                            }
                            Text(file.filename)
                                .font(.system(size: 11))
                                .foregroundStyle(file.id == set.preferredID ? Theme.ink(0.9) : Theme.Text.tertiary)
                                .lineLimit(1)
                                .truncationMode(.middle)
                            Text("\(file.resolution > 0 ? "\(file.resolution)p · " : "")\(file.sizeBytes.formatted(.byteCount(style: .file)))")
                                .font(.system(size: 11))
                                .foregroundStyle(Theme.Text.muted)
                            Spacer(minLength: 0)
                            if file.id != set.preferredID {
                                Button("設為優先") { setPreferred(set.episodeID, file.id) }
                                    .buttonStyle(.plain)
                                    .font(.system(size: 11, weight: .medium))
                                    .foregroundStyle(Theme.accent)
                            }
                            Button("刪除") { pendingDelete = file }
                                .buttonStyle(.plain)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(Color(hex: 0xF87171))
                        }
                    }
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.ink(0.03), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Theme.ink(0.06)))
        .confirmationDialog(
            "永久刪除「\(pendingDelete?.filename ?? "")」？",
            isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } })
        ) {
            Button("刪除檔案", role: .destructive) {
                if let file = pendingDelete { deleteFile(file.id) }
                pendingDelete = nil
            }
            Button("取消", role: .cancel) { pendingDelete = nil }
        }
    }
}

/// The side column's trailer tile, sized like the web's embed: banner still,
/// bottom gradient with a YouTube note, gentle hover lift.
private struct TrailerCard: View {
    let detail: AnimeDetail
    var play: () -> Void

    @State private var hovered = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("預告片").font(.system(size: 20, weight: .bold))
            Button(action: play) {
                ZStack {
                    RemoteImage(url: detail.bannerImage ?? detail.coverImage, maxPixel: 800) {
                        Rectangle().fill(Theme.animeGradient(detail.title + "pv"))
                    }
                    LinearGradient(colors: [.clear, .black.opacity(0.55)], startPoint: .center, endPoint: .bottom)
                    Image(systemName: "play.fill")
                        .font(.system(size: 18, weight: .bold)).foregroundStyle(.black)
                        .frame(width: 52, height: 52)
                        .background(.white.opacity(hovered ? 1 : 0.92), in: Circle())
                        .scaleEffect(hovered ? 1.08 : 1)
                    VStack {
                        Spacer()
                        HStack(spacing: 5) {
                            Image(systemName: "play.rectangle.fill").font(.system(size: 11))
                            Text("YouTube").font(.system(size: 11, weight: .semibold))
                            Spacer()
                        }
                        .foregroundStyle(.white.opacity(0.85))
                        .padding(10)
                    }
                }
                .frame(width: 340, height: 191)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Theme.ink(0.08)))
                .scaleEffect(hovered ? 1.015 : 1)
            }
            .buttonStyle(.plain)
            .onHover { hovered = $0 }
            .animation(.easeOut(duration: 0.18), value: hovered)
        }
        .frame(width: 340)
    }
}

/// "12" / "12.5" — the bare number for "第 %@ 集" phrases.
private func episodeNumber(_ sort: Double) -> String {
    sort.rounded() == sort ? String(Int(sort)) : String(sort)
}

/// True when the episode's air date is still ahead of today.
private func isUpcoming(_ airDate: String?) -> Bool {
    guard let airDate else { return false }
    return airDate > Date.now.formatted(.iso8601.year().month().day())
}

/// "07-04" from "2026-07-04".
private func shortDate(_ airDate: String) -> String {
    airDate.count > 5 ? String(airDate.dropFirst(5)) : airDate
}

/// 無檔案 for aired episodes, 未播 for upcoming ones (Bangumi-only rows).
@ViewBuilder
private func missingTag(_ airDate: String?) -> some View {
    if isUpcoming(airDate) {
        PillBadge(
            text: String(localized: "未播"),
            tint: Color(light: 0xF59E0B, dark: 0xF59E0B, opacity: 0.15),
            foreground: Color(light: 0xB45309, dark: 0xFCD34D)
        )
    } else {
        PillBadge(text: String(localized: "無檔案"), tint: Theme.ink(0.06), foreground: Theme.Text.muted)
    }
}

/// One episode in the two-column grid, matching the web's roomy rows: 16:9
/// still, "第 N 集" + status pill + file spec line, title, two-line synopsis.
/// Stills and synopses fall back to Bangumi's row (`still` / `synopsis`)
/// because the library rarely stores them. The current episode carries an
/// accent bar; unaired ones put the countdown where the title goes instead
/// of repeating the number; aired episodes without a file offer 找種子.
struct EpisodeRow: View {
    let episode: PlayableEpisode
    var still: URL?
    var synopsis: String?
    let isCurrent: Bool
    /// The copy kept on this Mac, if any (離線到本機).
    var offline: OfflineEntry?
    /// The server is unreachable: only kept copies can play.
    var serverOffline = false
    var keepOffline: (() -> Void)?
    var removeOffline: (() -> Void)?
    var play: () -> Void
    var restart: () -> Void
    var markWatched: (Bool) -> Void
    var findTorrents: (() -> Void)?

    @State private var hovered = false

    private var completed: Bool { episode.progress?.completed ?? false }
    private var started: Bool { (episode.progress?.positionSeconds ?? 0) > 0 }
    private var standing: EpisodeStanding { EpisodeStanding(episode) }
    private var airDay: Date? { Formatters.day(from: episode.airDate) }
    private var keptLocally: Bool { offline?.state == .done }
    /// Playable right now: a file on the server we can reach, or a kept copy.
    private var playable: Bool { episode.hasFile && (!serverOffline || keptLocally) }

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            thumbnail
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 8) {
                    if standing == .unwatched, !started {
                        Circle().fill(Theme.accent).frame(width: 6, height: 6).accessibilityLabel("未看")
                    }
                    Text("第 \(episode.number) 集")
                        .font(.system(size: 11, weight: .bold)).foregroundStyle(Theme.Text.tertiary)
                        .fixedSize()
                    statusTag.fixedSize()
                    if let offline {
                        offlineTag(offline).fixedSize()
                    }
                    if let spec = episode.mediaFile.flatMap(Self.fileSpec) {
                        Text(spec).font(.system(size: 11)).foregroundStyle(Theme.Text.muted).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                    trailingActions
                }
                Text(titleLine)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(episode.hasFile ? Theme.ink() : Theme.ink(0.8))
                    .lineLimit(1)
                if let text = episode.displaySynopsis ?? synopsis {
                    Text(text)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Text.tertiary)
                        .lineSpacing(2)
                        .lineLimit(2, reservesSpace: true)
                }
            }
            .padding(.top, 2)
        }
        .padding(10)
        .background(
            isCurrent ? Theme.ink(0.05) : (hovered ? Theme.ink(0.03) : .clear),
            in: RoundedRectangle(cornerRadius: 12, style: .continuous)
        )
        .overlay(alignment: .leading) {
            if isCurrent {
                RoundedRectangle(cornerRadius: 1.5).fill(Theme.accent).frame(width: 3).padding(.vertical, 14)
            }
        }
        .contentShape(Rectangle())
        .opacity(serverOffline && episode.hasFile && !keptLocally ? 0.45 : 1)
        .onTapGesture { if playable { play() } }
        .onHover { hovered = $0 }
        .animation(.easeOut(duration: 0.15), value: hovered)
        .contextMenu {
            if episode.hasFile {
                Button("播放", systemImage: "play.fill", action: play).disabled(!playable)
                Button("從頭播放", systemImage: "gobackward", action: restart).disabled(!playable)
                Divider()
                Button(
                    completed ? String(localized: "標記為未看") : String(localized: "標記為已看"),
                    systemImage: completed ? "circle" : "checkmark.circle"
                ) { markWatched(!completed) }
                Divider()
                if offline != nil, let removeOffline {
                    Button("移除本機副本", systemImage: "arrow.down.circle.dotted", action: removeOffline)
                } else if let keepOffline {
                    Button("保留喺呢部 Mac", systemImage: "arrow.down.circle", action: keepOffline)
                }
            } else if standing == .missing, let findTorrents {
                Button("找種子", systemImage: "magnet", action: findTorrents)
            }
        }
    }

    private var thumbnail: some View {
        ZStack {
            RemoteImage(url: episode.image ?? still, maxPixel: 400) { Rectangle().fill(Theme.animeGradient(episode.episodeID)) }
                .opacity(episode.hasFile ? 1 : 0.55)
            if let progress = episode.progress, !progress.completed, progress.positionSeconds > 0 {
                ProgressStripe(fraction: progress.fraction).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
            }
            if episode.hasFile, hovered {
                Image(systemName: "play.fill").font(.system(size: 13, weight: .bold)).foregroundStyle(.black)
                    .frame(width: 34, height: 34).background(.white.opacity(0.92), in: Circle())
                    .transition(.opacity.combined(with: .scale(0.8)))
            }
        }
        .frame(width: 192, height: 108)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    /// "今天播出" / "3 天後播出" (with the title when Bangumi has it) for
    /// unaired episodes; the title, else the number, otherwise.
    private var titleLine: String {
        if standing == .unaired, let airDay {
            let when = Formatters.airsIn(airDay) ?? String(localized: "未播 · \(shortDate(episode.airDate ?? ""))")
            return episode.displayTitle.map { "\($0) · \(when)" } ?? when
        }
        return episode.displayTitle ?? String(localized: "第 \(episode.number) 集")
    }

    @ViewBuilder
    private var trailingActions: some View {
        if episode.hasFile {
            Menu {
                Button("播放", systemImage: "play.fill", action: play)
                Button("從頭播放", systemImage: "gobackward", action: restart)
                Divider()
                if completed {
                    Button("標記為未看", systemImage: "circle", action: { markWatched(false) })
                } else {
                    Button("標記為已看", systemImage: "checkmark.circle", action: { markWatched(true) })
                }
            } label: {
                Image(systemName: "ellipsis")
            }
            .menuStyle(.borderlessButton)
            .menuIndicator(.hidden)
            .frame(width: 22)
            .opacity(hovered || isCurrent ? 1 : 0)
        } else if standing == .missing, let findTorrents {
            RowIconButton(symbol: "magnet", label: String(localized: "找種子"), action: findTorrents)
                .opacity(hovered ? 1 : 0)
        }
    }

    /// 已保留 / progress / 已暫停 for the copy on this Mac.
    @ViewBuilder
    private func offlineTag(_ entry: OfflineEntry) -> some View {
        switch entry.state {
        case .done:
            PillBadge(text: String(localized: "已保留"), tint: Theme.accent.opacity(0.15), foreground: Theme.accent)
        case .downloading, .queued:
            let percent = Int(entry.fraction * 100)
            PillBadge(text: String(localized: "保留中 \(percent)%"), tint: Theme.accent.opacity(0.15), foreground: Theme.accent)
        case .paused:
            PillBadge(text: String(localized: "已暫停"), tint: Theme.ink(0.06), foreground: Theme.Text.muted)
        case .failed:
            PillBadge(text: String(localized: "保留失敗"), tint: Color(hex: 0xF87171).opacity(0.15), foreground: Color(hex: 0xF87171))
        }
    }

    @ViewBuilder
    private var statusTag: some View {
        switch standing {
        case .unaired:
            PillBadge(
                text: String(localized: "未播"),
                tint: Color(light: 0xF59E0B, dark: 0xF59E0B, opacity: 0.15),
                foreground: Color(light: 0xB45309, dark: 0xFCD34D)
            )
        case .missing:
            PillBadge(text: String(localized: "無檔案"), tint: Theme.ink(0.06), foreground: Theme.Text.muted)
        case .watched:
            PillBadge(text: String(localized: "已看完"), tint: Color(hex: 0x22C55E).opacity(0.12), foreground: Color(hex: 0x4ADE80))
        case .unwatched:
            if let progress = episode.progress, progress.positionSeconds > 0 {
                PillBadge(text: Formatters.remaining(progress.remainingSeconds), tint: Theme.accent.opacity(0.15), foreground: Theme.accent)
            }
        }
    }

    /// "1080p · HEVC · 1.2 GB" from what the scanner recorded.
    static func fileSpec(_ file: PlayableMediaFile) -> String? {
        var parts: [String] = []
        if let label = file.resolutionLabel { parts.append(label) }
        if let codec = file.videoCodec?.uppercased(), !codec.isEmpty { parts.append(codec) }
        if let bytes = file.sizeBytes, bytes > 0 { parts.append(ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file)) }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

/// Bangumi episode list for series not in the library — same row shape as
/// `EpisodeRow` so the page doesn't jump when a series gets files.
struct DiscoverEpisodeRow: View {
    let episode: DiscoverEpisode

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            RemoteImage(url: episode.image, maxPixel: 400) { Rectangle().fill(Theme.animeGradient("\(episode.id)")) }
                .frame(width: 192, height: 108)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .opacity(0.55)
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 8) {
                    Text("第 \(episodeNumber(episode.sort)) 集")
                        .font(.system(size: 11, weight: .bold)).foregroundStyle(Theme.Text.tertiary)
                        .fixedSize()
                    missingTag(episode.airDate).fixedSize()
                    Spacer(minLength: 0)
                }
                Text(episode.title.isEmpty ? (episode.titleOriginal ?? "") : episode.title)
                    .font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.ink(0.8)).lineLimit(1)
                if let synopsis = episode.synopsis {
                    Text(synopsis)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Text.tertiary)
                        .lineSpacing(2)
                        .lineLimit(2, reservesSpace: true)
                }
            }
            .padding(.top, 2)
        }
        .padding(10)
    }
}
