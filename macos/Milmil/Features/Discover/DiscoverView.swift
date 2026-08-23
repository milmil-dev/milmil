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

    init(client: APIClient) {
        self.client = client
        let now = Season.current()
        let prev = now.season.previous
        rails = [
            Rail(id: "trending", title: String(localized: "現在熱門"), route: .trending),
            Rail(id: "season", title: String(localized: "本季最佳"), route: .query(BrowseQuery(sort: .score, year: now.year, season: now.season.rawValue))),
            Rail(
                id: "lastSeason", title: String(localized: "上季最佳"),
                route: .query(BrowseQuery(sort: .score, year: now.year + prev.delta, season: prev.season.rawValue))
            ),
            Rail(id: "movies", title: String(localized: "熱門劇場版"), route: .query(BrowseQuery(sort: .trending, format: "MOVIE"))),
            Rail(id: "upcoming", title: String(localized: "即將播出"), route: .query(BrowseQuery(sort: .popularity, status: AiringStatus.notYetReleased.rawValue))),
        ]
    }

    var hero: AnimeSummary? { rails.first?.items.value?.first }

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
            try await browse({ var q = query; q.page = page; return q }())
        }
    }
}

/// Curated rails + genre/tag chips; each rail title opens the full grid.
struct DiscoverView: View {
    @Environment(ServerSession.self) private var session
    @Environment(Router.self) private var router
    @Environment(BackdropStore.self) private var backdrop
    @State private var store: DiscoverStore?
    @ObserveInjection private var inject

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                if let store {
                    heroSection(store)
                    chips(store)
                    ForEach(store.rails) { rail in railSection(rail) }
                }
            }
            .padding(.horizontal, 40)
            .padding(.top, 24)
            .padding(.bottom, 40)
        }
        .navigationTitle("探索")
        .task {
            if store == nil { store = DiscoverStore(client: session.client) }
            await store?.load()
        }
        .onChange(of: store?.hero?.id) {
            if let hero = store?.hero { backdrop.set(hero.bannerImage ?? hero.coverImage, seed: hero.title, owner: "discover") }
        }
        .onDisappear { backdrop.clear(owner: "discover") }
    }

    @ViewBuilder
    private func heroSection(_ store: DiscoverStore) -> some View {
        if let hero = store.hero {
            HStack(alignment: .center, spacing: 28) {
                PosterCard(title: hero.title, cover: hero.coverImage, width: 170, onOpen: { router.openAnime(hero.bangumiID) })
                VStack(alignment: .leading, spacing: 12) {
                    Text(hero.title).font(.system(size: 34, weight: .heavy)).tracking(-0.4).lineLimit(2)
                    HStack(spacing: 10) {
                        if hero.score > 0 {
                            Label(hero.score.formatted(.number.precision(.fractionLength(1))), systemImage: "heart.fill")
                                .font(.system(size: 15, weight: .bold)).foregroundStyle(Theme.accent)
                        }
                        ForEach(hero.genres.prefix(4), id: \.self) { Chip(text: Genre.label(for: $0)) }
                    }
                    if let description = hero.description?.strippingHTML {
                        Text(description)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.6))
                            .lineSpacing(4)
                            .lineLimit(3)
                            .frame(maxWidth: 620, alignment: .leading)
                    }
                    HStack(spacing: 10) {
                        Button("詳情") { router.openAnime(hero.bangumiID) }.buttonStyle(HeroButtonStyle(primary: true))
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.top, 60)
            .padding(.bottom, 20)
        } else {
            HeroSkeleton().padding(.top, 60)
        }
    }

    private func chips(_ store: DiscoverStore) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            FlowLayout(spacing: 8) {
                ForEach(Genre.allCases) { genre in
                    Button { router.push(.discoverCategory(title: genre.label, query: .genre(genre.rawValue))) } label: { Chip(text: genre.label) }
                        .buttonStyle(.plain)
                }
            }
            if let tags = store.tags.value, !tags.isEmpty {
                FlowLayout(spacing: 8) {
                    ForEach(tags.prefix(18)) { tag in
                        Button { router.push(.discoverCategory(title: tag.name, query: .tag(tag.name))) } label: {
                            Chip(text: tag.name).opacity(0.75)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func railSection(_ rail: DiscoverStore.Rail) -> some View {
        if let items = rail.items.value, !items.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                SectionHeader(title: rail.title, count: "\(items.count)", moreTitle: String(localized: "查看全部")) {
                    router.push(.discoverCategory(title: rail.title, query: rail.route))
                }
                Shelf {
                    ForEach(items) { item in
                        PosterCard(summary: item, onOpen: { router.openAnime(item.bangumiID) })
                    }
                }
            }
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

/// Full grid for a rail / genre / tag with sort + infinite scroll.
struct DiscoverCategoryView: View {
    @Environment(ServerSession.self) private var session
    @Environment(Router.self) private var router
    @Environment(BackdropStore.self) private var backdrop
    let title: String
    let route: BrowseRoute

    @State private var items: [AnimeSummary] = []
    @State private var page = 1
    @State private var loading = false
    @State private var exhausted = false
    @State private var error: String?
    @ObserveInjection private var inject

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                PageHeader(title: title, subtitle: items.isEmpty ? nil : String(localized: "\(items.count) 部"))
                if let error { ErrorBanner(message: error) { Task { await loadMore(reset: true) } } }
                PosterGrid(
                    items: items,
                    onReachEnd: { Task { await loadMore() } },
                    card: { item in PosterCard(summary: item, onOpen: { router.openAnime(item.bangumiID) }) }
                )
                if loading { ProgressView().frame(maxWidth: .infinity).padding() }
            }
            .padding(.horizontal, 40)
            .padding(.top, 20)
            .padding(.bottom, 40)
        }
        .navigationTitle(title)
        .task { backdrop.set(nil, seed: title, dim: 0.6, owner: "category"); await loadMore(reset: true) }
        .onDisappear { backdrop.clear(owner: "category") }
    }

    private func loadMore(reset: Bool = false) async {
        guard !loading, !(exhausted && !reset) else { return }
        if reset { page = 1; exhausted = false; error = nil }
        loading = true
        defer { loading = false }
        do {
            let batch = try await session.client.browse(route: route, page: page)
            if reset { items = batch } else { items += batch.filter { new in !items.contains { $0.id == new.id } } }
            exhausted = batch.isEmpty
            page += 1
        } catch {
            self.error = error.localizedDescription
        }
    }
}
