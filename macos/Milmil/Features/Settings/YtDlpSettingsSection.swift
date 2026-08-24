import SwiftUI

/// yt-dlp 設定: one-click install into Application Support, version display,
/// and re-download to update. Nothing is bundled with the app.
struct YtDlpSettingsSection: View {
    @State private var version: String?
    @State private var busy = false
    @State private var error: String?
    @ObserveInjection private var inject

    var body: some View {
        HStack {
            if let version {
                Label(String(localized: "已安裝 · \(version)"), systemImage: "checkmark.circle.fill")
                    .foregroundStyle(Color(hex: 0x4ADE80))
            } else if YtDlp.isInstalled {
                Label("已安裝", systemImage: "checkmark.circle.fill").foregroundStyle(Color(hex: 0x4ADE80))
            } else {
                Label("未安裝", systemImage: "circle.dashed").foregroundStyle(Theme.Text.tertiary)
            }
            Spacer()
            Button(buttonTitle) { Task { await install() } }.disabled(busy)
        }
        .task { version = await YtDlp.version() }
        Text("裝了之後，預告片和「開啟 URL」（⌘⇧O）會直接在 App 內播放；沒裝就交給瀏覽器。下載自 yt-dlp 官方 GitHub releases，存放在 ~/Library/Application Support/milmil/yt-dlp。")
            .font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
        if let error {
            Text(error).font(.system(size: 11)).foregroundStyle(Color(hex: 0xF87171))
        }
    }

    private var buttonTitle: String {
        if busy { return String(localized: "下載中…") }
        return YtDlp.isInstalled ? String(localized: "更新") : String(localized: "下載 yt-dlp")
    }

    private func install() async {
        busy = true
        defer { busy = false }
        error = nil
        do {
            try await YtDlp.install()
            version = await YtDlp.version()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
