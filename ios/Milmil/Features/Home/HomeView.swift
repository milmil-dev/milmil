import MilmilAPI
import SwiftUI

/// The shelves, from the two endpoints the web home page uses. Both already
/// exist in the shared package — the iOS client adds no networking of its own.
@Observable
@MainActor
final class HomeModel {
    enum State { case loading, ready, failed(String) }

    private(set) var state: State = .loading
    private(set) var hero: AnimeSummary?
    private(set) var today: [AnimeSummary] = []
    private(set) var trending: [AnimeSummary] = []

    private let client: APIClient
    init(client: APIClient) { self.client = client }

    func load() async {
        state = .loading
        do {
            async let trendingCall = client.trending(page: 1)
            async let calendarCall = client.calendar()
            let (trending, week) = try await (trendingCall, calendarCall)
            // The server abbreviates the weekday ("Fri"); compare the first
            // three letters so neither side has to know which the other picked.
            let todayEN = Date.now.formatted(.dateTime.weekday(.abbreviated).locale(.init(identifier: "en_US_POSIX")))
            let wanted = todayEN.prefix(3).lowercased()
            self.trending = trending.deduped()
            self.today = week.first { $0.weekdayEN.prefix(3).lowercased() == wanted }?.items.deduped() ?? []
            self.hero = trending.first { $0.bannerImage != nil } ?? trending.first
            state = .ready
        } catch {
            state = .failed(error.localizedDescription)
        }
    }
}

private extension [AnimeSummary] {
    /// `/discover/browse` and friends can repeat a title — page 1 came back
    /// with 50 rows and 48 distinct ids. SwiftUI tolerates duplicate ids less
    /// gracefully than it looks, and the user should not see a show twice.
    func deduped() -> [AnimeSummary] {
        var seen = Set<Int>()
        return filter { seen.insert($0.bangumiID).inserted }
    }
}

struct HomeView: View {
    let client: APIClient
    @State private var model: HomeModel

    init(client: APIClient) {
        self.client = client
        _model = State(initialValue: HomeModel(client: client))
    }

    var body: some View {
        NavigationStack {
            Group {
                switch model.state {
                case .loading:
                    ProgressView().controlSize(.large).tint(Theme.accent)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                case let .failed(message):
                    ContentUnavailableView("載入失敗", systemImage: "wifi.exclamationmark", description: Text(message))
                case .ready:
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 22) {
                            if let hero = model.hero { HeroCard(anime: hero) }
                            if !model.today.isEmpty { Shelf(title: "今日時間表", items: model.today) }
                            if !model.trending.isEmpty { Shelf(title: "熱門", items: model.trending) }
                        }
                        .padding(.bottom, 24)
                    }
                    .ignoresSafeArea(edges: .top)
                }
            }
            .background(Theme.background)
            .navigationBarHidden(true)
        }
        .task { await model.load() }
    }
}

private struct HeroCard: View {
    let anime: AnimeSummary

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            AsyncImage(url: anime.bannerImage ?? anime.coverImage) { image in
                image.resizable().aspectRatio(contentMode: .fill)
            } placeholder: {
                Theme.background
            }
            .frame(height: 400)
            .clipped()
            // The scrim is what keeps the title readable over arbitrary art.
            LinearGradient(
                stops: [
                    .init(color: Theme.background.opacity(0.55), location: 0),
                    .init(color: Theme.background.opacity(0.05), location: 0.34),
                    .init(color: Theme.background.opacity(0.9), location: 0.84),
                    .init(color: Theme.background, location: 1),
                ],
                startPoint: .top, endPoint: .bottom
            )
            .frame(height: 400)
            VStack(alignment: .leading, spacing: 6) {
                Text(anime.title).font(.title.weight(.bold)).lineLimit(2)
                Text(summary).font(.footnote).foregroundStyle(.secondary)
            }
            .padding(16)
        }
    }

    private var summary: String {
        var parts: [String] = []
        if anime.score > 0 { parts.append("★ \(anime.score.formatted(.number.precision(.fractionLength(0...1))))") }
        if anime.episodeCount > 0 { parts.append("\(anime.episodeCount) 集") }
        return parts.joined(separator: "  ")
    }
}

private struct Shelf: View {
    let title: String
    let items: [AnimeSummary]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(.title3.weight(.semibold)).padding(.horizontal, 16)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 12) {
                    ForEach(items) { anime in
                        VStack(alignment: .leading, spacing: 8) {
                            AsyncImage(url: anime.coverImage) { image in
                                image.resizable().aspectRatio(contentMode: .fill)
                            } placeholder: {
                                RoundedRectangle(cornerRadius: 14).fill(.white.opacity(0.06))
                            }
                            .frame(width: 108, height: 154)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                            Text(anime.title).font(.footnote.weight(.medium)).lineLimit(2)
                        }
                        .frame(width: 108, alignment: .leading)
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }
}
