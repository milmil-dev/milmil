import MilmilAPI
import SwiftUI

struct HomeView: View {
    @Environment(ServerSession.self) private var session
    @Environment(Router.self) private var router
    @Environment(BackdropStore.self) private var backdrop
    @Environment(PlayerCoordinator.self) private var playerCoordinator
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var store: HomeStore?
    /// Web BannerImage: the banner fades to near-nothing once scrolled past
    /// the hero; remembered so a carousel rotation doesn't reset it.
    @State private var scrollDim = 0.0
    /// Default 10 years ago — same nostalgia peak as web Home.
    @State private var memoryOffset = 10
    @ObserveInjection private var inject

    var body: some View {
        Group {
            if let store {
                content(store)
            } else {
                Color.clear
            }
        }
        .task {
            if store == nil { store = HomeStore(client: session.client) }
            await store?.load()
        }
        .task(id: memoryOffset) {
            if store == nil { store = HomeStore(client: session.client) }
            await store?.loadMemories(offset: memoryOffset)
        }
        .task(id: session.eventGeneration) {
            // Realtime events are invalidation hints; only the ones that can
            // move 繼續觀看 refetch it (download progress and job ticks arrive
            // every few seconds and would just churn the row).
            guard session.eventGeneration > 0, let type = session.lastEvent?.type, Self.continueWatchingEvents.contains(type) else { return }
            await store?.loadContinueWatching()
        }
    }

    private static let continueWatchingEvents: Set<String> = [
        "notification:new", "sync:pulled", "scan:completed", "match:completed", "download:added",
    ]

    private func content(_ store: HomeStore) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                heroSection(store)
                chipRows(store)
                continueSection(store)
                todaySection(store)
                ForEach(Array(store.rails.enumerated()), id: \.element.id) { index, rail in
                    railSection(rail, index: index)
                    if rail.id == "lastSeason" {
                        MemoriesRail(
                            items: store.memoryItems,
                            offset: $memoryOffset,
                            onOpen: { router.open($0) },
                            onViewAll: { year, season in
                                router.openSearch(SearchPrefill(year: year, season: season, sort: .popularity))
                            }
                        )
                        .animation(.spring(duration: 0.55, bounce: 0).delay(Double(index + 1) * 0.06), value: store.memoryItems.value != nil)
                    }
                }
                if session.offlineSince != nil {
                    Label("連唔到 server，只顯示本機可播嘅內容", systemImage: "arrow.down.circle")
                        .font(.system(size: 12)).foregroundStyle(Theme.Text.secondary)
                }
            }
            .padding(.horizontal, 40)
            .padding(.top, 24)
            .padding(.bottom, 40)
        }
        .scrollIndicators(.automatic)
        .onScrollGeometryChange(for: Double.self) { geometry in
            let raw = min(0.55, max(0, (geometry.contentOffset.y - 120) / 480))
            return (raw * 20).rounded() / 20
        } action: { _, dim in
            scrollDim = dim
            backdrop.setDim(dim, owner: "home")
        }
    }

    private func play(_ request: PlaybackRequest) {
        playerCoordinator.play(request)
        router.openWatch(bangumiID: request.bangumiID, episodeID: request.episodeID)
    }

    @ViewBuilder
    private func heroSection(_ store: HomeStore) -> some View {
        switch store.trending {
        case .loaded where !store.heroItems.isEmpty:
            HeroCarousel(
                items: store.heroItems,
                onOpen: { router.open($0) },
                onPlay: { play(PlaybackRequest(bangumiID: $0.bangumiID, title: $0.title, coverImage: $0.coverImage)) },
                onActiveChange: { backdrop.set($0.bannerImage ?? $0.coverImage, seed: $0.title, dim: scrollDim, owner: "home") }
            )
            .padding(.top, 40)
        case let .failed(message):
            ErrorBanner(message: message) { Task { await store.loadTrending() } }
        default:
            HeroSkeleton()
                .padding(.top, 40)
        }
    }

    private func chipRows(_ store: HomeStore) -> some View {
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
    private func continueSection(_ store: HomeStore) -> some View {
        if let entries = store.continueWatching.value, !entries.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                SectionHeader(title: String(localized: "繼續觀看"), moreTitle: String(localized: "歷史")) { router.push(.history) }
                Shelf {
                    ForEach(entries) { entry in
                        StillCard(
                            entry: entry,
                            onPlay: {
                                if let id = entry.animeBangumiID {
                                    play(PlaybackRequest(
                                        bangumiID: id, episodeID: entry.episodeID, title: entry.displayTitle, coverImage: entry.animeCoverImage
                                    ))
                                }
                            },
                            onOpen: { if let id = entry.animeBangumiID { router.openAnime(id) } },
                            onRemove: { Task { await store.remove(entry) } },
                            onMarkWatched: { Task { await store.markWatched(entry) } }
                        )
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func todaySection(_ store: HomeStore) -> some View {
        if let day = store.today.value ?? nil, !day.items.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                SectionHeader(
                    title: String(localized: "今日時刻表"),
                    count: Weekdays.japanese(for: day.weekdayEN),
                    moreTitle: String(localized: "時刻表")
                ) { router.select(.schedule) }
                Shelf {
                    ForEach(day.items) { item in
                        PosterCard(
                            title: item.title,
                            cover: item.coverImage,
                            score: item.score,
                            badge: item.nextEpisode.map { "EP \($0)" },
                            preview: item,
                            onOpen: { router.open(item) }
                        )
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func railSection(_ rail: HomeStore.Rail, index: Int) -> some View {
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

    private func railContent(_ rail: HomeStore.Rail, items: [AnimeSummary]) -> some View {
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

/// Same footprint as the loaded hero so the page does not jump.
struct HeroSkeleton: View {
    var body: some View {
        HStack(spacing: 32) {
            SkeletonBox().frame(width: 220, height: 330)
            VStack(alignment: .leading, spacing: 14) {
                SkeletonText(width: 360, height: 34)
                SkeletonText(width: 280, height: 18)
                SkeletonText(width: 560, height: 13)
                SkeletonText(width: 500, height: 13)
                HStack(spacing: 10) {
                    SkeletonBox(cornerRadius: 15).frame(width: 110, height: 30)
                    SkeletonBox(cornerRadius: 15).frame(width: 70, height: 30)
                }
            }
            Spacer()
        }
        .frame(minHeight: 400)
        .shimmering()
        .accessibilityLabel("載入中")
    }
}

#if DEBUG
#Preview("Home") {
    PreviewHost(phase: .ready(Preview.profile, user: Preview.user, version: "0.1.17")) {
        MainShellView(profile: Preview.profile, user: Preview.user, version: "0.1.17")
    }
}
#endif
