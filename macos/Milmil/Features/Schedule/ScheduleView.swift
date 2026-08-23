import MilmilAPI
import SwiftUI

@Observable
final class ScheduleStore {
    private(set) var week: Loadable<[CalendarDay]> = .idle
    private(set) var seasonal: Loadable<[AnimeSummary]> = .idle
    private var seasonalKey: String?
    private let client: APIClient

    init(client: APIClient) {
        self.client = client
    }

    func loadWeek() async {
        week = week.reloading
        week = await week.reloaded { try await client.calendar() }
    }

    func loadSeason(year: Int, season: Season) async {
        let key = "\(year)-\(season.rawValue)"
        guard key != seasonalKey || seasonal.value == nil else { return }
        seasonalKey = key
        seasonal = .loading
        seasonal = await seasonal.reloaded {
            try await client.browse(BrowseQuery(sort: .popularity, year: year, season: season.rawValue))
        }
    }
}

enum ScheduleMode: String, CaseIterable, Identifiable {
    case week, season
    var id: String { rawValue }
    var label: String { self == .week ? String(localized: "本週") : String(localized: "季度") }
}

/// Weekly airing timeline (grouped by JST air time) and seasonal browse.
struct ScheduleView: View {
    @Environment(ServerSession.self) private var session
    @Environment(Router.self) private var router
    @Environment(BackdropStore.self) private var backdrop
    @State private var store: ScheduleStore?
    @State private var mode: ScheduleMode = .week
    @State private var weekday: String = Formatters.todayWeekdayJST
    @State private var year = Season.current().year
    @State private var season = Season.current().season
    @AppStorage("schedule.cardSize") private var cardSize = 1
    @ObserveInjection private var inject

    private var posterWidth: CGFloat { [130, 168, 210][cardSize] }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                if mode == .week { weekContent } else { seasonContent }
            }
            .padding(.horizontal, 40)
            .padding(.top, 20)
            .padding(.bottom, 40)
        }
        .navigationTitle("時刻表")
        .task {
            if store == nil { store = ScheduleStore(client: session.client) }
            backdrop.set(nil, seed: "schedule", dim: 0.6, owner: "schedule")
            await store?.loadWeek()
        }
        .task(id: "\(year)-\(season.rawValue)-\(mode.rawValue)") {
            guard mode == .season else { return }
            await store?.loadSeason(year: year, season: season)
        }
        .onDisappear { backdrop.clear(owner: "schedule") }
    }

    private var header: some View {
        HStack(spacing: 16) {
            Segmented(options: ScheduleMode.allCases, selection: $mode) { $0.label }
            if mode == .season {
                HStack(spacing: 6) {
                    Button { year -= 1 } label: { Image(systemName: "chevron.left") }
                    Text(String(year)).font(.system(size: 20, weight: .bold)).monospacedDigit()
                    Button { year += 1 } label: { Image(systemName: "chevron.right") }
                }
                .buttonStyle(.borderless)
                Segmented(options: Season.allCases, selection: $season) { $0.label }
            }
            Spacer()
            Text("時區：JST 與本地時間").font(.system(size: 12)).foregroundStyle(Theme.Text.tertiary)
            Picker("卡片大小", selection: $cardSize) {
                Text("S").tag(0)
                Text("M").tag(1)
                Text("L").tag(2)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .fixedSize()
        }
    }

    // MARK: Week

    @ViewBuilder
    private var weekContent: some View {
        if let store {
            switch store.week {
            case let .loaded(days):
                weekdayTabs(days)
                if let day = days.first(where: { $0.weekdayEN == weekday }) {
                    dayTimeline(day)
                }
            case let .failed(message):
                ErrorBanner(message: message) { Task { await store.loadWeek() } }
            default:
                ProgressView().frame(maxWidth: .infinity).padding(40)
            }
        }
    }

    private func weekdayTabs(_ days: [CalendarDay]) -> some View {
        HStack(spacing: 4) {
            ForEach(days) { day in
                let isOn = day.weekdayEN == weekday
                Button {
                    weekday = day.weekdayEN
                } label: {
                    HStack(spacing: 6) {
                        Text(day.weekday)
                        Text(Self.dateLabel(for: day.weekdayEN))
                            .font(.system(size: 10))
                            .foregroundStyle(isOn ? Theme.accent : Theme.Text.muted)
                        if day.weekdayEN == Formatters.todayWeekdayJST {
                            Circle().fill(Theme.accent).frame(width: 5, height: 5)
                        }
                    }
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(isOn ? .white : Theme.Text.tertiary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(isOn ? .white.opacity(0.12) : .clear, in: Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(3)
        .background(.white.opacity(0.06), in: Capsule())
    }

    private func dayTimeline(_ day: CalendarDay) -> some View {
        let unknown = String(localized: "時間未定")
        let groups = Dictionary(grouping: day.items) { $0.airTime ?? unknown }
        let times = groups.keys.sorted { a, b in
            if a == unknown { return false }
            if b == unknown { return true }
            return a < b
        }
        return VStack(alignment: .leading, spacing: 24) {
            HStack(spacing: 10) {
                Text(day.weekday).font(.system(size: 18, weight: .bold))
                Text("\(day.items.count) 部本週節目").font(.system(size: 12)).foregroundStyle(Theme.Text.tertiary)
                if day.weekdayEN == Formatters.todayWeekdayJST {
                    Label("今天", systemImage: "circle.fill")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Theme.accent)
                        .imageScale(.small)
                }
            }
            ForEach(times, id: \.self) { time in
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 10) {
                        Circle().fill(Theme.accent.opacity(0.5)).frame(width: 10, height: 10)
                            .overlay(Circle().strokeBorder(Theme.accent.opacity(0.2), lineWidth: 3).frame(width: 16, height: 16))
                        Chip(text: time).monospacedDigit()
                        if time != unknown, let local = Formatters.localTime(fromJST: time), local != time {
                            Text("本地 \(local)").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                        }
                        Rectangle().fill(.white.opacity(0.06)).frame(height: 1)
                    }
                    PosterGrid(items: groups[time] ?? [], minWidth: posterWidth) { item in
                        PosterCard(
                            title: item.title,
                            cover: item.coverImage,
                            score: item.score,
                            badge: item.nextEpisode.map { "EP \($0)" },
                            width: posterWidth,
                            onOpen: { router.openAnime(item.bangumiID) }
                        )
                    }
                }
            }
        }
    }

    /// "4月21日" for the given weekday in the current JST week.
    private static func dateLabel(for weekdayEN: String) -> String {
        let order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        guard let target = order.firstIndex(of: weekdayEN), let tokyo = TimeZone(identifier: "Asia/Tokyo") else { return "" }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = tokyo
        calendar.firstWeekday = 2
        let today = Date()
        let todayIndex = (calendar.component(.weekday, from: today) + 5) % 7
        guard let date = calendar.date(byAdding: .day, value: target - todayIndex, to: today) else { return "" }
        return date.formatted(Date.FormatStyle(timeZone: tokyo).month(.defaultDigits).day())
    }

    // MARK: Season

    @ViewBuilder
    private var seasonContent: some View {
        if let store {
            switch store.seasonal {
            case let .loaded(items):
                PosterGrid(items: items, minWidth: posterWidth) { item in
                    PosterCard(summary: item, width: posterWidth, onOpen: { router.openAnime(item.bangumiID) })
                }
            case let .failed(message):
                ErrorBanner(message: message) { Task { await store.loadSeason(year: year, season: season) } }
            default:
                ProgressView().frame(maxWidth: .infinity).padding(40)
            }
        }
    }
}
