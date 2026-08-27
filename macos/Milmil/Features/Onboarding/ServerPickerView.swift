import MilmilAPI
import SwiftUI

/// First screen: pick a saved server or add one by URL.
struct ServerPickerView: View {
    @Environment(SessionStore.self) private var session
    @ObserveInjection private var inject
    @State private var urlText = ""
    @State private var nameText = ""
    @State private var validationMessage: String?

    var body: some View {
        OnboardingCard(title: "milmil", subtitle: String(localized: "選擇或新增一個 milmil 伺服器")) {
            if !session.profiles.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("已儲存的伺服器")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.Text.secondary)
                    ForEach(session.profiles) { profile in
                        SavedServerRow(profile: profile)
                    }
                }
                Divider()
            }

            FormField(label: String(localized: "伺服器網址")) {
                // No `.textContentType(.URL)` and no scheme in the placeholder:
                // AppKit would otherwise paint the placeholder as a blue link.
                TextField("192.168.1.10:8080", text: $urlText)
                    .textFieldStyle(.roundedBorder)
                    .autocorrectionDisabled()
                    .onSubmit(add)
            }
            FormField(label: String(localized: "名稱（選填）")) {
                TextField("home-nas", text: $nameText)
                    .textFieldStyle(.roundedBorder)
                    .onSubmit(add)
            }
            if let validationMessage {
                InlineError(message: validationMessage)
            }
            Button(action: add) {
                Text("連線")
                    .frame(maxWidth: .infinity)
            }
            .glassProminentButtonStyle()
            .controlSize(.large)
            .tint(Theme.accent)
            .disabled(urlText.trimmingCharacters(in: .whitespaces).isEmpty)
            .keyboardShortcut(.defaultAction)
        }
    }

    private func add() {
        guard let url = ServerProfile.parseUserInput(urlText) else {
            validationMessage = String(localized: "請輸入有效的網址，例如 192.168.1.10:8080")
            return
        }
        validationMessage = nil
        let name = nameText.trimmingCharacters(in: .whitespaces)
        Task { await session.addServer(name: name.isEmpty ? (url.host() ?? "milmil") : name, url: url) }
    }
}

private struct SavedServerRow: View {
    @Environment(SessionStore.self) private var session
    let profile: ServerProfile

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "server.rack")
                .foregroundStyle(Theme.accent)
            VStack(alignment: .leading, spacing: 2) {
                Text(profile.name)
                    .font(.system(size: 13, weight: .semibold))
                HStack(spacing: 6) {
                    Text(profile.baseURL.absoluteString)
                    if let version = profile.lastKnownVersion {
                        Text("· v\(version)")
                    }
                    if let username = profile.username {
                        Text("· \(username)")
                    }
                }
                .font(.system(size: 11))
                .foregroundStyle(Theme.Text.tertiary)
                .lineLimit(1)
            }
            Spacer()
            Button("連線") {
                Task { await session.connect(profile) }
            }
            .glassButtonStyle()
            .controlSize(.small)
            Button("移除", systemImage: "trash", role: .destructive) {
                session.removeServer(profile)
            }
            .labelStyle(.iconOnly)
            .buttonStyle(.borderless)
            .foregroundStyle(Theme.Text.tertiary)
        }
        .padding(8)
        .background(Theme.ink(0.04), in: RoundedRectangle(cornerRadius: 8))
    }
}

/// Connection failed: reachability hints + retry, without losing the profile.
struct ConnectionErrorView: View {
    @Environment(SessionStore.self) private var session
    @ObserveInjection private var inject
    let profile: ServerProfile
    let message: String

    var body: some View {
        OnboardingCard(title: String(localized: "連線中斷"), subtitle: profile.baseURL.absoluteString) {
            InlineError(message: message)
            Text("• 確認伺服器已啟動（docker compose ps）\n• 若在外網，確認 VPN / 反向代理\n• 自簽憑證請用 http 或先在 Safari 信任")
                .font(.system(size: 12))
                .foregroundStyle(Theme.Text.secondary)
                .lineSpacing(3)
            Button {
                Task { await session.retry() }
            } label: {
                Label("重試", systemImage: "arrow.clockwise")
                    .frame(maxWidth: .infinity)
            }
            .glassProminentButtonStyle()
            .controlSize(.large)
            .tint(Theme.accent)
            .keyboardShortcut(.defaultAction)
            Button("切換伺服器") { session.switchToNoServer() }
                .glassButtonStyle()
                .controlSize(.large)
                .frame(maxWidth: .infinity)
        }
    }
}

#if DEBUG
#Preview("Server picker · empty") {
    PreviewHost(phase: .noServer, covers: []) { ServerPickerView() }
}

#Preview("Server picker · saved servers") {
    PreviewHost(phase: .noServer, covers: [], profiles: [Preview.profile, Preview.secondProfile]) { ServerPickerView() }
}

#Preview("Server picker · English") {
    PreviewHost(phase: .noServer, covers: [], profiles: [Preview.profile, Preview.secondProfile], locale: Locale(identifier: "en")) {
        ServerPickerView()
    }
}

#Preview("Connection error") {
    PreviewHost(phase: .connectionFailed(Preview.profile, message: String(localized: "無法連線到伺服器（連線被拒）"))) {
        ConnectionErrorView(profile: Preview.profile, message: String(localized: "無法連線到伺服器（連線被拒）"))
    }
}
#endif
