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
    @ObserveInjection private var inject

    enum EpisodeFilter: String, CaseIterable, Identifiable {
        case all, unwatched, available
        var id: String { rawValue }
        var label: String {
            switch self {
            case .all: String(localized: "全部")
            case .unwatched: String(localized: "未看")
            case .available: String(localized: "有檔案")
            }
        }
    }

    var body: some View {
        Group {
            if let store { content(store) } else { Color.clear }
        }
        .navigationTitle(store?.detail.value?.title ?? "")
        .task(id: bangumiID) {
            let store = AnimeDetailStore(bangumiID: bangumiID, client: session.client)
            self.store = store
            await store.load()
        }
        .onChange(of: store?.detail.value?.id) {
            if let detail = store?.detail.value {
                backdrop.set(detail.bannerImage ?? detail.coverImage, seed: detail.title, owner: "detail-\(bangumiID)")
            }
        }
        .onDisappear { backdrop.clear(owner: "detail-\(bangumiID)") }
    }

    private func content(_ store: AnimeDetailStore) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                switch store.detail {
                case let .loaded(detail):
                    header(detail, store)
                    HStack(alignment: .top, spacing: 28) {
                        episodesSection(store)
                        sideColumn(detail, store)
                    }
                case let .failed(message):
                    ErrorBanner(message: message) { Task { await store.loadDetail() } }.padding(.top, 60)
                default:
                    HeroSkeleton().padding(.top, 60)
                }
            }
            .padding(.horizontal, 40)
            .padding(.top, 24)
            .padding(.bottom, 40)
        }
        .alert("操作失敗", isPresented: Binding(get: { store.actionError != nil }, set: { if !$0 { store.clearActionError() } })) {
            Button("好") {}
        } message: {
            Text(store.actionError ?? "")
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
                metaRow(detail)
                tagRow(detail)
                if !store.capabilityBadges.isEmpty {
                    HStack(spacing: 6) {
                        ForEach(store.capabilityBadges, id: \.self) { Chip(text: $0, small: true).opacity(0.85) }
                        if session.profile.baseURL.host() == "127.0.0.1" { Chip(text: String(localized: "本機"), small: true).opacity(0.85) }
                    }
                }
                actionRow(store)
                if let synopsis = detail.synopsis?.strippingHTML ?? detail.summary.description?.strippingHTML {
                    Text(synopsis)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(.white.opacity(0.7))
                        .lineSpacing(5)
                        .lineLimit(6)
                        .frame(maxWidth: 700, alignment: .leading)
                        .padding(.top, 4)
                }
            }
            .padding(.top, 6)
            Spacer(minLength: 0)
        }
        .padding(.top, 60)
    }

    private func metaRow(_ detail: AnimeDetail) -> some View {
        HStack(spacing: 10) {
            if detail.summary.score > 0 {
                Label(detail.summary.score.formatted(.number.precision(.fractionLength(1))), systemImage: "heart.fill")
                    .font(.system(size: 15, weight: .bold)).foregroundStyle(Theme.accent)
            }
            if let type = detail.summary.mediaType { PillBadge(text: type, tint: .white.opacity(0.1)) }
            if detail.summary.episodeCount > 0 { meta(String(localized: "\(detail.summary.episodeCount) 集")) }
            if let date = detail.summary.airDate { meta(String(date.prefix(7))) }
            if detail.rating.total > 0 { Text("\(detail.rating.total) 評分").font(.system(size: 11)).foregroundStyle(Theme.Text.muted) }
            if detail.summary.nextEpisode != nil {
                HStack(spacing: 4) {
                    Circle().fill(Color(hex: 0xFBBF24)).frame(width: 6, height: 6)
                    Text("放送中")
                }
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(Color(hex: 0xFCD34D))
                .padding(.horizontal, 7).padding(.vertical, 3)
                .background(Color(hex: 0xF59E0B).opacity(0.2), in: Capsule())
            }
        }
    }

    private func meta(_ text: String) -> some View {
        Text(text).font(.system(size: 12, weight: .medium)).foregroundStyle(.white.opacity(0.55))
    }

    private func tagRow(_ detail: AnimeDetail) -> some View {
        FlowLayout(spacing: 6) {
            if let season = Formatters.season(from: detail.summary.airDate) { Chip(text: season, small: true) }
            ForEach(detail.summary.genres.prefix(5), id: \.self) { genre in
                Button {
                    router.push(.discoverCategory(title: Genre.label(for: genre), query: .genre(genre)))
                } label: {
                    Chip(text: Genre.label(for: genre), small: true)
                }
                .buttonStyle(.plain)
            }
            ForEach(detail.tags.prefix(4), id: \.self) { tag in
                Button { router.push(.discoverCategory(title: tag, query: .tag(tag))) } label: { Chip(text: tag, small: true).opacity(0.8) }
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

            Menu {
                Button("重新整理中繼資料", systemImage: "arrow.clockwise") { Task { await store.refreshMetadata() } }
                Button("在 Bangumi 開啟", systemImage: "safari") { openURL(URL(string: "https://bgm.tv/subject/\(bangumiID)")!) }
                if let trailer = store.detail.value?.trailerURL {
                    Button("預告片", systemImage: "play.rectangle") { playTrailer(trailer, title: store.detail.value?.title ?? "") }
                }
            } label: {
                Image(systemName: "ellipsis")
            }
            .menuStyle(.button)
            .buttonStyle(HeroButtonStyle(primary: false))
        }
        .padding(.top, 4)
    }

    // MARK: Episodes

    private func episodesSection(_ store: AnimeDetailStore) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("集數").font(.system(size: 20, weight: .bold))
                let available = store.episodes.filter(\.hasFile).count
                let count = store.episodes.count
                Text(store.episodes.isEmpty ? String(localized: "\(store.discoverEpisodes.count) 集") : String(localized: "\(count) 集 · \(available) 有檔案"))
                    .font(.system(size: 13)).foregroundStyle(Theme.Text.tertiary)
                Spacer()
                if !store.episodes.isEmpty {
                    Segmented(options: EpisodeFilter.allCases, selection: $episodeFilter) { $0.label }
                }
            }
            if store.episodes.isEmpty {
                if store.discoverEpisodes.isEmpty, store.playable.isLoading {
                    ProgressView().frame(maxWidth: .infinity).padding()
                } else if store.discoverEpisodes.isEmpty {
                    EmptyState(symbol: "film", title: String(localized: "還沒有集數資料"), message: String(localized: "這部作品尚未加入媒體庫，也沒有 Bangumi 的集數資訊。"))
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 320), spacing: 20)], alignment: .leading, spacing: 6) {
                        ForEach(store.discoverEpisodes) { episode in
                            DiscoverEpisodeRow(episode: episode)
                        }
                    }
                }
            } else {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 320), spacing: 20)], alignment: .leading, spacing: 6) {
                    ForEach(filteredEpisodes(store)) { episode in
                        EpisodeRow(episode: episode, isCurrent: episode.id == store.primaryAction.episode?.id) {
                            startPlayback(episode, store)
                        } markWatched: { watched in
                            Task { await store.markEpisode(episode, watched: watched) }
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func filteredEpisodes(_ store: AnimeDetailStore) -> [PlayableEpisode] {
        switch episodeFilter {
        case .all: store.episodes
        case .unwatched: store.episodes.filter { !($0.progress?.completed ?? false) }
        case .available: store.episodes.filter(\.hasFile)
        }
    }

    private func startPlayback(_ episode: PlayableEpisode?, _ store: AnimeDetailStore) {
        guard let episode, episode.hasFile, let detail = store.detail.value else { return }
        playerCoordinator.play(PlaybackRequest(bangumiID: bangumiID, episodeID: episode.episodeID, title: detail.title, coverImage: detail.coverImage))
        router.openWatch(bangumiID: bangumiID, episodeID: episode.episodeID)
    }

    /// In-app trailer window when yt-dlp is installed, else the browser.
    private func playTrailer(_ url: URL, title: String) {
        if trailers.canPlayInApp {
            trailers.play(url: url, title: title.isEmpty ? String(localized: "預告片") : String(localized: "\(title) 預告片"))
            openWindow(id: "trailer")
        } else {
            openURL(url)
        }
    }

    // MARK: Side column

    private func sideColumn(_ detail: AnimeDetail, _ store: AnimeDetailStore) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            if let trailer = detail.trailerURL {
                VStack(alignment: .leading, spacing: 8) {
                    Text("預告片").font(.system(size: 13, weight: .bold))
                    Button { playTrailer(trailer, title: detail.title) } label: {
                        ZStack {
                            RemoteImage(url: detail.bannerImage ?? detail.coverImage, maxPixel: 800) {
                                Rectangle().fill(Theme.animeGradient(detail.title + "pv"))
                            }
                            Image(systemName: "play.fill").font(.system(size: 18, weight: .bold)).foregroundStyle(.black)
                                .frame(width: 48, height: 48).background(.white.opacity(0.92), in: Circle())
                        }
                        .frame(width: 300, height: 168)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
            if !detail.relations.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("關聯作品").font(.system(size: 13, weight: .bold))
                    ForEach(detail.relations.prefix(6)) { relation in
                        Button { router.openAnime(relation.anime.bangumiID) } label: {
                            HStack(spacing: 10) {
                                RemoteImage(url: relation.anime.coverImage, maxPixel: 120) { Rectangle().fill(Theme.animeGradient(relation.anime.title)) }
                                    .frame(width: 40, height: 56).clipShape(RoundedRectangle(cornerRadius: 4))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(relation.anime.title).font(.system(size: 12, weight: .semibold)).lineLimit(2)
                                    Text(Self.relationLabel(relation.relationType)).font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                                }
                                Spacer()
                            }
                            .padding(8)
                            .background(.white.opacity(0.03), in: RoundedRectangle(cornerRadius: 8))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            if !detail.characters.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Text("角色 / 聲優").font(.system(size: 13, weight: .bold))
                    ForEach(detail.characters.prefix(6)) { character in
                        HStack(spacing: 8) {
                            RemoteImage(url: character.character.image, maxPixel: 80) { Circle().fill(Theme.animeGradient(character.character.name)) }
                                .frame(width: 36, height: 36).clipShape(Circle())
                            VStack(alignment: .leading, spacing: 1) {
                                Text(character.character.name).font(.system(size: 12, weight: .semibold)).lineLimit(1)
                                if let actor = character.voiceActor {
                                    Text("CV \(actor.name)").font(.system(size: 10)).foregroundStyle(Theme.Text.tertiary).lineLimit(1)
                                }
                            }
                        }
                    }
                }
            }
            if !store.comments.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Text("評論 (\(store.comments.count))").font(.system(size: 13, weight: .bold))
                    ForEach(store.comments.prefix(5)) { comment in
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 6) {
                                Text(comment.nickname.isEmpty ? comment.username : comment.nickname).font(.system(size: 11, weight: .semibold))
                                if comment.rate > 0 { Text("★ \(comment.rate)").font(.system(size: 10)).foregroundStyle(Color(hex: 0xFBBF24)) }
                            }
                            Text(comment.comment).font(.system(size: 11)).foregroundStyle(Theme.Text.secondary).lineLimit(3)
                        }
                    }
                }
            }
        }
        .frame(width: 300)
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

private func missingBadge(_ airDate: String?) -> String {
    airDate.map { date in String(localized: "無檔案 · \(date)") } ?? String(localized: "無檔案")
}

/// One episode in the two-column grid: still, number, status tag, title, synopsis.
struct EpisodeRow: View {
    let episode: PlayableEpisode
    let isCurrent: Bool
    var play: () -> Void
    var markWatched: (Bool) -> Void

    @State private var hovered = false

    private var completed: Bool { episode.progress?.completed ?? false }

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            ZStack {
                RemoteImage(url: episode.image, maxPixel: 400) { Rectangle().fill(Theme.animeGradient(episode.episodeID)) }
                    .opacity(episode.hasFile ? 1 : 0.35)
                if let progress = episode.progress, !progress.completed, progress.positionSeconds > 0 {
                    ProgressStripe(fraction: progress.fraction).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                }
                if episode.hasFile, isCurrent || hovered {
                    Image(systemName: "play.fill").font(.system(size: 13, weight: .bold)).foregroundStyle(.black)
                        .frame(width: 34, height: 34).background(.white.opacity(0.92), in: Circle())
                }
            }
            .frame(width: 176, height: 99)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text("第 \(episode.number) 集").font(.system(size: 12, weight: .bold)).foregroundStyle(Theme.Text.tertiary)
                    statusTag
                }
                Text(episode.displayTitle ?? String(localized: "第 \(episode.number) 集"))
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(episode.hasFile ? .white : Theme.Text.tertiary)
                    .lineLimit(1)
                if let synopsis = episode.displaySynopsis {
                    Text(synopsis).font(.system(size: 12)).foregroundStyle(Theme.Text.tertiary).lineLimit(2)
                }
            }
            Spacer(minLength: 0)
            if episode.hasFile {
                Menu {
                    Button("播放", systemImage: "play.fill", action: play)
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
                .frame(width: 24)
                .opacity(hovered || isCurrent ? 1 : 0.4)
            }
        }
        .padding(8)
        .background(isCurrent ? .white.opacity(0.04) : .clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(.white.opacity(isCurrent ? 0.08 : 0)))
        .contentShape(Rectangle())
        .onTapGesture { if episode.hasFile { play() } }
        .onHover { hovered = $0 }
        .contextMenu {
            if episode.hasFile {
                Button("播放", systemImage: "play.fill", action: play)
                Button("從頭播放", systemImage: "gobackward", action: play)
                Divider()
                Button(
                    completed ? String(localized: "標記為未看") : String(localized: "標記為已看"),
                    systemImage: completed ? "circle" : "checkmark.circle"
                ) { markWatched(!completed) }
            }
        }
    }

    @ViewBuilder
    private var statusTag: some View {
        if !episode.hasFile {
            PillBadge(text: missingBadge(episode.airDate), tint: .white.opacity(0.05), foreground: Theme.Text.tertiary)
        } else if completed {
            PillBadge(text: String(localized: "已看完"), tint: Color(hex: 0x22C55E).opacity(0.12), foreground: Color(hex: 0x4ADE80))
        } else if let progress = episode.progress, progress.positionSeconds > 0 {
            PillBadge(text: Formatters.remaining(progress.remainingSeconds), tint: Theme.accent.opacity(0.15), foreground: Theme.accent)
        }
    }
}

/// Bangumi episode list for series not in the library.
struct DiscoverEpisodeRow: View {
    let episode: DiscoverEpisode

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            RemoteImage(url: episode.image, maxPixel: 400) { Rectangle().fill(Theme.animeGradient("\(episode.id)")) }
                .frame(width: 176, height: 99)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                .opacity(0.5)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text("第 \(episode.sort.rounded() == episode.sort ? String(Int(episode.sort)) : String(episode.sort)) 集")
                        .font(.system(size: 12, weight: .bold)).foregroundStyle(Theme.Text.tertiary)
                    PillBadge(text: missingBadge(episode.airDate), tint: .white.opacity(0.05), foreground: Theme.Text.tertiary)
                }
                Text(episode.title.isEmpty ? (episode.titleOriginal ?? "") : episode.title)
                    .font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.Text.tertiary).lineLimit(1)
                if let synopsis = episode.synopsis {
                    Text(synopsis).font(.system(size: 12)).foregroundStyle(Theme.Text.muted).lineLimit(2)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(8)
    }
}
