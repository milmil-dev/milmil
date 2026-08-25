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

/// Airing schedule, mirroring the web page: year + season header; the current
/// season shows the weekly timeline (weekday tabs incl. 全部), any other
/// season shows a browse grid.
struct ScheduleView: View {
    @Environment(ServerSession.self) private var session
    @Environment(Router.self) private var router
    @Environment(BackdropStore.self) private var backdrop
    @State private var store: ScheduleStore?
    @State private var weekday: String = Formatters.todayWeekdayJST
    @State private var year = Season.current().year
    @State private var season = Season.current().season
    @AppStorage("schedule.cardSize") private var cardSize = 1
    @AppStorage(DesktopDefaults.weekStart) private var weekStart = "monday"
    @ObserveInjection private var inject

    private var posterWidth: CGFloat { [130, 168, 210][min(max(cardSize, 0), 2)] }
    private var isCurrentSeason: Bool {
        let now = Season.current()
        return year == now.year && season == now.season
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                if isCurrentSeason { weekContent } else { seasonContent }
            }
            .padding(.horizontal, 40)
            .padding(.top, 24)
            .padding(.bottom, 40)
        }
        .navigationTitle("時刻表")
        .task {
            if store == nil { store = ScheduleStore(client: session.client) }
            backdrop.set(nil, seed: "schedule", dim: 0.6, owner: "schedule")
            await store?.loadWeek()
        }
        .task(id: "\(year)-\(season.rawValue)") {
            guard !isCurrentSeason else { return }
            await store?.loadSeason(year: year, season: season)
        }
        .onDisappear { backdrop.clear(owner: "schedule") }
    }

    // MARK: Header — ‹ year › · seasons · card size

    private var header: some View {
        HStack(spacing: 16) {
            HStack(spacing: 2) {
                Button("上一年", systemImage: "chevron.left") { year -= 1 }
                Text(String(year))
                    .font(.system(size: 20, weight: .bold))
                    .monospacedDigit()
                    .frame(minWidth: 56)
                Button("下一年", systemImage: "chevron.right") { year += 1 }
                    .disabled(year > Season.current().year)
            }
            .labelStyle(.iconOnly)
            .buttonStyle(.borderless)
            .foregroundStyle(Theme.Text.secondary)

            headerDivider

            HStack(spacing: 6) {
                ForEach(Season.allCases) { item in
                    SeasonChip(
                        label: item.label,
                        isActive: item == season,
                        isCurrent: year == Season.current().year && item == Season.current().season
                    ) { season = item }
                }
            }

            headerDivider

            CardSizeControl(cardSize: $cardSize)

            if !isCurrentSeason {
                Button("← 回到本季") {
                    year = Season.current().year
                    season = Season.current().season
                }
                .buttonStyle(.plain)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(Theme.accent.opacity(0.7))
            }
            Spacer()
        }
        .animation(.snappy(duration: 0.2), value: isCurrentSeason)
    }

    private var headerDivider: some View {
        Rectangle().fill(Theme.ink(0.08)).frame(width: 1, height: 20)
    }

    // MARK: Week (current season)

    @ViewBuilder
    private var weekContent: some View {
        if let store {
            switch store.week {
            case let .loaded(days):
                let ordered = Weekdays.ordered(days, startingOn: weekStart)
                WeekdayTabBar(days: ordered, selection: $weekday)
                if weekday == WeekdayTabBar.allID {
                    allDays(ordered)
                } else if let day = days.first(where: { $0.weekdayEN == weekday }) {
                    dayHeading(day)
                    dayTimeline(day)
                }
            case let .failed(message):
                ErrorBanner(message: message) { Task { await store.loadWeek() } }
            default:
                ProgressView().frame(maxWidth: .infinity).padding(40)
            }
        }
    }

    private func dayHeading(_ day: CalendarDay) -> some View {
        HStack(spacing: 10) {
            Text(Weekdays.japanese(for: day.weekdayEN))
                .font(.system(size: 18, weight: .semibold))
            Text("\(day.items.count) 部本週節目")
                .font(.system(size: 12))
                .monospacedDigit()
                .foregroundStyle(Theme.Text.muted)
            if day.weekdayEN == Formatters.todayWeekdayJST {
                HStack(spacing: 4) {
                    Circle().fill(Theme.accent).frame(width: 6, height: 6)
                    Text("今天")
                }
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(Theme.accent)
            }
        }
    }

    /// 全部 — every day as a rail row (weekday label + dot on a shared spine)
    /// with its timeline to the right, like the web's all-days grid.
    private func allDays(_ days: [CalendarDay]) -> some View {
        VStack(alignment: .leading, spacing: 36) {
            ForEach(days) { day in
                HStack(alignment: .top, spacing: 24) {
                    railCell(day)
                    if day.items.isEmpty {
                        emptyDay
                    } else {
                        dayTimeline(day, extendLeft: 40)
                    }
                }
            }
        }
        .backgroundPreferenceValue(RailDotsKey.self) { anchors in
            GeometryReader { geo in
                let dots = anchors.map { geo[$0] }
                if let first = dots.first, let last = dots.last, dots.count >= 2 {
                    let spine = Path { p in
                        p.move(to: first)
                        p.addLine(to: CGPoint(x: first.x, y: last.y))
                    }
                    spine.stroke(Theme.accent, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                        .opacity(0.1)
                        .blur(radius: 4)
                    spine.stroke(Theme.ink(0.12), style: StrokeStyle(lineWidth: 1, lineCap: .round))
                }
            }
        }
    }

    private func railCell(_ day: CalendarDay) -> some View {
        let isToday = day.weekdayEN == Formatters.todayWeekdayJST
        return HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .trailing, spacing: 3) {
                Text(Weekdays.japanese(for: day.weekdayEN))
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(isToday ? Theme.accent : Theme.ink(0.7))
                Text(Self.dateLabel(for: day.weekdayEN))
                    .font(.system(size: 11, weight: .medium))
                    .monospacedDigit()
                    .foregroundStyle(Theme.ink(0.3))
                Text("\(day.items.count) 部本週節目")
                    .font(.system(size: 11, weight: .medium))
                    .monospacedDigit()
                    .foregroundStyle(Theme.ink(0.3))
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
            TimelineDot()
                .frame(height: 21)
                .anchorPreference(key: RailDotsKey.self, value: .center) { [$0] }
        }
        .frame(width: 112)
    }

    private var emptyDay: some View {
        Text("本週沒有節目")
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(Theme.Text.muted)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 28)
            .background(Theme.ink(0.03), in: RoundedRectangle(cornerRadius: 12))
    }

    // MARK: Day timeline

    private func dayTimeline(_ day: CalendarDay, extendLeft: CGFloat = 0) -> some View {
        let groups = Dictionary(grouping: day.items) { $0.airTime ?? "00:00" }
        let times = groups.keys.sorted()
        return TimelineFlow(itemSpacing: 28, lineSpacing: 28) {
            ForEach(times, id: \.self) { time in
                timeslotGroup(time: time, items: groups[time] ?? [])
            }
        }
        .padding(.leading, extendLeft > 0 ? 0 : 16)
        .backgroundPreferenceValue(TimelineDotsKey.self) { anchors in
            GeometryReader { geo in
                let path = Self.timelinePath(
                    through: anchors.map { geo[$0] },
                    width: geo.size.width,
                    leftX: extendLeft > 0 ? -extendLeft : 4
                )
                path.stroke(Theme.accent, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    .opacity(0.1)
                    .blur(radius: 4)
                path.stroke(Theme.ink(0.12), style: StrokeStyle(lineWidth: 1, lineCap: .round))
            }
        }
    }

    /// Web timeline path: one horizontal line through each row of time markers.
    private static func timelinePath(through dots: [CGPoint], width: CGFloat, leftX: CGFloat) -> Path {
        var path = Path()
        guard !dots.isEmpty else { return path }
        var rowYs: [CGFloat] = []
        for dot in dots where !rowYs.contains(where: { abs($0 - dot.y) < 20 }) {
            rowYs.append(dot.y)
        }
        for y in rowYs {
            path.move(to: CGPoint(x: leftX, y: y))
            path.addLine(to: CGPoint(x: width - 4, y: y))
        }
        return path
    }

    /// One timeslot: marker row on top, cards flowing underneath. Sized to its
    /// cards so several slots share a row (mirrors the web timeline).
    private func timeslotGroup(time: String, items: [AnimeSummary]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                TimelineDot()
                    .anchorPreference(key: TimelineDotsKey.self, value: .center) { [$0] }
                Text(time)
                    .font(.system(size: 11, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(Theme.accent)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 4)
                    .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 6))
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 6))
                    .overlay {
                        RoundedRectangle(cornerRadius: 6).strokeBorder(Theme.ink(0.06), lineWidth: 1)
                    }
                    .help(Formatters.airTime(time))
            }
            TimelineFlow(itemSpacing: 12, lineSpacing: 16) {
                ForEach(items) { item in
                    PosterCard(
                        title: item.title,
                        cover: item.coverImage,
                        score: item.score,
                        badge: item.nextEpisode.map { "EP \($0)" },
                        width: posterWidth,
                        preview: item,
                        onOpen: { router.open(item) }
                    )
                }
            }
        }
    }

    /// "8月24日" for the given weekday in the current JST week.
    static func dateLabel(for weekdayEN: String) -> String {
        guard let target = Weekdays.order.firstIndex(of: weekdayEN), let tokyo = TimeZone(identifier: "Asia/Tokyo") else { return "" }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = tokyo
        calendar.firstWeekday = 2
        let today = Date.now
        let todayIndex = (calendar.component(.weekday, from: today) + 5) % 7
        guard let date = calendar.date(byAdding: .day, value: target - todayIndex, to: today) else { return "" }
        return date.formatted(Date.FormatStyle(timeZone: tokyo).month(.defaultDigits).day())
    }

    // MARK: Season browse (other seasons)

    @ViewBuilder
    private var seasonContent: some View {
        if let store {
            switch store.seasonal {
            case let .loaded(items):
                PosterGrid(items: items, minWidth: posterWidth) { item in
                    PosterCard(summary: item, width: posterWidth, onOpen: { router.open(item) })
                }
            case let .failed(message):
                ErrorBanner(message: message) { Task { await store.loadSeason(year: year, season: season) } }
            default:
                ProgressView().frame(maxWidth: .infinity).padding(40)
            }
        }
    }
}

// MARK: - Weekday helpers

enum Weekdays {
    static let order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    /// JST-day glyph shown beside the localized name in the tab bar (kept
    /// Japanese in every locale, like the web).
    private static let jstGlyphs = ["月", "火", "水", "木", "金", "土", "日"]

    /// Localized full weekday name for the day heading (月曜日 / Monday / 월요일 …).
    static func japanese(for weekdayEN: String) -> String {
        switch weekdayEN {
        case "Mon": String(localized: "月曜日")
        case "Tue": String(localized: "火曜日")
        case "Wed": String(localized: "水曜日")
        case "Thu": String(localized: "木曜日")
        case "Fri": String(localized: "金曜日")
        case "Sat": String(localized: "土曜日")
        case "Sun": String(localized: "日曜日")
        default: weekdayEN
        }
    }

    /// Rotates the server's Mon-first week to the configured start day
    /// (`monday` | `sunday` | `saturday`), like the web's schedule page.
    static func ordered(_ days: [CalendarDay], startingOn weekStart: String) -> [CalendarDay] {
        let start = ["monday": 0, "sunday": 6, "saturday": 5][weekStart] ?? 0
        let rotated = Array(order[start...]) + Array(order[..<start])
        return rotated.compactMap { weekday in days.first { $0.weekdayEN == weekday } }
    }

    /// "週一 (月)" / "Mon (月)" — the web tab label with the JST glyph.
    static func tabLabel(for weekdayEN: String) -> String {
        guard let idx = order.firstIndex(of: weekdayEN) else { return weekdayEN }
        let name = switch weekdayEN {
        case "Mon": String(localized: "週一")
        case "Tue": String(localized: "週二")
        case "Wed": String(localized: "週三")
        case "Thu": String(localized: "週四")
        case "Fri": String(localized: "週五")
        case "Sat": String(localized: "週六")
        case "Sun": String(localized: "週日")
        default: weekdayEN
        }
        return "\(name) (\(jstGlyphs[idx]))"
    }
}

// MARK: - Weekday tab bar (underline style, like the web)

private struct WeekdayTabBar: View {
    static let allID = "all"
    let days: [CalendarDay]
    @Binding var selection: String
    @Namespace private var underline

    var body: some View {
        HStack(alignment: .bottom, spacing: 0) {
            tab(id: Self.allID, isToday: false) {
                Text("全部")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(selection == Self.allID ? Theme.accent : Theme.Text.tertiary)
            }
            Rectangle().fill(Theme.ink(0.06)).frame(width: 1, height: 16).padding(.horizontal, 2).padding(.bottom, 10)
            ForEach(days) { day in
                tab(id: day.weekdayEN, isToday: day.weekdayEN == Formatters.todayWeekdayJST) {
                    HStack(spacing: 4) {
                        Text(Weekdays.tabLabel(for: day.weekdayEN))
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(selection == day.weekdayEN ? Theme.accent : Theme.ink(0.8))
                        Text(ScheduleView.dateLabel(for: day.weekdayEN))
                            .font(.system(size: 10, weight: .medium))
                            .monospacedDigit()
                            .foregroundStyle(Theme.ink(0.4))
                    }
                }
            }
            Spacer()
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: selection)
    }

    private func tab(id: String, isToday: Bool, @ViewBuilder label: () -> some View) -> some View {
        Button {
            selection = id
        } label: {
            HStack(spacing: 6) {
                label()
                if isToday, selection != id {
                    Circle().fill(Theme.accent).frame(width: 4, height: 4)
                }
            }
            .padding(.horizontal, 12)
            .padding(.top, 8)
            .padding(.bottom, 10)
            .overlay(alignment: .bottom) {
                if selection == id {
                    Capsule()
                        .fill(Theme.accent)
                        .frame(height: 2)
                        .padding(.horizontal, 4)
                        .matchedGeometryEffect(id: "underline", in: underline)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Season chip

private struct SeasonChip: View {
    let label: String
    let isActive: Bool
    let isCurrent: Bool
    let action: () -> Void
    @State private var hovered = false

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(isActive ? Theme.accent : (hovered ? Theme.Text.secondary : Theme.Text.tertiary))
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(
                    isActive ? Theme.accent.opacity(0.15) : Theme.ink(hovered ? 0.04 : 0),
                    in: RoundedRectangle(cornerRadius: 8)
                )
                .overlay(alignment: .topTrailing) {
                    if isCurrent, !isActive {
                        Circle().fill(Theme.accent).frame(width: 4, height: 4).padding(4)
                    }
                }
        }
        .buttonStyle(.plain)
        .onHover { hovered = $0 }
        .animation(.easeOut(duration: 0.15), value: hovered)
    }
}

// MARK: - Card size control (poster glyph buttons, like the web)

private struct CardSizeControl: View {
    @Binding var cardSize: Int

    private static let labels = [String(localized: "小卡片"), String(localized: "中卡片"), String(localized: "大卡片")]
    private static let glyphSizes: [CGSize] = [CGSize(width: 8, height: 10), CGSize(width: 10, height: 13), CGSize(width: 13, height: 16)]

    var body: some View {
        HStack(spacing: 2) {
            ForEach(0..<3) { index in
                SizeButton(
                    label: Self.labels[index],
                    glyph: Self.glyphSizes[index],
                    isActive: cardSize == index
                ) { cardSize = index }
            }
        }
        .padding(2)
        .background(.black.opacity(0.15), in: RoundedRectangle(cornerRadius: 8))
    }

    private struct SizeButton: View {
        let label: String
        let glyph: CGSize
        let isActive: Bool
        let action: () -> Void
        @State private var hovered = false

        var body: some View {
            Button(action: action) {
                RoundedRectangle(cornerRadius: 3)
                    .strokeBorder(isActive ? Theme.accent.opacity(0.75) : Theme.ink(hovered ? 0.6 : 0.45), lineWidth: 1)
                    .background(
                        RoundedRectangle(cornerRadius: 3).fill(isActive ? Theme.accent.opacity(0.15) : Theme.ink(0.03))
                    )
                    .overlay(alignment: .bottom) {
                        Capsule().fill(Theme.ink(0.55)).frame(height: 1).padding(.horizontal, 2.5).padding(.bottom, 2.5)
                    }
                    .frame(width: glyph.width, height: glyph.height)
                    .frame(width: 28, height: 28)
                    .background(Theme.ink(isActive ? 0.12 : (hovered ? 0.06 : 0)), in: RoundedRectangle(cornerRadius: 6))
                    .overlay(alignment: .bottom) {
                        if isActive {
                            Capsule().fill(Theme.accent).frame(width: 10, height: 2).padding(.bottom, 2)
                        }
                    }
            }
            .buttonStyle(.plain)
            .onHover { hovered = $0 }
            .help(label)
            .accessibilityLabel(label)
        }
    }
}

// MARK: - Timeline marker dot

/// Accent dot with a soft glow halo and outer ring, like the web marker.
private struct TimelineDot: View {
    var body: some View {
        ZStack {
            Circle().fill(Theme.accent.opacity(0.25)).frame(width: 16, height: 16).blur(radius: 3)
            Circle().strokeBorder(Theme.accent.opacity(0.3), lineWidth: 1.5).frame(width: 15, height: 15)
            Circle().fill(Theme.accent).frame(width: 9, height: 9)
                .shadow(color: Theme.accent.opacity(0.4), radius: 3)
        }
        .frame(width: 16, height: 16)
    }
}

// MARK: - Preference keys

/// Centers of the time-marker dots, collected so the timeline can draw a
/// connecting line through them (mirrors the web's SVG path).
private struct TimelineDotsKey: PreferenceKey {
    static let defaultValue: [Anchor<CGPoint>] = []
    static func reduce(value: inout [Anchor<CGPoint>], nextValue: () -> [Anchor<CGPoint>]) {
        value.append(contentsOf: nextValue())
    }
}

/// Centers of the rail dots in the 全部 view, for the shared vertical spine.
private struct RailDotsKey: PreferenceKey {
    static let defaultValue: [Anchor<CGPoint>] = []
    static func reduce(value: inout [Anchor<CGPoint>], nextValue: () -> [Anchor<CGPoint>]) {
        value.append(contentsOf: nextValue())
    }
}

// MARK: - Flow layout

/// Flow layout for the airing timeline. Unlike `FlowLayout` it measures each
/// subview against the container width (so a nested `TimelineFlow` can wrap
/// its cards) and reports the width actually used, letting nested groups be
/// packed side by side like the web timeline's flex-wrap.
struct TimelineFlow: Layout {
    var itemSpacing: CGFloat = 12
    var lineSpacing: CGFloat = 16

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, usedWidth: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(ProposedViewSize(width: width, height: nil))
            if x > 0, x + size.width > width {
                usedWidth = max(usedWidth, x - itemSpacing)
                x = 0
                y += rowHeight + lineSpacing
                rowHeight = 0
            }
            x += size.width + itemSpacing
            rowHeight = max(rowHeight, size.height)
        }
        if x > 0 { usedWidth = max(usedWidth, x - itemSpacing) }
        return CGSize(width: min(usedWidth, width), height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(ProposedViewSize(width: bounds.width, height: nil))
            if x > bounds.minX, x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + lineSpacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + itemSpacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
