import MilmilAPI
import SwiftUI

/// The server has no admin yet. First-run setup (account, first library,
/// integrations) stays in the web wizard; we just send the user there.
struct SetupRedirectView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.openURL) private var openURL
    let profile: ServerProfile

    var body: some View {
        OnboardingCard(title: "伺服器尚未初始化", subtitle: "需要先在瀏覽器完成首次設定") {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "info.circle.fill")
                    .foregroundStyle(.yellow)
                Text("伺服器 \(profile.name) 尚未建立管理員帳號。建立帳號、第一個媒體庫與整合請在瀏覽器完成，之後再回來登入。")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.Text.primary)
                    .lineSpacing(3)
            }
            .padding(12)
            .background(.yellow.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))

            Button {
                openURL(profile.baseURL.appending(path: "setup"))
            } label: {
                Label("在瀏覽器開啟 \(profile.baseURL.host() ?? "")/setup", systemImage: "safari")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .tint(Theme.accent)
            Button {
                Task { await session.retry() }
            } label: {
                Label("已完成，重新檢查", systemImage: "arrow.clockwise")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
        }
    }
}

#if DEBUG
#Preview("Setup redirect") {
    PreviewHost(phase: .needsSetup(Preview.profile)) { SetupRedirectView(profile: Preview.profile) }
}
#endif
