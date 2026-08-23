import MilmilAPI
import SwiftUI

/// Sidebar destinations, in the order the design canvas shows them.
enum Destination: String, CaseIterable, Identifiable {
    case home, schedule, discover, search
    case collection, history
    case libraries, downloads, notifications

    var id: String { rawValue }

    var title: String {
        switch self {
        case .home: "首頁"
        case .schedule: "時刻表"
        case .discover: "探索"
        case .search: "搜尋"
        case .collection: "收藏"
        case .history: "歷史"
        case .libraries: "媒體庫"
        case .downloads: "下載"
        case .notifications: "通知"
        }
    }

    var symbol: String {
        switch self {
        case .home: "house"
        case .schedule: "calendar"
        case .discover: "flame"
        case .search: "magnifyingglass"
        case .collection: "bookmark"
        case .history: "clock"
        case .libraries: "folder"
        case .downloads: "arrow.down.circle"
        case .notifications: "bell"
        }
    }

    static let sections: [(title: String, items: [Destination])] = [
        ("首頁", [.home, .schedule, .discover, .search]),
        ("我的", [.collection, .history]),
        ("管理", [.libraries, .downloads, .notifications]),
    ]
}

/// Phase 0 shell: the split view with the real sidebar and a placeholder
/// detail that proves the session is live. Feature screens land here in Phase 1.
struct MainShellView: View {
    @Environment(SessionStore.self) private var session
    @ObserveInjection private var inject
    let profile: ServerProfile
    let user: User
    let version: String
    @State private var selection: Destination? = .home

    var body: some View {
        NavigationSplitView {
            List(selection: $selection) {
                ForEach(Destination.sections, id: \.title) { section in
                    Section(section.title) {
                        ForEach(section.items) { item in
                            Label(item.title, systemImage: item.symbol)
                                .tag(item)
                        }
                    }
                }
            }
            .listStyle(.sidebar)
            .navigationSplitViewColumnWidth(min: 200, ideal: 220, max: 260)
            .safeAreaInset(edge: .bottom) {
                SidebarAccountFooter(profile: profile, user: user, version: version)
            }
        } detail: {
            PlaceholderDetail(destination: selection ?? .home, profile: profile, user: user, version: version)
        }
        .navigationTitle(selection?.title ?? "milmil")
        .toolbar {
            ToolbarItem(placement: .navigation) {
                Button("上一頁", systemImage: "chevron.left") {}
                    .disabled(true)
            }
        }
        .tint(Theme.accent)
    }
}

private struct SidebarAccountFooter: View {
    @Environment(SessionStore.self) private var session
    let profile: ServerProfile
    let user: User
    let version: String

    var body: some View {
        VStack(spacing: 0) {
            Divider()
            HStack(spacing: 9) {
                Circle()
                    .fill(LinearGradient(colors: [Color(hex: 0x6D28D9), Theme.accent], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 26, height: 26)
                    .overlay(Text(String(user.username.prefix(1)).uppercased()).font(.system(size: 11, weight: .bold)).foregroundStyle(.white))
                VStack(alignment: .leading, spacing: 1) {
                    Text(user.username)
                        .font(.system(size: 12, weight: .semibold))
                    HStack(spacing: 4) {
                        Circle().fill(.green).frame(width: 6, height: 6)
                        Text("\(profile.name) · v\(version)")
                    }
                    .font(.system(size: 10))
                    .foregroundStyle(Theme.Text.tertiary)
                    .lineLimit(1)
                }
                Spacer()
                Menu {
                    Button("登出", systemImage: "rectangle.portrait.and.arrow.right") {
                        Task { await session.logout() }
                    }
                    Button("切換伺服器", systemImage: "server.rack") { session.switchToNoServer() }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .menuStyle(.borderlessButton)
                .menuIndicator(.hidden)
                .frame(width: 24)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
        }
        .background(.bar)
    }
}

private struct PlaceholderDetail: View {
    let destination: Destination
    let profile: ServerProfile
    let user: User
    let version: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: destination.symbol)
                .font(.system(size: 36, weight: .regular))
                .foregroundStyle(Theme.accent)
            Text(destination.title)
                .font(.system(size: 20, weight: .bold))
            Text("已連線 · \(profile.name) · v\(version) · \(user.username)")
                .font(.system(size: 13))
                .foregroundStyle(Theme.Text.secondary)
            Text("此畫面在 Phase 1 實作。")
                .font(.system(size: 12))
                .foregroundStyle(Theme.Text.tertiary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.background)
    }
}

#if DEBUG
#Preview("Main shell") {
    PreviewHost(phase: .ready(Preview.profile, user: Preview.user, version: "0.1.17")) {
        MainShellView(profile: Preview.profile, user: Preview.user, version: "0.1.17")
    }
}
#endif
