import MilmilAPI
import SwiftUI

@Observable
@MainActor
final class ListModel<Item: Sendable> {
    enum State { case loading, ready([Item]), failed(String) }
    private(set) var state: State = .loading

    func load(_ fetch: @Sendable () async throws -> [Item]) async {
        do { state = .ready(try await fetch()) }
        catch { state = .failed(error.localizedDescription) }
    }

    func replace(_ items: [Item]) { state = .ready(items) }

    var items: [Item] {
        if case let .ready(items) = state { return items }
        return []
    }
}

/// Loading / failed / empty, once, so no management screen invents its own.
private struct Rows<Item: Sendable & Identifiable, Row: View>: View {
    let state: ListModel<Item>.State
    let empty: String
    @ViewBuilder let row: (Item) -> Row

    var body: some View {
        switch state {
        case .loading:
            ProgressView().controlSize(.large).tint(Theme.accent)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case let .failed(message):
            ContentUnavailableView("載入失敗", systemImage: "wifi.exclamationmark", description: Text(message))
        case let .ready(items):
            if items.isEmpty {
                ContentUnavailableView(empty, systemImage: "tray")
            } else {
                List(items) { row($0) }.listStyle(.plain)
            }
        }
    }
}

struct HistoryView: View {
    let client: APIClient
    let open: (Int) -> Void
    @State private var model = ListModel<ProgressEntry>()

    var body: some View {
        Rows(state: model.state, empty: "仲未睇過嘢") { entry in
            Button { entry.animeBangumiID.map(open) } label: {
                HStack(spacing: 14) {
                    AsyncImage(url: entry.animeCoverImage) { image in
                        image.resizable().aspectRatio(contentMode: .fill)
                    } placeholder: {
                        RoundedRectangle(cornerRadius: 8).fill(.white.opacity(0.06))
                    }
                    .frame(width: 48, height: 68)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    VStack(alignment: .leading, spacing: 3) {
                        Text(entry.animeTitleZh ?? entry.animeTitle).font(.body.weight(.medium)).lineLimit(1)
                        Text("第 \(entry.episodeNumber) 集 · \(label(for: entry))")
                            .font(.caption).foregroundStyle(.secondary)
                        if let total = entry.durationSeconds, total > 0 {
                            ProgressView(value: Double(entry.positionSeconds), total: Double(total))
                                .tint(Theme.accent)
                        }
                    }
                }
            }
            .tint(.primary)
            .swipeActions {
                Button("移除", role: .destructive) {
                    model.replace(model.items.filter { $0.id != entry.id })
                    Task { try? await client.deleteProgress(id: entry.id) }
                }
            }
        }
        .navigationTitle("歷史")
        .task { await model.load { try await client.history().items } }
    }

    /// An episode stopped twenty seconds from the end is finished for every
    /// purpose the user has; "仲有 0 分鐘" is not a sentence.
    private func label(for entry: ProgressEntry) -> String {
        let total = entry.durationSeconds ?? 0
        if entry.completed || (total > 0 && Double(entry.positionSeconds) / Double(total) >= 0.92) { return "睇晒" }
        let minutes = max(0, total - entry.positionSeconds) / 60
        return minutes <= 0 ? "就快睇完" : "仲有 \(minutes) 分鐘"
    }
}

struct LibrariesView: View {
    let client: APIClient
    @State private var model = ListModel<Library>()
    @State private var scanning: Set<String> = []

    var body: some View {
        Rows(state: model.state, empty: "未加過媒體庫") { library in
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(library.name).font(.body.weight(.medium))
                        Text(library.path).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Spacer()
                    Button(scanning.contains(library.id) ? "掃描中…" : "掃描") {
                        scanning.insert(library.id)
                        Task {
                            try? await client.scanLibrary(id: library.id)
                            scanning.remove(library.id)
                            await model.load { try await client.libraries() }
                        }
                    }
                    .disabled(scanning.contains(library.id))
                }
                Text("\(library.fileCount) 個檔案 · 配對咗 \(library.matchedCount) · \(bytes(library.totalSizeBytes))")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("媒體庫")
        .task { await model.load { try await client.libraries() } }
    }
}

struct DownloadsView: View {
    let client: APIClient
    @State private var model = ListModel<Download>()

    var body: some View {
        Rows(state: model.state, empty: "冇下載緊嘢") { download in
            VStack(alignment: .leading, spacing: 6) {
                Text(name(of: download)).font(.subheadline).lineLimit(2)
                ProgressView(value: fraction(of: download)).tint(Theme.accent)
                HStack {
                    Text("\(bytes(download.completedBytes)) / \(bytes(download.totalBytes))")
                        .font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    Button(download.status == "active" ? "暫停" : "繼續") {
                        Task {
                            if download.status == "active" { try? await client.pauseDownload(gid: download.gid) }
                            else { try? await client.resumeDownload(gid: download.gid) }
                            await model.load { try await client.downloads() }
                        }
                    }
                }
            }
        }
        .navigationTitle("下載")
        .task { await model.load { try await client.downloads() } }
    }

    /// aria2 names a fresh torrent by its magnet URI until metadata arrives,
    /// and a 60-character hash is not a name.
    private func name(of download: Download) -> String {
        download.name.hasPrefix("magnet:") || download.name.isEmpty ? "取得種子資料中…" : download.name
    }

    private func fraction(of download: Download) -> Double {
        download.totalBytes > 0 ? Double(download.completedBytes) / Double(download.totalBytes) : 0
    }
}

struct NotificationsView: View {
    let client: APIClient
    let onMarkedRead: () -> Void
    @State private var model = ListModel<MilmilNotification>()

    var body: some View {
        Rows(state: model.state, empty: "冇通知") { item in
            HStack(alignment: .top, spacing: 10) {
                Circle()
                    .fill(item.read ? Color.clear : Theme.accent)
                    .frame(width: 8, height: 8)
                    .padding(.top, 6)
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.title).font(.subheadline.weight(.medium))
                    if !item.message.isEmpty {
                        Text(item.displayMessage).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                    }
                }
                Spacer()
                // Twelve rows reading "Library Scan Complete" are
                // indistinguishable without a time between them.
                if let created = item.createdAt {
                    Text(created, format: .relative(presentation: .numeric))
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("通知")
        .toolbar {
            Button("全部標為已讀") {
                model.replace(model.items.map { var copy = $0; copy.read = true; return copy })
                onMarkedRead()
                Task { try? await client.markAllNotificationsRead() }
            }
        }
        .task { await model.load { try await client.notifications() } }
    }
}

struct TorrentsView: View {
    let client: APIClient
    let bangumiID: Int
    let title: String
    @State private var model = ListModel<TorrentRow>()
    @State private var started: Set<String> = []

    var body: some View {
        Rows(state: model.state, empty: "搵唔到種子") { row in
            VStack(alignment: .leading, spacing: 6) {
                Text(row.result.title).font(.subheadline).lineLimit(2)
                HStack {
                    Text(summary(row.result)).font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    Button(started.contains(row.id) ? "已加入" : "下載") {
                        started.insert(row.id)
                        Task { try? await client.addTorrent(url: row.result.magnet, name: row.result.title) }
                    }
                    .disabled(started.contains(row.id))
                }
            }
        }
        .navigationTitle("找種子 · \(title)")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await model.load {
                try await client.animeTorrents(bangumiID: bangumiID).map(TorrentRow.init)
            }
        }
    }

    private func summary(_ result: TorrentResult) -> String {
        [result.size, "↑ \(result.seeders)", result.subGroup, result.sourceSite]
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }
}

struct SettingsView: View {
    @Binding var danmaku: DanmakuSettings
    @Environment(SessionStore.self) private var session

    var body: some View {
        Form {
            Section {
                LabeledContent("使用者", value: session.username ?? "—")
                LabeledContent("伺服器", value: session.serverName ?? "—")
                if let version = session.version {
                    LabeledContent("版本", value: version)
                }
            }
            Section("彈幕") {
                Toggle("顯示彈幕", isOn: $danmaku.enabled)
                slider("字型大小", value: $danmaku.fontSize, in: 12...36, display: "\(Int(danmaku.fontSize))")
                slider("透明度", value: $danmaku.opacity, in: 0.2...1, display: "\(Int(danmaku.opacity * 100))%")
                slider("速度", value: $danmaku.speed, in: 60...320, display: "\(Int(danmaku.speed)) px/s")
                slider("顯示範圍", value: $danmaku.area, in: 0.25...1, display: "\(Int(danmaku.area * 100))%")
            }
            Section {
                Button("解除配對", role: .destructive) { session.unpair() }
            } footer: {
                Text("解除配對會刪除呢部機上面嘅權杖。伺服器嗰邊嘅權杖要喺 Web 版設定入面撤銷。")
            }
        }
        .navigationTitle("設定")
    }

    private func slider(
        _ label: String,
        value: Binding<Double>,
        in range: ClosedRange<Double>,
        display: String
    ) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(label)
                Spacer()
                Text(display).foregroundStyle(.secondary)
            }
            Slider(value: value, in: range).tint(Theme.accent)
        }
    }
}

/// Sizes the way a file browser shows them, not as raw bytes.
func bytes(_ value: Int64) -> String {
    value > 0 ? value.formatted(.byteCount(style: .file)) : "0 B"
}

/// `TorrentResult` has no stable id of its own; the magnet is one.
/// `nonisolated` because the app target defaults to `MainActor` isolation and
/// a `Sendable` list element cannot carry a main-actor-bound conformance.
nonisolated struct TorrentRow: Identifiable, Sendable {
    let result: TorrentResult
    var id: String { result.magnet }
}
