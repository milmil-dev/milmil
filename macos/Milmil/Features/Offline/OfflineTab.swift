import MilmilAPI
import SwiftUI

/// 下載 › 本機: everything kept on this Mac, grouped by series — progress,
/// pause / resume, pin, reveal, delete — under a quota bar.
struct OfflineTab: View {
    @Environment(Router.self) private var router
    @State private var store = OfflineStore.shared
    @State private var confirmRemoveAll = false

    private var groups: [(bangumiID: Int, title: String, entries: [OfflineEntry])] {
        Dictionary(grouping: store.entries, by: \.bangumiID)
            .map { id, entries in (id, entries.first?.seriesTitle ?? String(id), entries.sorted { $0.episodeNumber < $1.episodeNumber }) }
            .sorted { $0.title < $1.title }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            OfflineQuotaBar(used: store.usedBytes, quota: store.preferences.quotaBytes, transferring: store.isTransferring)
            HStack(spacing: 8) {
                Spacer()
                ChipButton(title: String(localized: "在 Finder 顯示"), symbol: "folder") { store.revealDirectory() }
                RowIconButton(symbol: "trash", label: String(localized: "移除全部本機副本"), destructive: true) { confirmRemoveAll = true }
                    .disabled(store.entries.isEmpty)
                    .opacity(store.entries.isEmpty ? 0.4 : 1)
            }
            if store.entries.isEmpty {
                EmptyState(
                    symbol: "arrow.down.circle",
                    title: String(localized: "呢部 Mac 未有本機副本"),
                    message: String(localized: "喺作品頁嘅集數按右鍵「保留喺呢部 Mac」，冇網絡都可以睇。")
                )
                .frame(maxWidth: .infinity)
                .padding(.top, 40)
            } else {
                ForEach(groups, id: \.bangumiID) { group in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            SectionLabel(title: group.title, count: group.entries.count)
                            Spacer()
                            Button("作品頁") { router.openAnime(group.bangumiID) }
                                .buttonStyle(.plain).font(.system(size: 12)).foregroundStyle(Theme.accent)
                        }
                        VStack(spacing: 2) {
                            ForEach(group.entries) { entry in
                                OfflineRow(entry: entry, store: store) {
                                    router.openWatch(bangumiID: entry.bangumiID, episodeID: entry.episodeID)
                                }
                            }
                        }
                    }
                }
            }
        }
        .confirmationDialog("移除全部本機副本？", isPresented: $confirmRemoveAll, titleVisibility: .visible) {
            Button("移除", role: .destructive) { store.removeAll() }
        } message: {
            Text("會刪除呢部 Mac 上所有已保留嘅集數；伺服器上嘅檔案唔受影響。")
        }
        .overlay(alignment: .bottom) {
            ToastLabel(text: Binding(get: { store.lastError }, set: { store.lastError = $0 })).padding(.bottom, 16)
        }
    }
}

/// Used / free against the quota, in the Libraries storage bar's language.
struct OfflineQuotaBar: View {
    let used: Int64
    let quota: Int64
    var transferring = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.ink(0.08))
                    Capsule().fill(used > quota ? Color(hex: 0xFBBF24) : Theme.accent)
                        .frame(width: proxy.size.width * min(1, Double(used) / Double(max(quota, 1))))
                }
            }
            .frame(height: 6)
            HStack(spacing: 12) {
                let usedText = Self.bytes(used)
                let quotaText = Self.bytes(quota)
                Text("已用 \(usedText) / 配額 \(quotaText)").foregroundStyle(Theme.Text.secondary)
                if transferring {
                    Label("下載中", systemImage: "arrow.down.circle").foregroundStyle(Theme.accent)
                }
                Spacer()
            }
            .font(.system(size: 11))
            .monospacedDigit()
        }
    }

    static func bytes(_ value: Int64) -> String {
        value == 0 ? "0 B" : ByteCountFormatter.string(fromByteCount: value, countStyle: .file)
    }
}

/// One kept episode: number + title, state line, progress while moving, and
/// the quiet actions on hover.
private struct OfflineRow: View {
    let entry: OfflineEntry
    let store: OfflineStore
    var play: () -> Void
    @State private var hovered = false

    var body: some View {
        HStack(spacing: 12) {
            Circle().fill(dotColor).frame(width: 8, height: 8)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 8) {
                    Text("第 \(entry.number) 集").font(.system(size: 11, weight: .bold)).foregroundStyle(Theme.Text.tertiary)
                    if entry.pinned { Image(systemName: "pin.fill").font(.system(size: 9)).foregroundStyle(Theme.accent) }
                }
                Text(entry.episodeTitle ?? String(localized: "第 \(entry.number) 集")).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                Text(stateLine).font(.system(size: 11)).foregroundStyle(entry.state == .failed ? Color(hex: 0xF87171) : Theme.Text.tertiary).lineLimit(1)
                if entry.state == .downloading || entry.state == .paused {
                    ProgressView(value: entry.fraction).progressViewStyle(.linear).controlSize(.small).frame(maxWidth: 260)
                }
            }
            Spacer(minLength: 8)
            HStack(spacing: 6) {
                switch entry.state {
                case .downloading, .queued:
                    RowIconButton(symbol: "pause.fill", label: String(localized: "暫停")) { store.pause(fileID: entry.fileID) }
                case .paused, .failed:
                    RowIconButton(symbol: "arrow.clockwise", label: String(localized: "繼續下載")) { store.resume(fileID: entry.fileID) }
                case .done:
                    RowIconButton(symbol: "play.fill", label: String(localized: "播放"), prominent: true, action: play)
                }
                RowIconButton(symbol: entry.pinned ? "pin.slash" : "pin", label: entry.pinned ? String(localized: "取消釘選") : String(localized: "釘選（唔會自動刪除）")) {
                    store.setPinned(fileID: entry.fileID, !entry.pinned)
                }
                if entry.state == .done {
                    RowIconButton(symbol: "folder", label: String(localized: "在 Finder 顯示")) { store.revealInFinder(fileID: entry.fileID) }
                }
                RowIconButton(symbol: "trash", label: String(localized: "移除本機副本"), destructive: true) { store.remove(fileID: entry.fileID) }
            }
            .opacity(hovered || entry.state != .done ? 1 : 0)
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(hovered ? Theme.ink(0.04) : .clear, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(hovered ? Theme.ink(0.08) : .clear, lineWidth: 1))
        .contentShape(Rectangle())
        .onHover { hovered = $0 }
        .animation(.easeOut(duration: 0.15), value: hovered)
        .onTapGesture(count: 2) { if entry.state == .done { play() } }
    }

    private var dotColor: Color {
        switch entry.state {
        case .done: Color(hex: 0x4ADE80)
        case .downloading: Color(hex: 0xFBBF24)
        case .failed: Color(hex: 0xF87171)
        case .queued, .paused: Theme.ink(0.25)
        }
    }

    private var stateLine: String {
        let size = OfflineQuotaBar.bytes(max(entry.sizeBytes, entry.downloadedBytes))
        switch entry.state {
        case .done:
            let extras = [entry.subtitles.isEmpty ? nil : String(localized: "含字幕"), entry.hasDanmaku ? String(localized: "含彈幕") : nil].compactMap { $0 }
            return ([size] + extras).joined(separator: " · ")
        case .downloading:
            let doneText = OfflineQuotaBar.bytes(entry.downloadedBytes)
            return String(localized: "下載中 \(doneText) / \(size)")
        case .queued: return String(localized: "排隊中")
        case .paused: return String(localized: "已暫停")
        case .failed: return entry.error ?? String(localized: "下載失敗")
        }
    }
}
