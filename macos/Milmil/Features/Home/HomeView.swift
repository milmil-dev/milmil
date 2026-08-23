import MilmilAPI
import SwiftUI

struct HomeView: View {
    @Environment(ServerSession.self) private var session
    @Environment(Router.self) private var router
    @Environment(BackdropStore.self) private var backdrop
    @State private var store: HomeStore?
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
            // Realtime events are invalidation hints: refresh the cheap rows.
            guard session.eventGeneration > 0 else { return }
            await store?.loadContinueWatching()
        }
        .onDisappear { backdrop.clear(owner: "home") }
    }

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
    }

    @ViewBuilder
    private func heroSection(_ store: HomeStore) -> some View {
        switch store.trending {
        case .loaded where !store.heroItems.isEmpty:
            HeroCarousel(
                items: store.heroItems,
                onOpen: { router.openAnime($0.bangumiID) },
                onPlay: { router.openAnime($0.bangumiID) },
                onActiveChange: { backdrop.set($0.bannerImage ?? $0.coverImage, seed: $0.title, owner: "home") }
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
                SectionHeader(title: "繼續睇", moreTitle: "歷史") { router.push(.history) }
                Shelf {
                    ForEach(entries) { entry in
                        StillCard(
                            entry: entry,
                            onPlay: { if let id = entry.animeBangumiID { router.openAnime(id) } },
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
                SectionHeader(title: "今日時刻表", count: day.weekday, moreTitle: "時刻表") { router.select(.schedule) }
                Shelf {
                    ForEach(day.items) { item in
                        PosterCard(
                            title: item.title,
                            cover: item.coverImage,
                            score: item.score,
                            badge: item.nextEpisode.map { "EP \($0)" },
                            subtitle: item.airTime.map(Formatters.airTime),
                            onOpen: { router.openAnime(item.bangumiID) }
                        )
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func trendingSection(_ store: HomeStore) -> some View {
        if let items = store.trending.value, !items.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                SectionHeader(title: "現在熱門", moreTitle: "探索") { router.select(.discover) }
                Shelf {
                    ForEach(items) { item in
                        PosterCard(summary: item, onOpen: { router.openAnime(item.bangumiID) })
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
            RoundedRectangle(cornerRadius: 8).fill(.white.opacity(0.05)).frame(width: 220, height: 330)
            VStack(alignment: .leading, spacing: 14) {
                RoundedRectangle(cornerRadius: 6).fill(.white.opacity(0.05)).frame(width: 360, height: 40)
                RoundedRectangle(cornerRadius: 999).fill(.white.opacity(0.05)).frame(width: 280, height: 20)
                RoundedRectangle(cornerRadius: 6).fill(.white.opacity(0.05)).frame(width: 560, height: 16)
                RoundedRectangle(cornerRadius: 6).fill(.white.opacity(0.05)).frame(width: 500, height: 16)
                HStack(spacing: 10) {
                    Capsule().fill(.white.opacity(0.05)).frame(width: 110, height: 30)
                    Capsule().fill(.white.opacity(0.05)).frame(width: 70, height: 30)
                }
            }
            Spacer()
        }
        .frame(minHeight: 400)
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
