import MilmilAPI
import SwiftUI

/// Current connection, saved servers, and the account's API tokens.
struct ServerSettingsTab: View {
    @Environment(SessionStore.self) private var sessionStore
    @Environment(PlayerCoordinator.self) private var coordinator
    @State private var tokens: Loadable<[APIToken]> = .idle
    @State private var confirmRevoke: APIToken?

    var body: some View {
        Form {
            Section("目前連線") {
                if let session = coordinator.session {
                    LabeledContent("伺服器", value: session.profile.name)
                    LabeledContent("網址", value: session.profile.baseURL.absoluteString)
                    LabeledContent("版本", value: "v\(session.profile.lastKnownVersion ?? "?")")
                    LabeledContent("帳號", value: session.user.username)
                    LabeledContent("即時連線") {
                        HStack(spacing: 6) {
                            Circle().fill(session.isRealtimeConnected ? .green : .orange).frame(width: 8, height: 8)
                            Text(session.isRealtimeConnected ? "已連線" : "重新連線中")
                        }
                    }
                    HStack {
                        Button("登出", role: .destructive) { Task { await sessionStore.logout() } }
                        Button("切換伺服器") { sessionStore.switchToNoServer() }
                    }
                } else {
                    Text("未登入").foregroundStyle(Theme.Text.tertiary)
                }
            }
            Section("已儲存的伺服器") {
                ForEach(sessionStore.profiles) { profile in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(profile.name).font(.system(size: 13, weight: .medium))
                            Text(profile.baseURL.absoluteString).font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                        }
                        Spacer()
                        if profile.id == coordinator.session?.profile.id {
                            Text("使用中").font(.system(size: 11)).foregroundStyle(Theme.accent)
                        } else {
                            Button("移除", role: .destructive) { sessionStore.removeServer(profile) }.controlSize(.small)
                        }
                    }
                }
                if sessionStore.profiles.isEmpty { Text("沒有已儲存的伺服器").foregroundStyle(Theme.Text.tertiary) }
            }
            Section("API Token（此帳號的所有裝置）") {
                switch tokens {
                case let .loaded(list):
                    ForEach(list) { token in
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 6) {
                                    Text(token.name).font(.system(size: 13, weight: .medium))
                                    if token.isCurrent {
                                        Text("本機").font(.system(size: 10, weight: .bold))
                                            .padding(.horizontal, 5).padding(.vertical, 1)
                                            .background(Theme.accent.opacity(0.2), in: Capsule())
                                    }
                                }
                                let ip = token.lastIP.isEmpty ? "—" : token.lastIP
                                Text("\(token.tokenPrefix)… · \(ip) · \(Formatters.relative(token.lastUsedAt ?? token.createdAt))")
                                    .font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                            }
                            Spacer()
                            Button("撤銷", role: .destructive) { confirmRevoke = token }.controlSize(.small).disabled(token.isCurrent)
                        }
                    }
                    if list.isEmpty { Text("沒有 token").foregroundStyle(Theme.Text.tertiary) }
                case let .failed(message):
                    ErrorBanner(message: message) { Task { await loadTokens() } }
                default:
                    ProgressView().controlSize(.small)
                }
            }
        }
        .formStyle(.grouped)
        .task(id: coordinator.session?.profile.id) { await loadTokens() }
        .confirmationDialog(
            "撤銷「\(confirmRevoke?.name ?? "")」？",
            isPresented: Binding(get: { confirmRevoke != nil }, set: { if !$0 { confirmRevoke = nil } }),
            titleVisibility: .visible
        ) {
            Button("撤銷", role: .destructive) {
                if let token = confirmRevoke { Task { await revoke(token) } }
                confirmRevoke = nil
            }
        } message: {
            Text("該裝置需要重新登入。")
        }
    }

    private func loadTokens() async {
        guard let client = coordinator.session?.client else {
            tokens = .idle
            return
        }
        tokens = tokens.reloading
        tokens = await tokens.reloaded { try await client.apiTokens() }
    }

    private func revoke(_ token: APIToken) async {
        guard let client = coordinator.session?.client else { return }
        try? await client.revokeAPIToken(id: token.id)
        await loadTokens()
    }
}
