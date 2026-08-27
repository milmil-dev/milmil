import MilmilAPI
import SwiftUI

@Observable
final class DiscoverStore {
    struct Rail: Identifiable {
        let id: String
        let title: String
        let route: BrowseRoute
        var items: Loadable<[AnimeSummary]> = .idle
    }

    private(set) var rails: [Rail]
    private(set) var tags: Loadable<[HotTag]> = .idle
    private let client: APIClient

    /// Web's genre-spotlight pool (mirrors `GENRES` in DiscoverPage.tsx).
    private static let spotlightPool = Genre.allCases.filter { ![.mecha, .mahouShoujo, .ecchi].contains($0) }

    init(client: APIClient) {
        self.client = client
        let now = Season.current()
        let prev = now.season.previous
        let spotlight = Self.spotlightPool.randomElement() ?? .fantasy
        rails = [
            Rail(id: "trending", title: String(localized: "現在熱門"), route: .trending),
            Rail(id: "season", title: String(localized: "本季最佳"), route: .query(BrowseQuery(sort: .score, year: now.year, season: now.season.rawValue))),
            Rail(
                id: "lastSeason", title: String(localized: "上季最佳"),
                route: .query(BrowseQuery(sort: .score, year: now.year + prev.delta, season: prev.season.rawValue))
            ),
            Rail(id: "recent", title: String(localized: "近期開播"), route: .query(BrowseQuery(sort: .date, year: now.year))),
            Rail(id: "movies", title: String(localized: "熱門劇場版"), route: .query(BrowseQuery(sort: .trending, format: "MOVIE"))),
            Rail(
                id: "spotlight", title: String(localized: "類型精選・\(spotlight.label)"),
                route: .query(BrowseQuery(genre: spotlight.rawValue, sort: .score))
            ),
            Rail(id: "upcoming", title: String(localized: "即將播出"), route: .query(BrowseQuery(sort: .popularity, status: AiringStatus.notYetReleased.rawValue))),
        ]
    }

    var heroItems: [AnimeSummary] { Array(rails.first?.items.value?.prefix(5) ?? []) }

    func load() async {
        await withTaskGroup(of: Void.self) { group in
            for index in rails.indices {
                group.addTask { await self.loadRail(index) }
            }
            group.addTask { await self.loadTags() }
        }
    }

    private func loadRail(_ index: Int) async {
        let route = rails[index].route
        rails[index].items = rails[index].items.reloading
        rails[index].items = await rails[index].items.reloaded { try await client.browse(route: route, page: 1) }
    }

    private func loadTags() async {
        tags = tags.reloading
        tags = await tags.reloaded { try await client.hotTags() }
    }
}

extension APIClient {
    func browse(route: BrowseRoute, page: Int) async throws -> [AnimeSummary] {
        switch route {
        case .trending: try await trending(page: page)
        case let .genre(genre): try await browse(BrowseQuery(genre: genre, page: page))
        case let .tag(tag): try await browse(tag: tag, page: page)
        case let .query(query):
            try await browse({
                var q = query
                q.page = page
                return q
            }())
        }
    }
}

/// Rotating billboard + genre/tag shelves + curated rails; every chip and
/// rail "view all" lands on Search with the filters prefilled, like web's
/// /search links. The backdrop dims as the rails scroll over the hero.
struct DiscoverView: View {
    @Environment(ServerSession.self) private var session
    @Environment(Router.self) private var router
    @Environment(BackdropStore.self) private var backdrop
    @Environment(PlayerCoordinator.self) private var playerCoordinator
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var store: DiscoverStore?
    @State private var scrollDim = 0.0
    @ObserveInjection private var inject

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                if let store {
                    heroSection(store)
                    chipRows(store)
                    ForEach(Array(store.rails.enumerated()), id: \.element.id) { index, rail in
                        railSection(rail, index: index)
                    }
                }
            }
            .padding(.horizontal, 40)
            .padding(.top, 24)
            .padding(.bottom, 40)
        }
        .navigationTitle("探索")
        // Settle into calm background as the rails scroll over the hero art;
        // quantized so the observable only ticks on visible steps.
        .onScrollGeometryChange(for: Double.self) { geometry in
            let raw = min(0.55, max(0, (geometry.contentOffset.y - 120) / 480))
            return (raw * 20).rounded() / 20
        } action: { _, dim in
            scrollDim = dim
            backdrop.setDim(dim, owner: "discover")
        }
        .task {
            if store == nil { store = DiscoverStore(client: session.client) }
            await store?.load()
        }
    }

    private func play(_ request: PlaybackRequest) {
        playerCoordinator.play(request)
        router.openWatch(bangumiID: request.bangumiID, episodeID: request.episodeID)
    }

    @ViewBuilder
    private func heroSection(_ store: DiscoverStore) -> some View {
        if !store.heroItems.isEmpty {
            HeroCarousel(
                items: store.heroItems,
                onOpen: { router.open($0) },
                onPlay: { play(PlaybackRequest(bangumiID: $0.bangumiID, title: $0.title, coverImage: $0.coverImage)) },
                onActiveChange: { backdrop.set($0.bannerImage ?? $0.coverImage, seed: $0.title, dim: scrollDim, owner: "discover") }
            )
            .padding(.top, 40)
        } else if let message = store.rails.first?.items.errorMessage {
            ErrorBanner(message: message) { Task { await store.load() } }
        } else {
            HeroSkeleton().padding(.top, 40)
        }
    }

    private func chipRows(_ store: DiscoverStore) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Shelf(spacing: 8) {
                ForEach(Genre.allCases) { genre in
                    Button { router.openSearch(SearchPrefill(genres: [genre.rawValue])) } label: {
                        GenreChip(genre: genre)
                    }
                    .buttonStyle(.plain)
                }
            }
            if let tags = store.tags.value, !tags.isEmpty {
                Shelf(spacing: 8) {
                    ForEach(tags.prefix(18)) { tag in
                        Button { router.openSearch(SearchPrefill(tags: [tag.name])) } label: {
                            Chip(text: "#\(tag.label)")
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func railSection(_ rail: DiscoverStore.Rail, index: Int) -> some View {
        Group {
            if let items = rail.items.value {
                if !items.isEmpty {
                    railContent(rail, items: items)
                        .transition(reduceMotion ? .opacity : .opacity.combined(with: .offset(y: 14)))
                }
            } else if rail.items.errorMessage == nil {
                ShelfSkeleton().transition(.opacity)
            }
        }
        .animation(.spring(duration: 0.55, bounce: 0).delay(Double(index) * 0.06), value: rail.items.value != nil)
    }

    private func railContent(_ rail: DiscoverStore.Rail, items: [AnimeSummary]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionHeader(title: rail.title, moreTitle: String(localized: "查看全部")) {
                router.openSearch(SearchPrefill(route: rail.route))
            }
            if rail.id == "trending" {
                Shelf(spacing: 6) {
                    ForEach(Array(items.prefix(10).enumerated()), id: \.element.id) { rank, item in
                        RankedPosterCard(rank: rank + 1, summary: item, onOpen: { router.open(item) })
                    }
                }
            } else {
                Shelf {
                    ForEach(items) { item in
                        PosterCard(summary: item, onOpen: { router.open(item) })
                    }
                }
            }
        }
    }
}

/// Ranked poster for the trending rail: a ghost numeral peeking out from
/// behind the card, Netflix Top-10 style.
private struct RankedPosterCard: View {
    let rank: Int
    let summary: AnimeSummary
    var onOpen: () -> Void

    var body: some View {
        HStack(alignment: .bottom, spacing: -14) {
            Text(rank, format: .number)
                .font(.system(size: 92, weight: .heavy, design: .rounded))
                .monospacedDigit()
                .tracking(-6)
                .foregroundStyle(Theme.ink(0.12))
                .padding(.bottom, 24)
                .accessibilityHidden(true)
            PosterCard(summary: summary, onOpen: onOpen)
        }
        .accessibilityLabel("第 \(rank) 名：\(summary.title)")
    }
}

/// Genre capsule with the genre's signature icon + tint.
private struct GenreChip: View {
    let genre: Genre

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: genre.symbol)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(genre.tint)
            Text(genre.label)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.ink(0.85))
                .lineLimit(1)
        }
        .padding(.horizontal, 11)
        .padding(.vertical, 5)
        .background(genre.tint.opacity(0.13), in: Capsule())
        .overlay(Capsule().strokeBorder(genre.tint.opacity(0.2), lineWidth: 0.5))
    }
}

extension Genre {
    var symbol: String {
        switch self {
        case .action: "flame"
        case .adventure: "map"
        case .comedy: "face.smiling"
        case .drama: "theatermasks"
        case .fantasy: "wand.and.stars"
        case .mystery: "magnifyingglass"
        case .psychological: "brain.head.profile"
        case .romance: "heart.fill"
        case .sciFi: "atom"
        case .sliceOfLife: "cup.and.saucer.fill"
        case .supernatural: "sparkles"
        case .thriller: "bolt.fill"
        case .horror: "moon.fill"
        case .sports: "figure.run"
        case .music: "music.note"
        case .mecha: "gearshape.2.fill"
        case .mahouShoujo: "wand.and.rays"
        case .ecchi: "18.circle"
        }
    }

    var tint: Color {
        switch self {
        case .action: Color(hex: 0xEF4444)
        case .adventure: Color(hex: 0xF97316)
        case .comedy: Color(hex: 0xF59E0B)
        case .drama: Color(hex: 0xA855F7)
        case .fantasy: Color(hex: 0x6366F1)
        case .mystery: Color(hex: 0x3B82F6)
        case .psychological: Color(hex: 0x14B8A6)
        case .romance: Color(hex: 0xEC4899)
        case .sciFi: Color(hex: 0x06B6D4)
        case .sliceOfLife: Color(hex: 0x22C55E)
        case .supernatural: Color(hex: 0x8B5CF6)
        case .thriller: Color(hex: 0xF43F5E)
        case .horror: Color(hex: 0x64748B)
        case .sports: Color(hex: 0x10B981)
        case .music: Color(hex: 0x0EA5E9)
        case .mecha: Color(hex: 0x6B7280)
        case .mahouShoujo: Color(hex: 0xD946EF)
        case .ecchi: Color(hex: 0xFB7185)
        }
    }
}

/// Wrapping chip row.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 800
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > width, x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: width, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
