import AppKit
import MilmilAPI
import SwiftUI

/// 選單列: Now Playing controls, today's followed airings with a countdown,
/// and a live download summary, so progress is visible without bringing the
/// app forward. Toggleable in 設定 › 播放.
struct MenuBarExtraView: View {
    @Environment(PlayerCoordinator.self) private var player
    @Environment(\.openWindow) private var openWindow
    @State private var downloads: Loadable<[Download]> = .idle
    @State private var airing: [AiringToday] = []
    @ObserveInjection private var inject

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            nowPlaying
            if !airing.isEmpty {
                Divider().padding(.vertical, 8)
                airingSection
            }
            Divider().padding(.vertical, 8)
            downloadsSection
            Divider().padding(.vertical, 8)
            footer
        }
        .padding(14)
        .frame(width: 320)
        .task { await loadAiring() }
        .task { await poll() }
    }

    // MARK: - Airing today

    /// A followed series on today's calendar, with the JST air time on the
    /// local clock and how far away it is.
    struct AiringToday: Identifiable {
        let bangumiID: Int
        let title: String
        let episode: Int?
        let airTime: String
        let airsAt: Date
        var id: Int { bangumiID }
    }

    private var airingSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("今日播出").font(.system(size: 12, weight: .semibold))
            ForEach(airing.prefix(5)) { item in
                Button {
                    NSWorkspace.shared.open(URL(string: "milmil://anime/\(item.bangumiID)")!)
                    NSApp.activate()
                } label: {
                    HStack(spacing: 8) {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(item.episode.map { "\(item.title) EP\($0)" } ?? item.title)
                                .font(.system(size: 11)).lineLimit(1).truncationMode(.middle)
                            Text(verbatim: Formatters.localTime(fromJST: item.airTime) ?? item.airTime)
                                .font(.system(size: 10)).monospacedDigit().foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(Self.countdown(to: item.airsAt))
                            .font(.system(size: 10, weight: .medium)).monospacedDigit()
                            .foregroundStyle(item.airsAt > Date() ? Theme.accent : .secondary)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    /// "2h 15m" until air time, 已播出 once it has passed.
    static func countdown(to date: Date, now: Date = Date()) -> String {
        let seconds = Int(date.timeIntervalSince(now))
        guard seconds > 0 else { return String(localized: "已播出") }
        let hours = seconds / 3600
        let minutes = (seconds % 3600) / 60
        return hours > 0 ? "\(hours)h \(minutes)m" : "\(minutes)m"
    }

    /// Followed = collection status "watching" ∪ enabled download rules with
    /// a Bangumi ID, matched against today's calendar in JST.
    private func loadAiring() async {
        guard let client = player.session?.client else { return }
        async let calendarTask = try? client.calendar()
        async let watchingTask = try? client.collection(status: .watching)
        async let rulesTask = try? client.downloadRules()
        guard let calendar = await calendarTask else { return }
        var followed = Set((await watchingTask ?? []).compactMap(\.bangumiID))
        for rule in await rulesTask ?? [] where rule.enabled {
            if let id = rule.bangumiID { followed.insert(id) }
        }
        airing = Self.airingToday(calendar: calendar, followed: followed)
    }

    static func airingToday(calendar: [CalendarDay], followed: Set<Int>, now: Date = Date()) -> [AiringToday] {
        guard let tokyo = TimeZone(identifier: "Asia/Tokyo") else { return [] }
        var jst = Calendar(identifier: .gregorian)
        jst.timeZone = tokyo
        let weekday = jst.component(.weekday, from: now)
        let today = calendar.first { AiringReminderScheduler.weekdayIndex($0.weekdayEN) == weekday }
        var rows: [AiringToday] = []
        for item in today?.items ?? [] where item.bangumiID > 0 && followed.contains(item.bangumiID) {
            guard let airTime = item.airTime else { continue }
            let parts = airTime.split(separator: ":").compactMap { Int($0) }
            guard parts.count == 2 else { continue }
            var components = jst.dateComponents([.year, .month, .day], from: now)
            components.hour = parts[0]
            components.minute = parts[1]
            guard let airsAt = jst.date(from: components) else { continue }
            rows.append(AiringToday(bangumiID: item.bangumiID, title: item.title, episode: item.nextEpisode, airTime: airTime, airsAt: airsAt))
        }
        return rows.sorted { $0.airsAt < $1.airsAt }
    }

    // MARK: - Now playing

    @ViewBuilder
    private var nowPlaying: some View {
        if let controller = player.controller, !controller.state.mediaTitle.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text(controller.state.mediaTitle)
                    .font(.system(size: 13, weight: .semibold)).lineLimit(2)
                HStack(spacing: 12) {
                    Button { controller.playPrevious() } label: { Image(systemName: "backward.end.fill") }
                        .disabled(controller.previousEpisode == nil)
                    Button { controller.togglePause() } label: {
                        Image(systemName: controller.state.paused ? "play.fill" : "pause.fill").font(.system(size: 16))
                    }
                    Button { controller.playNext() } label: { Image(systemName: "forward.end.fill") }
                        .disabled(controller.nextEpisode == nil)
                    Spacer()
                    if controller.state.duration > 0 {
                        Text(verbatim: "\(Formatters.clock(controller.state.timePos)) / \(Formatters.clock(controller.state.duration))")
                            .font(.system(size: 11)).monospacedDigit().foregroundStyle(.secondary)
                    }
                }
                .buttonStyle(.borderless)
            }
        } else {
            Label("沒有播放中的內容", systemImage: "play.slash")
                .font(.system(size: 12)).foregroundStyle(.secondary)
        }
    }

    // MARK: - Downloads

    @ViewBuilder
    private var downloadsSection: some View {
        let active = (downloads.value ?? []).filter { $0.isActive || $0.isPaused }
        if active.isEmpty {
            Label("沒有進行中的下載", systemImage: "arrow.down.circle")
                .font(.system(size: 12)).foregroundStyle(.secondary)
        } else {
            VStack(alignment: .leading, spacing: 8) {
                let speed = active.reduce(Int64(0)) { $0 + $1.speedBytes }
                HStack {
                    Text("\(active.count) 個下載").font(.system(size: 12, weight: .semibold))
                    Spacer()
                    if speed > 0 {
                        Text(verbatim: "\(ByteCountFormatter.string(fromByteCount: speed, countStyle: .file))/s")
                            .font(.system(size: 11)).monospacedDigit().foregroundStyle(.secondary)
                    }
                }
                ForEach(active.prefix(3)) { download in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(download.displayName).font(.system(size: 11)).lineLimit(1).truncationMode(.middle)
                        ProgressView(value: download.fraction).controlSize(.small)
                    }
                }
                if active.count > 3 {
                    Text("還有 \(active.count - 3) 個…").font(.system(size: 11)).foregroundStyle(.secondary)
                }
            }
        }
    }

    private var footer: some View {
        HStack {
            Button("開啟 milmil") {
                openWindow(id: "main")
                NSApp.activate()
            }
            Button("下載頁") {
                NSWorkspace.shared.open(URL(string: "milmil://downloads")!)
                NSApp.activate()
            }
            Spacer()
            Button("結束") { NSApp.terminate(nil) }
        }
        .controlSize(.small)
    }

    /// Refresh while the popover stays open; the task dies with the view.
    private func poll() async {
        while !Task.isCancelled {
            if let client = player.session?.client {
                downloads = await downloads.reloaded { try await client.downloads() }
            }
            try? await Task.sleep(for: .seconds(3))
        }
    }
}
