import MilmilAPI
import SwiftUI

@Observable
@MainActor
final class DetailModel {
    enum State { case loading, ready(AnimeDetail, PlayableEpisodesResponse?), failed(String) }

    private(set) var state: State = .loading
    private let client: APIClient
    private let bangumiID: Int

    init(client: APIClient, bangumiID: Int) {
        self.client = client
        self.bangumiID = bangumiID
    }

    func load() async {
        state = .loading
        // A series with nothing scanned answers 404 for its episodes while the
        // header is perfectly fine — one missing list must not blank the page.
        async let episodesCall = try? await client.playableEpisodes(bangumiID: bangumiID)
        do {
            let detail = try await client.animeDetail(bangumiID: bangumiID)
            state = .ready(detail, await episodesCall)
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    /// Re-read just the episode list, so a part-watched episode shows its bar.
    func refreshEpisodes() async {
        guard case let .ready(detail, _) = state else { return }
        let episodes = try? await client.playableEpisodes(bangumiID: bangumiID)
        state = .ready(detail, episodes)
    }
}

struct DetailView: View {
    let client: APIClient
    let bangumiID: Int
    let danmaku: DanmakuSettings
    let onFindTorrents: (String) -> Void

    @State private var model: DetailModel
    @State private var playing: PlayableEpisode?
    @State private var synopsisExpanded = false

    init(client: APIClient, bangumiID: Int, danmaku: DanmakuSettings, onFindTorrents: @escaping (String) -> Void) {
        self.client = client
        self.bangumiID = bangumiID
        self.danmaku = danmaku
        self.onFindTorrents = onFindTorrents
        _model = State(initialValue: DetailModel(client: client, bangumiID: bangumiID))
    }

    var body: some View {
        Group {
            switch model.state {
            case .loading:
                loading
            case let .failed(message):
                ContentUnavailableView("載入失敗", systemImage: "wifi.exclamationmark", description: Text(message))
            case let .ready(detail, episodes):
                content(detail: detail, episodes: episodes)
            }
        }
        .background(Theme.background)
        .toolbarBackground(.hidden, for: .navigationBar)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await model.load()
            #if DEBUG
            // Debug-only: open straight into the player. `idb` can read this
            // simulator's accessibility tree but not tap it, so without a hook
            // the watch screen cannot be verified on a headless run.
            if ProcessInfo.processInfo.environment["MILMIL_PLAY"] == String(bangumiID),
               case let .ready(_, episodes) = model.state {
                playing = episodes?.resumeCandidate
            }
            #endif
        }
        .fullScreenCover(item: $playing) { episode in
            PlayerView(
                client: client,
                episode: episode,
                episodes: allEpisodes,
                title: title,
                danmaku: danmaku,
                onClose: { Task { await model.refreshEpisodes() } }
            )
        }
    }

    private var loading: some View {
        VStack(alignment: .leading, spacing: 16) {
            Skeleton(height: 300, radius: 0)
            VStack(alignment: .leading, spacing: 10) {
                Skeleton(width: 220, height: 26)
                Skeleton(width: 150, height: 14)
                Skeleton(height: 12)
                Skeleton(height: 12)
            }
            .padding(.horizontal, Theme.Space.margin)
            Spacer()
        }
        .ignoresSafeArea(edges: .top)
    }

    private var title: String {
        if case let .ready(detail, _) = model.state { return detail.title }
        return ""
    }

    private var allEpisodes: [PlayableEpisode] {
        if case let .ready(_, episodes) = model.state { return episodes?.episodes ?? [] }
        return []
    }

    @ViewBuilder
    private func content(detail: AnimeDetail, episodes: PlayableEpisodesResponse?) -> some View {
        let list = episodes?.episodes ?? []
        let playable = list.filter(\.hasFile)

        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Banner(detail: detail)

                // The poster rides the seam between artwork and page, which is
                // what stops the header reading as a stock scroll view.
                HStack(alignment: .bottom, spacing: 14) {
                    Poster(title: detail.title, url: detail.coverImage, width: 104, score: detail.summary.score)
                        .offset(y: -46)
                        .padding(.bottom, -46)
                    VStack(alignment: .leading, spacing: 6) {
                        Text(detail.title)
                            .font(.system(size: 22, weight: .bold))
                            .foregroundStyle(Theme.ink(0.96))
                            .lineLimit(3)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(meta(detail))
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.ink(0.55))
                    }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, Theme.Space.margin)

                actions(detail: detail, episodes: episodes)
                    .padding(.horizontal, Theme.Space.margin)
                    .padding(.top, 18)

                if !detail.summary.genres.isEmpty {
                    ChipRow(items: Array(detail.summary.genres.prefix(8)))
                        .padding(.top, 16)
                }

                if let blurb = detail.synopsis ?? detail.summary.description, !blurb.isEmpty {
                    Synopsis(text: blurb, expanded: $synopsisExpanded)
                        .padding(.horizontal, Theme.Space.margin)
                        .padding(.top, 18)
                }

                if !detail.characters.isEmpty {
                    CastRow(characters: detail.characters)
                        .padding(.top, Theme.Space.section)
                }

                if !list.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        SectionHeader(title: "分集")
                        Text("\(playable.count) / \(list.count) 集喺伺服器")
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.ink(0.45))
                            .padding(.horizontal, Theme.Space.margin)
                            .offset(y: -6)
                        LazyVStack(spacing: 8) {
                            ForEach(list) { episode in
                                Button { play(episode) } label: {
                                    EpisodeRow(episode: episode)
                                }
                                .buttonStyle(PressableCard())
                                .disabled(!episode.hasFile)
                            }
                        }
                        .padding(.horizontal, Theme.Space.margin)
                    }
                    .padding(.top, Theme.Space.section)
                }
            }
            .padding(.bottom, 40)
        }
        .ignoresSafeArea(edges: .top)
    }

    private func play(_ episode: PlayableEpisode) {
        // A play tap is the app's most consequential action; it should feel
        // like one.
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        playing = episode
    }

    @ViewBuilder
    private func actions(detail: AnimeDetail, episodes: PlayableEpisodesResponse?) -> some View {
        HStack(spacing: 10) {
            if let next = episodes?.resumeCandidate {
                Button { play(next) } label: {
                    Label(
                        next.progress?.isResumable == true ? "繼續睇 第 \(next.number) 集" : "播放 第 \(next.number) 集",
                        systemImage: "play.fill"
                    )
                    .font(.system(size: 15, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
                }
                .inkProminentButtonStyle()
            } else {
                // Nothing on disk: the useful action is to go and get it, which
                // is what the web and macOS detail pages offer.
                Button { onFindTorrents(detail.title) } label: {
                    Label("找種子", systemImage: "magnifyingglass")
                        .font(.system(size: 15, weight: .semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 13)
                }
                .inkProminentButtonStyle()
            }

            if episodes?.resumeCandidate != nil {
                Button { onFindTorrents(detail.title) } label: {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 16, weight: .semibold))
                        .frame(width: 48, height: 48)
                }
                .buttonStyle(.glass)
                .accessibilityLabel("找種子")
            }
        }
    }

    private func meta(_ detail: AnimeDetail) -> String {
        var parts: [String] = []
        if let year = detail.summary.airDate?.prefix(4), !year.isEmpty { parts.append(String(year)) }
        if let type = detail.summary.mediaType, !type.isEmpty { parts.append(type) }
        if detail.summary.episodeCount > 0 { parts.append("\(detail.summary.episodeCount) 集") }
        return parts.joined(separator: " · ")
    }
}

/// The banner, and the one piece of motion that costs nothing: pulling down
/// stretches the artwork instead of exposing the page colour.
private struct Banner: View {
    let detail: AnimeDetail

    var body: some View {
        GeometryReader { geometry in
            let offset = geometry.frame(in: .global).minY
            let stretch = max(0, offset)
            AsyncImage(url: detail.bannerImage ?? detail.coverImage) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                Theme.artworkGradient(detail.title)
            }
            .frame(width: geometry.size.width, height: 280 + stretch)
            .clipped()
            .overlay {
                LinearGradient(
                    stops: [
                        .init(color: .black.opacity(0.4), location: 0),
                        .init(color: .clear, location: 0.35),
                        .init(color: Theme.background.opacity(0.85), location: 0.85),
                        .init(color: Theme.background, location: 1),
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
            }
            .offset(y: -stretch)
        }
        .frame(height: 280)
    }
}

private struct ChipRow: View {
    let items: [String]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(items, id: \.self) { item in
                    Text(item)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Theme.ink(0.72))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Theme.ink(0.08), in: Capsule())
                }
            }
            .padding(.horizontal, Theme.Space.margin)
        }
    }
}

/// Six lines, then "展開". A synopsis truncated with no way to read the rest is
/// worse than one that is simply long.
private struct Synopsis: View {
    let text: String
    @Binding var expanded: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(text)
                .font(.system(size: 14))
                .foregroundStyle(Theme.ink(0.62))
                .lineSpacing(3)
                .lineLimit(expanded ? nil : 5)
                .animation(.easeInOut(duration: 0.22), value: expanded)
            Button(expanded ? "收起" : "展開") {
                withAnimation { expanded.toggle() }
            }
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(Theme.accent)
        }
    }
}

private struct CastRow: View {
    let characters: [AnimeCharacter]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: "角色")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 14) {
                    ForEach(characters, id: \.character.id) { entry in
                        VStack(spacing: 7) {
                            AsyncImage(url: entry.character.image) { image in
                                image.resizable().scaledToFill()
                            } placeholder: {
                                Theme.artworkGradient(entry.character.name)
                            }
                            .frame(width: 68, height: 68)
                            .clipShape(Circle())
                            .overlay { Circle().strokeBorder(.white.opacity(0.1), lineWidth: 0.5) }
                            Text(entry.character.nameNative ?? entry.character.name)
                                .font(.system(size: 11))
                                .foregroundStyle(Theme.ink(0.7))
                                .lineLimit(2)
                                .multilineTextAlignment(.center)
                                .frame(width: 72)
                        }
                    }
                }
                .padding(.horizontal, Theme.Space.margin)
            }
        }
    }
}

/// One episode as a card. An episode with no file is still listed but dimmed —
/// knowing episode 44 exists and is missing is the point of the list.
private struct EpisodeRow: View {
    let episode: PlayableEpisode

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(episode.hasFile ? Theme.accent.opacity(0.16) : Theme.ink(0.06))
                Text(episode.number)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(episode.hasFile ? Theme.accent : Theme.ink(0.35))
            }
            .frame(width: 46, height: 46)

            VStack(alignment: .leading, spacing: 3) {
                Text(episode.displayTitle ?? "第 \(episode.number) 集")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(episode.hasFile ? Theme.ink(0.92) : Theme.ink(0.4))
                    .lineLimit(1)
                Text(episode.hasFile ? (episode.airDate ?? "") : "未有檔案")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.ink(0.42))
                if let progress = episode.progress, progress.fraction > 0 {
                    Capsule()
                        .fill(Theme.ink(0.12))
                        .frame(height: 3)
                        .overlay(alignment: .leading) {
                            GeometryReader { geometry in
                                Capsule()
                                    .fill(Theme.accent)
                                    .frame(width: geometry.size.width * progress.fraction)
                            }
                        }
                        .padding(.top, 3)
                }
            }
            Spacer(minLength: 0)

            if episode.hasFile {
                Image(systemName: "play.fill")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.ink(0.35))
            }
        }
        .padding(12)
        .cardBackground()
        .contentShape(.rect)
    }
}
