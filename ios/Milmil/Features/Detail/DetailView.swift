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
                ProgressView().controlSize(.large).tint(Theme.accent)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case let .failed(message):
                ContentUnavailableView("載入失敗", systemImage: "wifi.exclamationmark", description: Text(message))
            case let .ready(detail, episodes):
                content(detail: detail, episodes: episodes)
            }
        }
        .background(Theme.background)
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
        let playable = episodes?.episodes.filter(\.hasFile) ?? []
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                banner(detail)
                VStack(alignment: .leading, spacing: 10) {
                    Text(detail.title).font(.title2.weight(.semibold))
                    Text(meta(detail)).font(.subheadline).foregroundStyle(.secondary)
                    if let blurb = detail.synopsis ?? detail.summary.description {
                        Text(blurb).font(.subheadline).foregroundStyle(.secondary).lineLimit(6)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)

                if let list = episodes?.episodes, !list.isEmpty {
                    Text("分集 · \(playable.count) / \(list.count) 集喺伺服器")
                        .font(.headline)
                        .padding(.horizontal, 16)
                        .padding(.top, 24)
                        .padding(.bottom, 8)
                    ForEach(list) { episode in
                        EpisodeRow(episode: episode) { playing = episode }
                    }
                }
            }
            .padding(.bottom, 110)
        }
        .safeAreaInset(edge: .bottom) {
            actionButton(detail: detail, episodes: episodes)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .padding(.horizontal, 20)
                .padding(.bottom, 8)
        }
    }

    @ViewBuilder
    private func actionButton(detail: AnimeDetail, episodes: PlayableEpisodesResponse?) -> some View {
        if let next = episodes?.resumeCandidate {
            Button {
                playing = next
            } label: {
                Label(
                    (next.progress.map { !$0.completed && $0.positionSeconds > 10 } ?? false) ? "繼續睇 第 \(next.number) 集" : "播放 第 \(next.number) 集",
                    systemImage: "play.fill"
                )
                .padding(.horizontal, 18)
                .padding(.vertical, 12)
            }
            .inkProminentButtonStyle()
        } else {
            // Nothing on disk: the useful action is to go and get it, which is
            // what the web and macOS detail pages offer.
            Button {
                onFindTorrents(detail.title)
            } label: {
                Label("找種子", systemImage: "magnifyingglass")
                    .padding(.horizontal, 18)
                    .padding(.vertical, 12)
            }
            .inkProminentButtonStyle()
        }
    }

    private func banner(_ detail: AnimeDetail) -> some View {
        Color.clear
            .frame(height: 210)
            .overlay {
                AsyncImage(url: detail.bannerImage ?? detail.coverImage) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Theme.background
                }
            }
            .clipped()
        .overlay(alignment: .bottom) {
            LinearGradient(
                colors: [.clear, Theme.background],
                startPoint: .center, endPoint: .bottom
            )
        }
    }

    private func meta(_ detail: AnimeDetail) -> String {
        var parts: [String] = []
        if let year = detail.summary.airDate?.prefix(4), !year.isEmpty { parts.append(String(year)) }
        if let type = detail.summary.mediaType, !type.isEmpty { parts.append(type) }
        if detail.summary.episodeCount > 0 { parts.append("\(detail.summary.episodeCount) 集") }
        if detail.summary.score > 0 { parts.append("★ \(detail.summary.score.formatted(.number.precision(.fractionLength(0...1))))") }
        return parts.joined(separator: " · ")
    }
}

/// One episode. An episode with no file is still listed but not tappable —
/// knowing episode 44 exists and is missing is the point of the list.
private struct EpisodeRow: View {
    let episode: PlayableEpisode
    let play: () -> Void

    var body: some View {
        Button(action: play) {
            HStack(spacing: 14) {
                Text(episode.number)
                    .font(.callout.weight(.medium))
                    .frame(width: 40, height: 40)
                    .background(.white.opacity(episode.hasFile ? 0.12 : 0.05), in: RoundedRectangle(cornerRadius: 10))
                VStack(alignment: .leading, spacing: 3) {
                    Text(episode.displayTitle ?? "第 \(episode.number) 集")
                        .font(.body)
                        .foregroundStyle(episode.hasFile ? Color.primary : .secondary)
                        .lineLimit(1)
                    Text(episode.hasFile ? (episode.airDate ?? "") : "未有檔案")
                        .font(.caption).foregroundStyle(.secondary)
                    if let progress = episode.progress, progress.fraction > 0 {
                        ProgressView(value: progress.fraction).tint(Theme.accent)
                    }
                }
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(!episode.hasFile)
    }
}
