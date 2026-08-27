import SwiftUI

/// 離線: the smart-keep rules, the quota and where the copies live.
struct OfflineSettingsTab: View {
    @State private var preferences = OfflinePreferences.shared
    @State private var store = OfflineStore.shared

    var body: some View {
        Form {
            Section {
                Toggle("自動保留追緊嘅番", isOn: $preferences.autoKeep)
                if preferences.autoKeep {
                    Picker("保留最新未看", selection: $preferences.autoKeepCount) {
                        ForEach(OfflinePreferences.countChoices, id: \.self) { count in Text("\(count) 集").tag(count) }
                    }
                }
                Toggle("睇完 24 小時後自動刪除", isOn: $preferences.autoDeleteWatched)
            } header: {
                Text("自動保留")
            } footer: {
                Text("「觀看中」同有自動下載規則嘅番劇，新集落地就自動保留到呢部 Mac；釘選嘅副本唔會被自動刪除。")
                    .font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
            }
            Section {
                Picker("配額", selection: $preferences.quotaGB) {
                    ForEach(OfflinePreferences.quotaChoices, id: \.self) { size in Text(verbatim: "\(size) GB").tag(size) }
                }
                OfflineQuotaBar(used: store.usedBytes, quota: store.preferences.quotaBytes, transferring: store.isTransferring)
                    .padding(.vertical, 4)
                LabeledContent("位置") {
                    HStack(spacing: 8) {
                        Text(OfflineStore.rootDirectory.path).font(.system(size: 11, design: .monospaced)).foregroundStyle(Theme.Text.secondary)
                            .lineLimit(1).truncationMode(.middle)
                        Button("在 Finder 顯示") { store.revealDirectory() }.controlSize(.small)
                    }
                }
            } header: {
                Text("空間")
            } footer: {
                Text("超過配額時會先刪除睇過嘅、最舊嘅副本。").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
            }
            Section {
                Button("立即套用規則") { Task { await store.rules.run() } }
                    .disabled(store.rules.running || store.profileID == nil)
                if let when = store.rules.lastRunAt {
                    let relative = Formatters.relative(when)
                    Text("上次執行 \(relative)").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                }
            }
        }
        .formStyle(.grouped)
        .onChange(of: preferences.autoKeep) { _, _ in store.rules.runSoon() }
        .onChange(of: preferences.autoKeepCount) { _, _ in store.rules.runSoon() }
        .onChange(of: preferences.quotaGB) { _, _ in store.rules.enforceQuota() }
    }
}
