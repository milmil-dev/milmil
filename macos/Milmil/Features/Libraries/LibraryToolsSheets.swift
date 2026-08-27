import MilmilAPI
import SwiftUI

/// 重複檔案: duplicate sets in a library — pick the preferred copy, delete
/// extras one by one, or clean up everything at once.
struct DuplicatesSheet: View {
    let library: Library
    let client: APIClient
    var onChanged: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var sets: Loadable<[DupSet]> = .idle
    @State private var confirmCleanup = false
    @State private var confirmDeleteFile: DupFileInfo?
    @State private var toast: String?
    @ObserveInjection private var inject

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            content
        }
        .frame(width: 640, height: 520)
        .task { await load() }
        .overlay(alignment: .bottom) { ToastLabel(text: $toast) }
        .confirmationDialog("清理所有重複檔案？", isPresented: $confirmCleanup, titleVisibility: .visible) {
            Button("刪除非優先檔案", role: .destructive) { Task { await cleanup() } }
        } message: {
            Text("每組只保留優先檔案，其餘從磁碟刪除。")
        }
        .confirmationDialog(
            String(localized: "刪除「\(confirmDeleteFile?.filename ?? "")」？"),
            isPresented: Binding(get: { confirmDeleteFile != nil }, set: { if !$0 { confirmDeleteFile = nil } }),
            titleVisibility: .visible
        ) {
            Button("從磁碟刪除", role: .destructive) {
                if let file = confirmDeleteFile { Task { await delete(file) } }
                confirmDeleteFile = nil
            }
        }
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("重複檔案").font(.system(size: 16, weight: .bold))
                if let sets = sets.value {
                    let size = ByteCountFormatter.string(fromByteCount: sets.reduce(0) { $0 + $1.wastedBytes }, countStyle: .file)
                    Text("\(sets.count) 組 · 可回收 \(size)").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                }
            }
            Spacer()
            if sets.value?.isEmpty == false {
                Button("清理全部…", role: .destructive) { confirmCleanup = true }
            }
            Button("完成") { dismiss() }.keyboardShortcut(.cancelAction)
        }
        .padding(.horizontal, 20).padding(.vertical, 14)
    }

    @ViewBuilder
    private var content: some View {
        switch sets {
        case let .loaded(sets) where sets.isEmpty:
            EmptyState(symbol: "checkmark.seal", title: String(localized: "沒有重複檔案"), message: String(localized: "每一集都只有一個檔案。"))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case let .loaded(sets):
            List(sets) { set in
                Section {
                    ForEach(set.files) { file in
                        fileRow(set: set, file: file)
                    }
                } header: {
                    HStack {
                        Text("\(set.animeTitle) · EP \(Formatters.episode(set.episodeNumber).dropFirst(3))")
                        Spacer()
                        Text("浪費 \(ByteCountFormatter.string(fromByteCount: set.wastedBytes, countStyle: .file))")
                            .foregroundStyle(Theme.Text.tertiary)
                    }
                    .font(.system(size: 12, weight: .semibold))
                }
            }
            .listStyle(.inset)
            .scrollContentBackground(.hidden)
        case let .failed(message):
            ErrorBanner(message: message) { Task { await load() } }.padding(20)
            Spacer()
        default:
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func fileRow(set: DupSet, file: DupFileInfo) -> some View {
        let isPreferred = file.id == set.preferredID
        return HStack(spacing: 10) {
            Image(systemName: isPreferred ? "star.fill" : "star")
                .foregroundStyle(isPreferred ? Color(hex: 0xFBBF24) : Theme.Text.tertiary)
                .help(isPreferred ? String(localized: "播放時使用這個檔案") : String(localized: "設為優先"))
                .onTapGesture { if !isPreferred { Task { await prefer(set: set, file: file) } } }
            VStack(alignment: .leading, spacing: 2) {
                Text(file.filename).font(.system(size: 12)).lineLimit(1).truncationMode(.middle).help(file.path)
                HStack(spacing: 8) {
                    Text(ByteCountFormatter.string(fromByteCount: file.sizeBytes, countStyle: .file))
                    if file.resolution > 0 { Text(verbatim: "\(file.resolution)p") }
                    if !file.subgroup.isEmpty { Text(file.subgroup) }
                }
                .font(.system(size: 10)).foregroundStyle(Theme.Text.tertiary)
            }
            Spacer()
            if !isPreferred {
                Button("刪除") { confirmDeleteFile = file }
                    .controlSize(.small).foregroundStyle(Color(hex: 0xF87171))
            }
        }
        .padding(.vertical, 2)
    }

    private func load() async {
        sets = sets.reloading
        sets = await sets.reloaded { try await client.libraryDuplicates(libraryID: library.id) }
    }

    private func prefer(set: DupSet, file: DupFileInfo) async {
        do {
            try await client.setPreferredMediaFile(episodeID: set.episodeID, mediaFileID: file.id)
            await load()
        } catch {
            toast = error.localizedDescription
        }
    }

    private func delete(_ file: DupFileInfo) async {
        do {
            try await client.deleteMediaFile(id: file.id)
            await load()
            await onChanged()
        } catch {
            toast = error.localizedDescription
        }
    }

    private func cleanup() async {
        do {
            let result = try await client.cleanupLibraryDuplicates(libraryID: library.id)
            let reclaimed = ByteCountFormatter.string(fromByteCount: result.reclaimedBytes, countStyle: .file)
            toast = String(localized: "刪除 \(result.deleted) 個檔案，回收 \(reclaimed)")
            await load()
            await onChanged()
        } catch {
            toast = error.localizedDescription
        }
    }
}

/// 缺集摘要: which episodes each series in the library is missing.
struct MissingSummarySheet: View {
    let library: Library
    let client: APIClient
    /// Jump to the series page (the caller dismisses the sheet first).
    var openAnime: (Int) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var reports: Loadable<[CompletenessReport]> = .idle
    @ObserveInjection private var inject

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("缺集摘要").font(.system(size: 16, weight: .bold))
                    if let reports = reports.value {
                        Text("\(reports.count) 部作品有缺集").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                    }
                }
                Spacer()
                Button("完成") { dismiss() }.keyboardShortcut(.cancelAction)
            }
            .padding(.horizontal, 20).padding(.vertical, 14)
            Divider()
            content
        }
        .frame(width: 560, height: 480)
        .task { await load() }
    }

    @ViewBuilder
    private var content: some View {
        switch reports {
        case let .loaded(reports) where reports.isEmpty:
            EmptyState(symbol: "checkmark.seal", title: String(localized: "沒有缺集"), message: String(localized: "媒體庫裡的作品都齊了。"))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case let .loaded(reports):
            List(reports) { report in
                Button {
                    dismiss()
                    if report.bangumiID > 0 { openAnime(report.bangumiID) }
                } label: {
                    HStack(alignment: .top, spacing: 10) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(report.title).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                            Text(missingText(report)).font(.system(size: 11)).foregroundStyle(Color(hex: 0xFBBF24)).lineLimit(2)
                            if !report.airingPending.isEmpty {
                                Text("未播出 \(EpisodeRanges.format(report.airingPending))")
                                    .font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                            }
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text(verbatim: "\(report.have.count)/\(report.unknownTotal ? "?" : String(report.total))")
                                .font(.system(size: 12, weight: .semibold)).monospacedDigit()
                            Text("已收").font(.system(size: 10)).foregroundStyle(Theme.Text.tertiary)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.vertical, 2)
            }
            .listStyle(.inset)
            .scrollContentBackground(.hidden)
        case let .failed(message):
            ErrorBanner(message: message) { Task { await load() } }.padding(20)
            Spacer()
        default:
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func missingText(_ report: CompletenessReport) -> String {
        String(localized: "缺 \(report.missing.count) 集：\(EpisodeRanges.format(report.missing))")
    }

    private func load() async {
        reports = reports.reloading
        reports = await reports.reloaded { try await client.libraryMissingSummary(libraryID: library.id) }
    }
}

/// "1, 3, 5-8, 10.5" from a sorted list of episode numbers.
enum EpisodeRanges {
    static func format(_ numbers: [Double]) -> String {
        let sorted = numbers.sorted()
        var parts: [String] = []
        var index = 0
        while index < sorted.count {
            var end = index
            // Extend the run while the next number is exactly +1 (whole numbers only).
            while end + 1 < sorted.count,
                  sorted[end + 1] == sorted[end] + 1,
                  sorted[end].truncatingRemainder(dividingBy: 1) == 0 {
                end += 1
            }
            if end - index >= 2 {
                parts.append("\(label(sorted[index]))-\(label(sorted[end]))")
            } else {
                for n in index...end { parts.append(label(sorted[n])) }
            }
            index = end + 1
        }
        return parts.joined(separator: ", ")
    }

    private static func label(_ number: Double) -> String {
        number.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(number)) : String(number)
    }
}
