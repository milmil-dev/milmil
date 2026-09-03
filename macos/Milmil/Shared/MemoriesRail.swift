import MilmilAPI
import SwiftUI

/// "This season, N years ago" rail on Home.
struct MemoriesRail: View {
    let items: Loadable<[AnimeSummary]>
    @Binding var offset: Int
    var onOpen: (AnimeSummary) -> Void
    var onViewAll: (_ year: Int, _ season: Season) -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ObserveInjection private var inject

    var body: some View {
        let target = Season.yearsAgo(offset)
        let loaded = items.value
        Group {
            if loaded?.isEmpty == true {
                EmptyView()
            } else {
                content(target: target, loaded: loaded)
            }
        }
        .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: offset)
    }

    private func content(target: (year: Int, season: Season), loaded: [AnimeSummary]?) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text("那年這個季節")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(Theme.ink())
                Spacer()
                Button {
                    onViewAll(target.year, target.season)
                } label: {
                    HStack(spacing: 2) {
                        Text("查看全部")
                        Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold))
                    }
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Theme.Text.tertiary)
                }
                .buttonStyle(.plain)
            }
            HStack(spacing: 0) {
                Text(target.season.label)
                Text(" \(String(target.year))")
                    .monospacedDigit()
                Text(" · ").foregroundStyle(Theme.ink(0.25))
                Text("那時大家都在看")
            }
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(Theme.Text.tertiary)
            .padding(.top, 4)
            .padding(.bottom, 12)

            HStack(spacing: 6) {
                ForEach(Season.memoryOffsets, id: \.self) { years in
                    MemoryEraPill(
                        years: years,
                        year: Season.yearsAgo(years).year,
                        isOn: years == offset
                    ) { offset = years }
                }
            }
            .padding(.bottom, 14)

            if let loaded, !loaded.isEmpty {
                Shelf {
                    ForEach(loaded.prefix(15)) { item in
                        PosterCard(summary: item, onOpen: { onOpen(item) })
                    }
                }
            } else if items.errorMessage == nil {
                ShelfSkeleton()
            }
        }
    }
}

/// Two-line era chip: "10 年前" over the calendar year.
struct MemoryEraPill: View {
    let years: Int
    let year: Int
    let isOn: Bool
    let action: () -> Void
    @State private var hovered = false
    @ObserveInjection private var inject

    var body: some View {
        let label = String(localized: "\(years) 年前")
        Button(action: action) {
            VStack(spacing: 2) {
                Text(label)
                    .font(.system(size: 12, weight: .semibold))
                Text(year, format: .number.grouping(.never))
                    .font(.system(size: 10, weight: .medium))
                    .monospacedDigit()
                    .opacity(0.8)
            }
            .foregroundStyle(isOn ? Theme.accent : (hovered ? Theme.ink(0.7) : Theme.ink(0.4)))
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(
                isOn ? Theme.accent.opacity(0.12) : Theme.ink(hovered ? 0.08 : 0.04),
                in: RoundedRectangle(cornerRadius: 8)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(isOn ? .isSelected : [])
        .onHover { hovered = $0 }
    }
}
