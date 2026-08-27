import SwiftUI

// The list pages (收藏, 觀看歷史, 通知, 下載, 媒體庫) share one control
// vocabulary: a hairline bar with underline filter tabs on the left and the
// page's controls on the right, capsule search / menu chips, grouped list
// cards with inset separators, and small circular row actions that only
// surface on hover.

// MARK: - Control bar

/// Filter tabs (left, bottom-aligned so their underline sits on the
/// hairline) and trailing controls, separated from the content by a
/// full-width hairline. Replaces the old `PageHeader` title + control row.
struct PageBar<Leading: View, Trailing: View>: View {
    @ViewBuilder var leading: () -> Leading
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(alignment: .bottom, spacing: 12) {
            leading()
            Spacer(minLength: 12)
            HStack(spacing: 8) { trailing() }
                .padding(.bottom, 4)
        }
        .overlay(alignment: .bottom) {
            Rectangle().fill(Theme.ink(0.08)).frame(height: 1)
        }
    }
}

extension PageBar where Trailing == EmptyView {
    init(@ViewBuilder leading: @escaping () -> Leading) {
        self.init(leading: leading) { EmptyView() }
    }
}

struct FilterTab<Value: Hashable>: Identifiable {
    let value: Value
    let label: String
    /// Item count: shown as a pill when > 0; a tab with exactly 0 is dimmed.
    var badge: Int?
    var id: Value { value }
}

/// Underline tabs with count pills, matching the web's collection tabs and
/// the schedule's weekday bar. The underline slides between tabs.
struct FilterTabs<Value: Hashable>: View {
    let tabs: [FilterTab<Value>]
    @Binding var selection: Value
    @Namespace private var underline

    var body: some View {
        HStack(alignment: .bottom, spacing: 2) {
            ForEach(tabs) { tab in
                FilterTabButton(tab: tab, isOn: tab.value == selection, underline: underline) {
                    selection = tab.value
                }
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: selection)
    }
}

private struct FilterTabButton<Value: Hashable>: View {
    let tab: FilterTab<Value>
    let isOn: Bool
    let underline: Namespace.ID
    let action: () -> Void
    @State private var hovered = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Text(tab.label)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(labelColor)
                if let badge = tab.badge, badge > 0 {
                    Text("\(badge)")
                        .font(.system(size: 10, weight: .bold))
                        .monospacedDigit()
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1.5)
                        .background(isOn ? Theme.accent.opacity(0.18) : Theme.ink(0.06), in: Capsule())
                        .foregroundStyle(isOn ? Theme.accent : Theme.ink(0.45))
                }
            }
            .padding(.horizontal, 10)
            .padding(.top, 6)
            .padding(.bottom, 10)
            .overlay(alignment: .bottom) {
                if isOn {
                    Capsule()
                        .fill(Theme.accent)
                        .frame(height: 2)
                        .padding(.horizontal, 6)
                        .matchedGeometryEffect(id: "underline", in: underline)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovered = $0 }
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }

    private var labelColor: Color {
        if isOn { return Theme.accent }
        if hovered { return Theme.Text.primary }
        return tab.badge == 0 ? Theme.Text.muted : Theme.Text.tertiary
    }
}

// MARK: - Chips

/// Capsule search box with a leading magnifier and a clear button; the
/// caller debounces `text` (`.task(id:)`) so typing filters as you go.
struct SearchField: View {
    let prompt: String
    @Binding var text: String
    var width: CGFloat = 220
    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.ink(focused ? 0.6 : 0.35))
            TextField(text: $text, prompt: Text(prompt).foregroundStyle(Theme.ink(0.3))) { EmptyView() }
                .textFieldStyle(.plain)
                .font(.system(size: 12.5))
                .focused($focused)
            if !text.isEmpty {
                Button { text = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.ink(0.35))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("清除搜尋")
            }
        }
        .padding(.horizontal, 9)
        .frame(width: width, height: 28)
        .background(Theme.ink(focused ? 0.08 : 0.05), in: Capsule())
        .overlay(Capsule().strokeBorder(focused ? Theme.accent.opacity(0.5) : Theme.ink(0.08), lineWidth: 1))
        .animation(.easeOut(duration: 0.15), value: focused)
    }
}

/// Capsule chip that opens a menu (sort order, more actions).
struct ChipMenu<Content: View>: View {
    let title: String
    var symbol: String?
    @ViewBuilder var content: () -> Content
    @State private var hovered = false

    var body: some View {
        Menu(content: content) {
            HStack(spacing: 5) {
                if let symbol {
                    Image(systemName: symbol).font(.system(size: 11, weight: .semibold))
                }
                Text(title).font(.system(size: 12.5, weight: .medium))
                Image(systemName: "chevron.up.chevron.down").font(.system(size: 8, weight: .bold)).foregroundStyle(Theme.ink(0.4))
            }
            .foregroundStyle(Theme.Text.secondary)
            .padding(.horizontal, 10)
            .frame(height: 28)
            .background(Theme.ink(hovered ? 0.08 : 0.05), in: Capsule())
            .overlay(Capsule().strokeBorder(Theme.ink(0.08), lineWidth: 1))
        }
        // `.borderlessButton` on macOS 26 discards the label view's own
        // chrome (capsule, chevron) and paints icon + title in the accent
        // tint; a plain-styled button menu renders the label verbatim.
        .menuStyle(.button)
        .buttonStyle(.plain)
        .menuIndicator(.hidden)
        .fixedSize()
        .onHover { hovered = $0 }
    }
}

/// Capsule button beside `ChipMenu` / `SearchField`: quiet ink chip by
/// default, accent fill when `prominent` (the page's one primary action,
/// e.g. 掃描 / 新增). `busy` swaps the symbol for a spinner.
struct ChipButton: View {
    let title: String
    var symbol: String?
    var prominent = false
    var busy = false
    let action: () -> Void
    @State private var hovered = false
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                if busy {
                    ProgressView().controlSize(.mini).tint(foreground)
                } else if let symbol {
                    Image(systemName: symbol).font(.system(size: 11, weight: .bold))
                }
                Text(title).font(.system(size: 12.5, weight: prominent ? .semibold : .medium))
            }
            .foregroundStyle(foreground)
            .padding(.horizontal, prominent ? 13 : 10)
            .frame(height: 28)
            .background(background, in: Capsule())
            .overlay(Capsule().strokeBorder(prominent ? .clear : Theme.ink(0.08), lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .fixedSize()
        .opacity(isEnabled ? 1 : 0.5)
        .onHover { hovered = $0 }
        .animation(.easeOut(duration: 0.12), value: hovered)
    }

    private var foreground: Color {
        if prominent { return .white }
        return hovered ? Theme.Text.primary : Theme.Text.secondary
    }

    private var background: Color {
        if prominent { return hovered && isEnabled ? Theme.accent.opacity(0.85) : Theme.accent }
        return Theme.ink(hovered ? 0.08 : 0.05)
    }
}

/// Small live indicator ("↓ 2.3 MB/s", "3 未讀") in the control bar.
struct StatusPill: View {
    let text: String
    var symbol: String?
    var tint: Color = Theme.accent

    var body: some View {
        HStack(spacing: 4) {
            if let symbol {
                Image(systemName: symbol).font(.system(size: 9, weight: .bold))
            }
            Text(text).font(.system(size: 11, weight: .semibold)).monospacedDigit()
        }
        .foregroundStyle(tint)
        .padding(.horizontal, 8)
        .frame(height: 22)
        .background(tint.opacity(0.14), in: Capsule())
    }
}

// MARK: - Rows

/// 28 pt circular icon button for row actions. `prominent` = accent fill,
/// the row's one primary action; everything else stays quiet until hover.
struct RowIconButton: View {
    let symbol: String
    let label: String
    var prominent = false
    var destructive = false
    let action: () -> Void
    @State private var hovered = false

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(foreground)
                .frame(width: 28, height: 28)
                .background(background, in: Circle())
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .onHover { hovered = $0 }
        .help(label)
        .accessibilityLabel(label)
        .animation(.easeOut(duration: 0.12), value: hovered)
    }

    private var foreground: Color {
        if prominent { return .white }
        if destructive, hovered { return Color(hex: 0xF87171) }
        return hovered ? Theme.Text.primary : Theme.Text.secondary
    }

    private var background: Color {
        if prominent { return hovered ? Theme.accent.opacity(0.85) : Theme.accent }
        if destructive, hovered { return Color(hex: 0xF87171).opacity(0.14) }
        return Theme.ink(hovered ? 0.12 : 0.06)
    }
}

/// Inset hairline between rows of a grouped card.
struct RowDivider: View {
    var inset: CGFloat = 14

    var body: some View {
        Rectangle().fill(Theme.ink(0.06)).frame(height: 1).padding(.leading, inset)
    }
}

/// Small "進行中 · 3" label above a grouped card.
struct SectionLabel: View {
    let title: String
    var count: Int?

    var body: some View {
        HStack(spacing: 6) {
            Text(title).font(.system(size: 12, weight: .bold)).foregroundStyle(Theme.Text.tertiary)
            if let count {
                Text("\(count)").font(.system(size: 11, weight: .semibold)).monospacedDigit().foregroundStyle(Theme.Text.muted)
            }
        }
        .padding(.horizontal, 4)
    }
}

/// Thin capsule progress bar for rows (download progress, matched ratio).
struct ThinProgress: View {
    let fraction: Double
    var tint: Color = Theme.accent
    var height: CGFloat = 3

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.ink(0.08))
                Capsule().fill(tint).frame(width: max(height, proxy.size.width * min(1, max(0, fraction))))
            }
        }
        .frame(height: height)
        .animation(.easeOut(duration: 0.3), value: fraction)
        .accessibilityHidden(true)
    }
}

extension View {
    /// Rounded surface for a stack of rows: faint fill plus a hairline edge.
    func groupedCard() -> some View {
        background(Theme.ink(0.035), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Theme.ink(0.07), lineWidth: 1))
    }
}

// MARK: - Date buckets

/// 今天 / 昨天 / 本週 / 更早 grouping shared by 觀看歷史 and 通知.
enum DateBucket {
    static func title(for date: Date?, calendar: Calendar = .current, now: Date = Date()) -> String {
        guard let date else { return String(localized: "更早") }
        if calendar.isDateInToday(date) { return String(localized: "今天") }
        if calendar.isDateInYesterday(date) { return String(localized: "昨天") }
        if let week = calendar.dateInterval(of: .weekOfYear, for: now), week.contains(date) { return String(localized: "本週") }
        return String(localized: "更早")
    }

    /// Groups `items` (already sorted newest first) into titled buckets,
    /// keeping first-seen order.
    static func group<Item>(_ items: [Item], date: (Item) -> Date?) -> [(title: String, items: [Item])] {
        let calendar = Calendar.current
        let now = Date()
        var groups: [String: [Item]] = [:]
        var order: [String] = []
        for item in items {
            let title = title(for: date(item), calendar: calendar, now: now)
            if groups[title] == nil { order.append(title) }
            groups[title, default: []].append(item)
        }
        return order.map { ($0, groups[$0] ?? []) }
    }
}
