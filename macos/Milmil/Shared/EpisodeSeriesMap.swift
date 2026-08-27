import MilmilAPI
import SwiftUI

/// 全部 / 未看 / 有檔案 — shared by the series page and the player inspector.
/// 未看 leaves out episodes that have not aired yet: nothing to watch there.
enum EpisodeFilter: String, CaseIterable, Identifiable {
    case all, unwatched, available
    var id: String { rawValue }
    var label: String {
        switch self {
        case .all: String(localized: "全部")
        case .unwatched: String(localized: "未看")
        case .available: String(localized: "有檔案")
        }
    }

    func includes(_ episode: PlayableEpisode) -> Bool {
        switch self {
        case .all: true
        case .unwatched: episode.progress?.completed != true && EpisodeStanding(episode) != .unaired
        case .available: episode.hasFile
        }
    }
}

/// Where an episode stands for the series map and its legend.
enum EpisodeStanding: CaseIterable {
    case watched, unwatched, missing, unaired

    init(_ episode: PlayableEpisode) {
        if episode.progress?.completed == true {
            self = .watched
        } else if episode.hasFile {
            self = .unwatched
        } else if let day = Formatters.day(from: episode.airDate), Formatters.daysUntil(day) > 0 {
            self = .unaired
        } else {
            self = .missing
        }
    }

    var label: String {
        switch self {
        case .watched: String(localized: "看過了")
        case .unwatched: String(localized: "未看")
        case .missing: String(localized: "無檔案")
        case .unaired: String(localized: "未播")
        }
    }

    var color: Color {
        switch self {
        case .watched: Theme.accent
        case .unwatched: Theme.ink(0.42)
        case .missing: Theme.ink(0.14)
        case .unaired: Theme.ink(0.07)
        }
    }

    /// Missing and unaired only earn a legend entry when they exist; the
    /// first two are the shape of every series.
    var alwaysListed: Bool { self == .watched || self == .unwatched }
}

/// Legend row (counts, locate, filter) over the cell strip.
struct SeriesMap: View {
    let episodes: [PlayableEpisode]
    let currentID: String?
    @Binding var filter: EpisodeFilter
    let canLocate: Bool
    /// The detail page keeps its own segmented filter beside the heading.
    var showsFilter = true
    let jump: (String) -> Void

    private var counts: [EpisodeStanding: Int] {
        episodes.reduce(into: [:]) { $0[EpisodeStanding($1), default: 0] += 1 }
    }

    var body: some View {
        let counts = counts
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 10) {
                ForEach(EpisodeStanding.allCases, id: \.self) { standing in
                    let count = counts[standing, default: 0]
                    if standing.alwaysListed || count > 0 {
                        legend(standing, count: count)
                    }
                }
                Spacer(minLength: 4)
                Button {
                    if let currentID { jump(currentID) }
                } label: {
                    Image(systemName: "scope")
                }
                .buttonStyle(.plain)
                .foregroundStyle(canLocate ? Theme.Text.secondary : Theme.Text.muted)
                .disabled(!canLocate)
                .help("跳到目前集數")
                .accessibilityLabel("跳到目前集數")
                if showsFilter {
                    filterMenu
                }
            }
            .font(.system(size: 11))
            strip
        }
    }

    private var filterMenu: some View {
        Menu {
            Picker("篩選", selection: $filter) {
                ForEach(EpisodeFilter.allCases) { Text($0.label).tag($0) }
            }
            .pickerStyle(.inline)
        } label: {
            Image(systemName: filter == .all ? "line.3.horizontal.decrease" : "line.3.horizontal.decrease.circle.fill")
                .foregroundStyle(filter == .all ? Theme.Text.secondary : Theme.accent)
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .fixedSize()
        .help("篩選")
    }

    private func legend(_ standing: EpisodeStanding, count: Int) -> some View {
        HStack(spacing: 4) {
            Circle().fill(standing.color).frame(width: 6, height: 6)
            Text(verbatim: String(count))
                .font(.system(size: 11, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(Theme.Text.secondary)
            Text(standing.label)
                .foregroundStyle(Theme.Text.tertiary)
        }
        .lineLimit(1)
    }

    /// One cell per episode; gaps shrink then vanish as the count grows, so
    /// a 12-episode season reads as tiles and a 500-episode run as a bar.
    /// The current episode is drawn taller in the text colour, which stays
    /// distinct from every standing tint.
    private var strip: some View {
        GeometryReader { geo in
            let count = episodes.count
            let gap: CGFloat = count > 60 ? 0 : (count > 26 ? 1 : 2)
            let cell = max((geo.size.width - gap * CGFloat(count - 1)) / CGFloat(count), 0.5)
            Canvas { context, size in
                for (index, episode) in episodes.enumerated() {
                    let x = CGFloat(index) * (cell + gap)
                    let current = episode.episodeID == currentID
                    let rect = current
                        ? CGRect(x: x, y: 0, width: max(cell, 2), height: size.height)
                        : CGRect(x: x, y: 2, width: cell, height: size.height - 4)
                    let radius = min(1.5, rect.width / 2)
                    let color = current ? Theme.Text.primary : EpisodeStanding(episode).color
                    context.fill(Path(roundedRect: rect, cornerRadius: radius), with: .color(color))
                }
            }
            .contentShape(Rectangle())
            .onTapGesture(coordinateSpace: .local) { point in
                let index = Int(point.x / (cell + gap))
                guard episodes.indices.contains(index) else { return }
                jump(episodes[index].episodeID)
            }
        }
        .frame(height: 10)
        .accessibilityHidden(true)
    }
}
