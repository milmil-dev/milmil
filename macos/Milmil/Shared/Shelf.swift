import SwiftUI

/// Horizontal, page-aligned row with edge chevrons that appear on hover —
/// the Apple TV shelf. `scrollClipDisabled` lets hovered cards lift
/// outside the row's bounds.
struct Shelf<Content: View>: View {
    var spacing: CGFloat = 14
    @ViewBuilder var content: () -> Content

    @State private var hovering = false
    @State private var scrollPosition = ScrollPosition(edge: .leading)
    @State private var viewport: CGFloat = 0
    @State private var offsetX: CGFloat = 0
    @State private var contentWidth: CGFloat = 0

    private var canGoBack: Bool { offsetX > 8 }
    private var canGoForward: Bool { contentWidth - offsetX - viewport > 8 }

    var body: some View {
        ScrollView(.horizontal) {
            LazyHStack(alignment: .top, spacing: spacing) {
                content()
            }
            .scrollTargetLayout()
            .padding(.vertical, 10)
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { contentWidth = $0 }
        }
        // `.never`: with "Show scroll bars: Always" a `.hidden` indicator still
        // paints a legacy bar under the shelf; the hover chevrons replace it.
        .scrollIndicators(.never)
        .scrollTargetBehavior(.viewAligned(limitBehavior: .automatic))
        .scrollClipDisabled()
        .scrollPosition($scrollPosition)
        .onScrollGeometryChange(for: CGFloat.self) { $0.contentOffset.x } action: { _, new in offsetX = new }
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { viewport = $0 }
        .overlay(alignment: .leading) { chevron("chevron.left", visible: hovering && canGoBack) { page(-1) } }
        .overlay(alignment: .trailing) { chevron("chevron.right", visible: hovering && canGoForward) { page(1) } }
        .onHover { hovering = $0 }
        .padding(.vertical, -10)
        .focusSection()
    }

    private func page(_ direction: CGFloat) {
        let target = max(0, min(contentWidth - viewport, offsetX + direction * viewport * 0.75))
        withAnimation(.snappy(duration: 0.35)) {
            scrollPosition.scrollTo(x: target)
        }
    }

    private func chevron(_ symbol: String, visible: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 32, height: 32)
                .background(.ultraThinMaterial, in: Circle())
                .overlay(Circle().strokeBorder(.white.opacity(0.12)))
                .shadow(color: .black.opacity(0.4), radius: 8, y: 3)
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 6)
        .opacity(visible ? 1 : 0)
        .animation(.easeOut(duration: 0.15), value: visible)
        .accessibilityHidden(!visible)
    }
}
