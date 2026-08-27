import MilmilAPI
import SwiftUI

struct HomeView: View {
    @Environment(ServerSession.self) private var session
    @Environment(Router.self) private var router
    @Environment(BackdropStore.self) private var backdrop
    @Environment(PlayerCoordinator.self) private var playerCoordinator
    @State private var store: HomeStore?
    /// Web BannerImage: the banner fades to near-nothing once scrolled past
    /// the hero; remembered so a carousel rotation doesn't reset it.
    @State private var scrollDim = 0.0
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
            VStack(alignment: .leading, spacing: 32) {
                heroSection(store)
                continueSection(store)
                todaySection(store)
                trendingSection(store)
            }
            .padding(.horizontal, 40)
            .padding(.top, 24)
            .padding(.bottom, 40)
        }
        .scrollIndicators(.automatic)
        .onScrollGeometryChange(for: Double.self) { geometry in
            geometry.contentOffset.y > 120 ? 0.95 : 0
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
    private func trendingSection(_ store: HomeStore) -> some View {
        if session.offlineSince != nil {
            Label("連唔到 server，只顯示本機可播嘅內容", systemImage: "arrow.down.circle")
                .font(.system(size: 12)).foregroundStyle(Theme.Text.secondary)
        } else if let items = store.trending.value, !items.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                SectionHeader(title: String(localized: "現在熱門"), moreTitle: String(localized: "探索")) { router.select(.discover) }
                Shelf {
                    ForEach(items) { item in
                        PosterCard(summary: item, onOpen: { router.open(item) })
                    }
                }
            }
        }
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
