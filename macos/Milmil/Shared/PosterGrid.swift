import MilmilAPI
import SwiftUI

/// Adaptive poster grid used by Search, Discover categories and Collection.
/// Calls `onReachEnd` when the last row becomes visible (infinite scroll).
struct PosterGrid<Item: Identifiable, Card: View>: View {
    let items: [Item]
    var minWidth: CGFloat = 150
    var spacing: CGFloat = 14
    var onReachEnd: (() -> Void)?
    @ViewBuilder var card: (Item) -> Card

    var body: some View {
        let column = GridItem(.adaptive(minimum: minWidth, maximum: minWidth + 40), spacing: spacing, alignment: .top)
        LazyVGrid(columns: [column], alignment: .leading, spacing: spacing + 10) {
            ForEach(items) { item in
                card(item)
                    .onAppear {
                        if item.id == items.last?.id { onReachEnd?() }
                    }
            }
        }
    }
}

/// A segmented control that maps to an enum.
struct Segmented<Option: Hashable & Identifiable>: View {
    let options: [Option]
    @Binding var selection: Option
    let label: (Option) -> String

    var body: some View {
        Picker("", selection: $selection) {
            ForEach(options) { option in
                Text(label(option)).tag(option)
            }
        }
        .pickerStyle(.segmented)
        .labelsHidden()
        .fixedSize()
    }
}

/// Glass-style page header: big title, optional subtitle, trailing accessories.
struct PageHeader<Accessory: View>: View {
    let title: String
    var subtitle: String?
    @ViewBuilder var accessory: () -> Accessory

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 26, weight: .bold))
                    .tracking(-0.3)
                if let subtitle {
                    Text(subtitle)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Text.tertiary)
                }
            }
            Spacer()
            accessory()
        }
    }
}

extension PageHeader where Accessory == EmptyView {
    init(title: String, subtitle: String? = nil) {
        self.init(title: title, subtitle: subtitle) { EmptyView() }
    }
}
