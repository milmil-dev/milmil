import MilmilAPI
import SwiftUI

/// The shelves. Everything here already exists in the shared package — the iOS
/// client adds no networking of its own.
@Observable
@MainActor
final class HomeModel {
    enum State { case loading, ready, failed(String) }

    private(set) var state: State = .loading
    private(set) var hero: [AnimeSummary] = []
    private(set) var continueWatching: [ProgressEntry] = []
    private(set) var today: [AnimeSummary] = []
    private(set) var trending: [AnimeSummary] = []

    private let client: APIClient
    init(client: APIClient) { self.client = client }

    func load() async {
        do {
            async let trendingCall = client.trending(page: 1)
            async let calendarCall = client.calendar()
            // 繼續睇 is the row a returning user actually opens the app for, and
            // it must not be able to fail the whole page.
            async let progressCall = try? await client.recentProgress()
            let (trending, week) = try await (trendingCall, calendarCall)

            // The server abbreviates the weekday ("Fri"); compare the first
            // three letters so neither side has to know which the other picked.
            let todayEN = Date.now.formatted(.dateTime.weekday(.abbreviated).locale(.init(identifier: "en_US_POSIX")))
            let wanted = todayEN.prefix(3).lowercased()

            self.trending = trending.deduped()
            self.today = week.first { $0.weekdayEN.prefix(3).lowercased() == wanted }?.items.deduped() ?? []
            // Five is what a carousel can hold before it becomes a list.
            self.hero = Array(self.trending.filter { $0.bannerImage != nil }.prefix(5))
            self.continueWatching = (await progressCall ?? []).filter { !$0.completed }
            state = .ready
        } catch {
            state = .failed(error.localizedDescription)
        }
    }
}

private extension [AnimeSummary] {
    /// `/discover/browse` and friends can repeat a title — page 1 came back
    /// with 50 rows and 48 distinct ids.
    func deduped() -> [AnimeSummary] {
        var seen = Set<Int>()
        return filter { seen.insert($0.bangumiID).inserted }
    }
}

struct HomeView: View {
    let client: APIClient
    let open: (Int) -> Void
    @Environment(\.zoomNamespace) private var zoom
    @State private var model: HomeModel

    init(client: APIClient, open: @escaping (Int) -> Void) {
        self.client = client
        self.open = open
        _model = State(initialValue: HomeModel(client: client))
    }

    var body: some View {
        Group {
            switch model.state {
            case .loading:
                loading
            case let .failed(message):
                ContentUnavailableView("載入失敗", systemImage: "wifi.exclamationmark", description: Text(message))
            case .ready:
                shelves
            }
        }
        .background(Theme.background)
        .task { await model.load() }
    }

    /// Shapes where the content will be. A spinner alone on a black screen says
    /// nothing about what is coming.
    private var loading: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Space.section) {
                Skeleton(height: 430, radius: 0)
                ShelfSkeleton()
                ShelfSkeleton()
            }
        }
        .ignoresSafeArea(edges: .top)
        .scrollDisabled(true)
    }

    private var shelves: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: Theme.Space.section) {
                if !model.hero.isEmpty {
                    HeroCarousel(items: model.hero, open: open, zoom: zoom)
                }
                if !model.continueWatching.isEmpty {
                    ContinueRow(entries: model.continueWatching, open: open, zoom: zoom)
                }
                if !model.today.isEmpty {
                    Shelf(title: "今日時間表", items: model.today, open: open, zoom: zoom)
                }
                if !model.trending.isEmpty {
                    Shelf(title: "熱門", items: model.trending, open: open, zoom: zoom)
                }
            }
            .padding(.bottom, 110)
        }
        .ignoresSafeArea(edges: .top)
    }
}

/// The hero. A carousel rather than one fixed title: the page has to have
/// something to say every time it opens.
private struct HeroCarousel: View {
    let items: [AnimeSummary]
    let open: (Int) -> Void
    let zoom: Namespace.ID?

    @State private var index = 0

    var body: some View {
        VStack(spacing: 12) {
            TabView(selection: $index) {
                ForEach(Array(items.enumerated()), id: \.offset) { offset, anime in
                    HeroCard(anime: anime, open: { open(anime.bangumiID) })
                        .zoomSource(anime.bangumiID, in: zoom)
                        .tag(offset)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .frame(height: 430)

            // Our own dots: the built-in ones sit inside the frame, on top of
            // the title.
            HStack(spacing: 6) {
                ForEach(items.indices, id: \.self) { dot in
                    Capsule()
                        .fill(dot == index ? Theme.ink(0.9) : Theme.ink(0.22))
                        .frame(width: dot == index ? 16 : 6, height: 6)
                        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: index)
                }
            }
        }
    }
}

private struct HeroCard: View {
    let anime: AnimeSummary
    let open: () -> Void

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            // Color.clear takes the proposed width and the overlay does not
            // affect layout: `.clipped()` alone only clips drawing, so a banner
            // wider than the phone reported its own width and pushed the title
            // off the right edge.
            Color.clear
                .overlay {
                    AsyncImage(url: anime.bannerImage ?? anime.coverImage) { image in
                        image.resizable().scaledToFill()
                    } placeholder: {
                        Theme.artworkGradient(anime.title)
                    }
                }
                .clipped()

            // Two scrims, not one: a soft wash under the status bar so the
            // clock survives bright art, and a deep one at the foot that
            // carries the image into the page.
            LinearGradient(
                stops: [
                    .init(color: .black.opacity(0.55), location: 0),
                    .init(color: .clear, location: 0.28),
                    .init(color: Theme.background.opacity(0.75), location: 0.72),
                    .init(color: Theme.background, location: 1),
                ],
                startPoint: .top,
                endPoint: .bottom
            )

            VStack(alignment: .leading, spacing: 12) {
                Text(anime.title)
                    .font(.system(size: 30, weight: .bold))
                    .foregroundStyle(Theme.ink(0.96))
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)

                if !meta.isEmpty {
                    HStack(spacing: 8) {
                        ForEach(meta, id: \.self) { item in
                            Text(item)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundStyle(Theme.ink(0.75))
                                .padding(.horizontal, 9)
                                .padding(.vertical, 4)
                                .background(Theme.ink(0.1), in: Capsule())
                        }
                    }
                }

                Button(action: open) {
                    Label("查看詳情", systemImage: "info.circle.fill")
                        .font(.system(size: 15, weight: .semibold))
                        .padding(.horizontal, 18)
                        .padding(.vertical, 11)
                }
                .inkProminentButtonStyle()
                .padding(.top, 2)
            }
            .padding(.horizontal, Theme.Space.margin)
            .padding(.bottom, 18)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .clipped()
    }

    private var meta: [String] {
        var parts: [String] = []
        if anime.score > 0 { parts.append("★ \(anime.score.formatted(.number.precision(.fractionLength(0...1))))") }
        if let year = anime.airDate?.prefix(4), !year.isEmpty { parts.append(String(year)) }
        if anime.episodeCount > 0 { parts.append("\(anime.episodeCount) 集") }
        return parts
    }
}

/// 繼續睇 — wide cards, because what you want back is the episode, not the
/// series, and a 3:4 poster cannot show you where you were.
private struct ContinueRow: View {
    let entries: [ProgressEntry]
    let open: (Int) -> Void
    let zoom: Namespace.ID?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: "繼續睇")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(entries) { entry in
                        Button { entry.animeBangumiID.map(open) } label: {
                            ContinueCard(entry: entry)
                        }
                        .buttonStyle(PressableCard())
                        .zoomSource(entry.animeBangumiID ?? 0, in: zoom)
                        .disabled(entry.animeBangumiID == nil)
                    }
                }
                .padding(.horizontal, Theme.Space.margin)
            }
        }
    }
}

private struct ContinueCard: View {
    let entry: ProgressEntry

    private var fraction: Double {
        guard let total = entry.durationSeconds, total > 0 else { return 0 }
        return min(1, Double(entry.positionSeconds) / Double(total))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            ZStack(alignment: .bottom) {
                Theme.artworkGradient(entry.animeTitle)
                AsyncImage(url: entry.animeCoverImage) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Color.clear
                }
                LinearGradient(colors: [.clear, .black.opacity(0.7)], startPoint: .center, endPoint: .bottom)

                Image(systemName: "play.circle.fill")
                    .font(.system(size: 34))
                    .foregroundStyle(.white.opacity(0.95))
                    .shadow(color: .black.opacity(0.4), radius: 6)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)

            }
            .frame(width: 232, height: 130)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
            // An overlay on the clipped card, not a sibling in the ZStack: the
            // stack's alignment put it where nothing could see it.
            .overlay(alignment: .bottom) {
                Capsule()
                    .fill(.black.opacity(0.5))
                    .frame(height: 4)
                    .overlay(alignment: .leading) {
                        GeometryReader { geometry in
                            Capsule().fill(Theme.accent).frame(width: geometry.size.width * fraction)
                        }
                    }
                    .padding(.horizontal, 10)
                    .padding(.bottom, 9)
            }
            .overlay {
                RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous)
                    .strokeBorder(.white.opacity(0.08), lineWidth: 0.5)
            }
            .shadow(color: .black.opacity(0.45), radius: 10, y: 5)

            VStack(alignment: .leading, spacing: 2) {
                Text(entry.animeTitleZh ?? entry.animeTitle)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.ink(0.92))
                    .lineLimit(1)
                Text("第 \(entry.episodeLabel) 集 · 仲有 \(remaining) 分鐘")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.ink(0.5))
            }
        }
        .frame(width: 232, alignment: .leading)
        .contentShape(.rect)
    }

    private var remaining: Int {
        max(0, ((entry.durationSeconds ?? 0) - entry.positionSeconds) / 60)
    }
}

private struct Shelf: View {
    let title: String
    let items: [AnimeSummary]
    let open: (Int) -> Void
    let zoom: Namespace.ID?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: title)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 12) {
                    ForEach(items) { anime in
                        Button { open(anime.bangumiID) } label: {
                            PosterCard(
                                title: anime.title,
                                url: anime.coverImage,
                                score: anime.score,
                                badge: episodeBadge(anime)
                            )
                        }
                        .buttonStyle(PressableCard())
                        .zoomSource(anime.bangumiID, in: zoom)
                    }
                }
                .padding(.horizontal, Theme.Space.margin)
            }
        }
    }

    private func episodeBadge(_ anime: AnimeSummary) -> String? {
        guard let episode = anime.nextEpisode, episode > 0 else { return nil }
        return "EP \(episode)"
    }
}
