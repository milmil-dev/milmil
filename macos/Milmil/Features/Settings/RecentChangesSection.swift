import MilmilAPI
import SwiftUI

/// 最近變更: the caller's audit log with one-click undo, mirroring the web's
/// audit page. Lives inside the 帳號 settings tab.
struct RecentChangesSection: View {
    let session: ServerSession
    @State private var entries: Loadable<[AuditEntry]> = .idle
    @State private var confirmUndo: AuditEntry?
    @State private var busyID: String?
    @State private var toast: String?
    @ObserveInjection private var inject

    var body: some View {
        Group {
            switch entries {
            case let .loaded(entries) where entries.isEmpty:
                Text("還沒有可復原的操作。").font(.system(size: 12)).foregroundStyle(Theme.Text.tertiary)
            case let .loaded(entries):
                ForEach(entries) { entry in
                    row(entry)
                }
            case let .failed(message):
                ErrorBanner(message: message) { Task { await load() } }
            default:
                ProgressView().controlSize(.small)
            }
        }
        .task { await load() }
        .overlay { ToastLabel(text: $toast) }
        .confirmationDialog(
            String(localized: "復原「\(confirmUndo.map(Self.actionLabel) ?? "")」？"),
            isPresented: Binding(get: { confirmUndo != nil }, set: { if !$0 { confirmUndo = nil } }),
            titleVisibility: .visible
        ) {
            Button("復原") {
                if let entry = confirmUndo { Task { await undo(entry) } }
                confirmUndo = nil
            }
        } message: {
            Text("伺服器會把這個操作反轉回去。")
        }
    }

    private func row(_ entry: AuditEntry) -> some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(Self.actionLabel(entry)).font(.system(size: 12, weight: .medium))
                    if entry.isUndone {
                        PillBadge(text: String(localized: "已復原"), tint: Color.white.opacity(0.1))
                    }
                }
                HStack(spacing: 6) {
                    if let date = entry.createdAt {
                        Text(Formatters.relative(date))
                    }
                    if !entry.agentLabel.isEmpty {
                        Text(verbatim: "· \(entry.agentLabel)")
                    }
                }
                .font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
            }
            Spacer()
            if !entry.isUndone {
                Button(busyID == entry.id ? String(localized: "復原中…") : String(localized: "復原…")) { confirmUndo = entry }
                    .controlSize(.small)
                    .disabled(busyID != nil)
            }
        }
    }

    /// Macro entries ("match.apply") carry their own names; the rest come from
    /// the audit middleware as "<singular-resource>.<create|update|delete>"
    /// ("libraries" → "librarie" is the server's naive singularization).
    private static let namedActions: [String: String] = [
        "match.apply": String(localized: "手動匹配"),
        "subscribe.create": String(localized: "新增訂閱"),
        "subscribe.add": String(localized: "新增訂閱"),
        "rss.create": String(localized: "新增 RSS 來源"),
        "api_token.create": String(localized: "建立 API token"),
        "api_token.delete": String(localized: "刪除 API token"),
        "preference.update": String(localized: "更新偏好設定"),
        "librarie.create": String(localized: "新增媒體庫"),
        "librarie.update": String(localized: "編輯媒體庫"),
        "librarie.delete": String(localized: "刪除媒體庫"),
        "media_file.update": String(localized: "更新媒體檔"),
        "media_file.delete": String(localized: "刪除媒體檔"),
        "download.create": String(localized: "新增下載"),
        "download.delete": String(localized: "刪除下載"),
        "collection.create": String(localized: "加入收藏"),
        "collection.update": String(localized: "更新收藏"),
        "collection.delete": String(localized: "移除收藏"),
        "episode.update": String(localized: "更新集數"),
        "danmaku.create": String(localized: "發送彈幕"),
        "notification.update": String(localized: "更新通知"),
    ]

    /// Human label for the server's `action_type` strings.
    static func actionLabel(_ entry: AuditEntry) -> String {
        namedActions[entry.actionType] ?? entry.actionType
    }

    private func load() async {
        entries = entries.reloading
        entries = await entries.reloaded { try await session.client.auditLog(limit: 20) }
    }

    private func undo(_ entry: AuditEntry) async {
        busyID = entry.id
        defer { busyID = nil }
        do {
            let result = try await session.client.undoAudit(id: entry.id)
            if let item = result.items.first, item.status != "reversed" {
                toast = item.reason.flatMap { $0.isEmpty ? nil : $0 } ?? String(localized: "這個操作無法復原")
            } else {
                toast = String(localized: "已復原")
            }
            await load()
        } catch {
            toast = error.localizedDescription
        }
    }
}
