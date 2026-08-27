import AppKit
import MilmilAPI
import MilmilRealtime
import SwiftUI

@Observable
final class LibrariesStore {
    private(set) var libraries: Loadable<[Library]> = .idle
    var selectedID: String?
    /// Live `scan:*` state per library id.
    private(set) var scans: [String: ScanProgress] = [:]
    private let client: APIClient

    init(client: APIClient) {
        self.client = client
    }

    var selected: Library? { libraries.value?.first { $0.id == selectedID } }

    func load() async {
        libraries = libraries.reloading
        libraries = await libraries.reloaded { try await client.libraries() }
        if selectedID == nil || libraries.value?.contains { $0.id == selectedID } == false {
            selectedID = libraries.value?.first?.id
        }
    }

    func scan(_ library: Library) async {
        try? await client.scanLibrary(id: library.id)
    }

    func handle(_ event: ServerEvent) async {
        guard event.type.hasPrefix("scan:") || event.type.hasPrefix("match:"), let progress: ScanProgress = try? event.decode() else { return }
        if event.type == ServerEventType.scanCompleted || event.type == ServerEventType.matchCompleted || event.type == ServerEventType.scanError {
            scans[progress.libraryID] = event.type == ServerEventType.scanError ? progress : nil
            await load()
        } else {
            scans[progress.libraryID] = progress
        }
    }

    func reload(selecting id: String? = nil) async {
        await load()
        if let id { selectedID = id }
    }

    func delete(_ library: Library) async {
        try? await client.deleteLibrary(id: library.id)
        await load()
    }
}

/// 媒體庫: libraries on the left, the selected library's files on the right.
struct LibrariesView: View {
    @Environment(ServerSession.self) private var session
    @Environment(BackdropStore.self) private var backdrop
    @State private var store: LibrariesStore?
    @State private var showAdd = false
    @State private var editing: Library?
    @State private var confirmDelete: Library?
    @ObserveInjection private var inject

    var body: some View {
        Group {
            if let store { content(store) } else { Color.clear }
        }
        .navigationTitle("媒體庫")
        .task {
            if store == nil { store = LibrariesStore(client: session.client) }
            backdrop.set(nil, seed: "libraries", dim: 0.6, owner: "libraries")
            await store?.load()
        }
        .task(id: session.eventGeneration) {
            guard session.eventGeneration > 0, let event = session.lastEvent else { return }
            await store?.handle(event)
        }
    }

    private func content(_ store: LibrariesStore) -> some View {
        HStack(spacing: 0) {
            librariesColumn(store)
                .frame(width: 260)
            Divider()
            if let library = store.selected {
                LibraryDetailView(library: library, store: store, client: session.client)
                    .id(library.id)
            } else {
                EmptyState(
                    symbol: "folder.badge.plus",
                    title: String(localized: "還沒有媒體庫"),
                    message: String(localized: "加入伺服器上的資料夾，掃描後就能在首頁看到作品。"),
                    actionTitle: String(localized: "新增媒體庫")
                ) { showAdd = true }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .sheet(isPresented: $showAdd) {
            LibraryFormSheet(client: session.client, editing: nil) { saved in
                await store.reload(selecting: saved.id)
            }
        }
        .sheet(item: $editing) { library in
            LibraryFormSheet(client: session.client, editing: library) { _ in
                await store.reload()
            }
        }
        .confirmationDialog(
            String(localized: "刪除媒體庫「\(confirmDelete?.name ?? "")」？"),
            isPresented: Binding(get: { confirmDelete != nil }, set: { if !$0 { confirmDelete = nil } }),
            titleVisibility: .visible
        ) {
            Button("刪除", role: .destructive) {
                if let library = confirmDelete { Task { await store.delete(library) } }
                confirmDelete = nil
            }
        } message: {
            Text("只移除索引，不會刪除磁碟上的檔案。")
        }
    }

    private func librariesColumn(_ store: LibrariesStore) -> some View {
        VStack(spacing: 0) {
            HStack {
                SectionLabel(title: String(localized: "媒體庫"), count: store.libraries.value?.count)
                Spacer()
                RowIconButton(symbol: "plus", label: String(localized: "新增媒體庫")) { showAdd = true }
            }
            .padding(.horizontal, 12).padding(.top, 14).padding(.bottom, 6)
            List(selection: Binding(get: { store.selectedID }, set: { store.selectedID = $0 })) {
                ForEach(store.libraries.value ?? []) { library in
                    LibraryRow(library: library, scan: store.scans[library.id])
                        .tag(library.id)
                        .contextMenu {
                            Button("重新掃描", systemImage: "arrow.clockwise") { Task { await store.scan(library) } }
                            Button("編輯媒體庫…", systemImage: "pencil") { editing = library }
                            Divider()
                            Button("刪除媒體庫…", systemImage: "trash", role: .destructive) { confirmDelete = library }
                        }
                }
            }
            .listStyle(.sidebar)
            .scrollContentBackground(.hidden)
            if case let .failed(message) = store.libraries {
                ErrorBanner(message: message) { Task { await store.load() } }.padding(12)
            }
        }
    }
}

private struct LibraryRow: View {
    let library: Library
    let scan: ScanProgress?

    private var isScanning: Bool { scan != nil && scan?.type != ServerEventType.scanError }

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: library.isLocal ? "internaldrive" : "externaldrive.connected.to.line.below")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.accent)
                .frame(width: 30, height: 30)
                .background(Theme.accent.opacity(0.14), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(library.name).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                    if isScanning { ProgressView().controlSize(.mini) }
                    if !library.enabled {
                        Text("已停用").font(.system(size: 9, weight: .bold)).foregroundStyle(Theme.Text.tertiary)
                            .padding(.horizontal, 5).padding(.vertical, 1).background(Theme.ink(0.08), in: Capsule())
                    }
                }
                if let scan, isScanning {
                    Text(scanText(scan)).font(.system(size: 11)).foregroundStyle(Theme.accent).lineLimit(1).monospacedDigit()
                } else {
                    let size = ByteCountFormatter.string(fromByteCount: library.totalSizeBytes, countStyle: .file)
                    Text("\(library.fileCount) 檔案 · \(size)")
                        .font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary).lineLimit(1).monospacedDigit()
                }
                if library.fileCount > 0, !isScanning {
                    ThinProgress(fraction: Double(library.matchedCount) / Double(library.fileCount), tint: Color(hex: 0x4ADE80), height: 2)
                        .padding(.top, 2)
                }
            }
        }
        .padding(.vertical, 4)
    }

    private func scanText(_ scan: ScanProgress) -> String {
        switch scan.type {
        case ServerEventType.scanHash: String(localized: "雜湊中 \(scan.filesHashed)/\(scan.filesTotal)")
        case ServerEventType.matchProgress, ServerEventType.matchStarted: String(localized: "匹配中 \(scan.filesMatched)/\(scan.filesTotal)")
        default: String(localized: "掃描中 · 找到 \(scan.filesFound) 個檔案")
        }
    }
}

/// Right column: stats, scan, and the media-file table.
struct LibraryDetailView: View {
    let library: Library
    let store: LibrariesStore
    let client: APIClient

    @Environment(Router.self) private var router
    @State private var filter: MediaFileFilter = .all
    @State private var query = ""
    @State private var loadedQuery = ""
    @State private var page: Loadable<MediaFilesPage> = .idle
    @State private var pageNumber = 1
    @State private var selection: Set<String> = []
    @State private var matching: MediaFileRow?
    @State private var sort = MediaFileSort(key: .filename, ascending: true)
    @State private var showDuplicates = false
    @State private var showMissing = false
    @State private var showRename = false

    var body: some View {
        VStack(spacing: 0) {
            header
            toolbar
            table
            Divider()
            footer
        }
        .task(id: "\(library.id)|\(filter.rawValue)|\(pageNumber)|\(store.scans[library.id] == nil)") { await load() }
        .sheet(item: $matching) { row in
            MatchSheet(row: row, client: client) { await load(); await store.load() }
        }
        .sheet(isPresented: $showDuplicates) {
            DuplicatesSheet(library: library, client: client) { await load(); await store.load() }
        }
        .sheet(isPresented: $showMissing) {
            MissingSummarySheet(library: library, client: client) { bangumiID in
                router.openAnime(bangumiID)
            }
        }
        .sheet(isPresented: $showRename) {
            RenameSheet(library: library, client: client) { await load(); await store.load() }
        }
    }

    private var header: some View {
        let scan = store.scans[library.id]
        let scanning = scan != nil && scan?.type != ServerEventType.scanError
        return VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 16) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(library.name).font(.system(size: 22, weight: .bold)).tracking(-0.3)
                    Button(action: copyPath) {
                        HStack(spacing: 5) {
                            Image(systemName: "folder").font(.system(size: 10, weight: .semibold))
                            Text(library.path).font(.system(size: 12, design: .monospaced)).lineLimit(1).truncationMode(.middle)
                        }
                        .foregroundStyle(Theme.Text.tertiary)
                    }
                    .buttonStyle(.plain)
                    .help("複製路徑")
                }
                Spacer()
                ChipMenu(title: String(localized: "工具"), symbol: "wrench.and.screwdriver") {
                    Button("重複檔案…", systemImage: "doc.on.doc") { showDuplicates = true }
                    Button("缺集摘要…", systemImage: "questionmark.folder") { showMissing = true }
                    Button("重新命名…", systemImage: "textformat.abc") { showRename = true }
                }
                ChipButton(
                    title: scanning ? String(localized: "掃描中…") : String(localized: "掃描"),
                    symbol: "arrow.clockwise", prominent: true, busy: scanning
                ) { Task { await store.scan(library) } }
                .disabled(scanning)
            }
            HStack(spacing: 8) {
                stat(String(localized: "檔案"), "\(library.fileCount)")
                stat(String(localized: "已匹配"), "\(library.matchedCount)", tint: Color(hex: 0x4ADE80))
                stat(String(localized: "未匹配"), "\(library.unmatchedCount)", tint: library.unmatchedCount > 0 ? Color(hex: 0xFBBF24) : nil)
                stat(String(localized: "大小"), ByteCountFormatter.string(fromByteCount: library.totalSizeBytes, countStyle: .file))
                stat(String(localized: "上次掃描"), library.lastScannedAt.map(Formatters.relative) ?? "—")
            }
            LibraryStorageBar(library: library, client: client)
            if let scan {
                if scan.type == ServerEventType.scanError {
                    Label(scan.error ?? String(localized: "掃描失敗"), systemImage: "exclamationmark.triangle")
                        .font(.system(size: 12, weight: .medium)).foregroundStyle(Color(hex: 0xF87171))
                } else {
                    HStack(spacing: 8) {
                        ProgressView().controlSize(.small)
                        Text(scanText(scan)).font(.system(size: 12, weight: .medium)).foregroundStyle(Theme.accent).monospacedDigit()
                    }
                }
            }
        }
        .padding(.horizontal, 24).padding(.top, 18).padding(.bottom, 16)
    }

    private func stat(_ label: String, _ value: String, tint: Color? = nil) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.system(size: 15, weight: .semibold)).monospacedDigit().foregroundStyle(tint ?? Theme.Text.primary).lineLimit(1)
            Text(label).font(.system(size: 10.5)).foregroundStyle(Theme.Text.tertiary)
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .frame(minWidth: 84, alignment: .leading)
        .background(Theme.ink(0.04), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func scanText(_ scan: ScanProgress) -> String {
        switch scan.type {
        case ServerEventType.scanHash: String(localized: "雜湊中 \(scan.filesHashed)/\(scan.filesTotal)")
        case ServerEventType.matchProgress, ServerEventType.matchStarted: String(localized: "匹配中 \(scan.filesMatched)/\(scan.filesTotal)")
        default: String(localized: "掃描中 · 找到 \(scan.filesFound) 個檔案")
        }
    }

    private func copyPath() {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(library.path, forType: .string)
    }

    private var toolbar: some View {
        PageBar {
            FilterTabs(
                tabs: [
                    FilterTab(value: MediaFileFilter.all, label: String(localized: "全部"), badge: library.fileCount),
                    FilterTab(value: .matched, label: String(localized: "已匹配"), badge: library.matchedCount),
                    FilterTab(value: .unmatched, label: String(localized: "未匹配"), badge: library.unmatchedCount),
                ],
                selection: $filter
            )
        } trailing: {
            if !selection.isEmpty {
                Button("取消匹配 \(selection.count) 個", systemImage: "link.badge.plus") { Task { await unmatchSelected() } }
                    .glassButtonStyle()
            }
            SearchField(prompt: String(localized: "搜尋檔名…"), text: $query, width: 200)
        }
        .padding(.horizontal, 24)
        .onChange(of: filter) { pageNumber = 1 }
        .task(id: query) {
            guard query != loadedQuery else { return }
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            pageNumber = 1
            await load()
        }
    }

    @ViewBuilder
    private var table: some View {
        switch page {
        case let .loaded(page) where page.items.isEmpty:
            EmptyState(
                symbol: "doc.questionmark",
                title: filter == .unmatched ? String(localized: "沒有未匹配的檔案") : String(localized: "沒有檔案"),
                message: library.fileCount == 0 ? String(localized: "掃描後會列出這個資料夾裡的影片。") : String(localized: "換個篩選條件試試。")
            )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case let .loaded(page):
            let rows = page.items.sorted(using: sort)
            ScrollView {
                VStack(spacing: 0) {
                    MediaFileListHeader(sort: $sort)
                    ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                        if index > 0 { RowDivider() }
                        MediaFileListRow(row: row, selected: selection.contains(row.id)) {
                            select(row, in: rows)
                        } onMatch: {
                            matching = row
                        } onUnmatch: {
                            Task { await unmatch(row) }
                        } onRemove: {
                            Task { await remove(row) }
                        }
                    }
                }
                .groupedCard()
                .padding(.horizontal, 24).padding(.top, 14).padding(.bottom, 20)
            }
        case let .failed(message):
            ErrorBanner(message: message) { Task { await load() } }.padding(24)
        default:
            ScrollView {
                SkeletonRows(count: 10, height: 44, leading: 0)
                    .padding(.horizontal, 24).padding(.top, 14).padding(.bottom, 20)
            }
        }
    }

    private var footer: some View {
        HStack(spacing: 8) {
            if let page = page.value {
                let pages = max(1, Int((Double(page.total) / Double(max(1, page.perPage))).rounded(.up)))
                Text("\(page.total) 個檔案").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary).monospacedDigit()
                Spacer()
                if pages > 1 {
                    RowIconButton(symbol: "chevron.left", label: String(localized: "上一頁")) { pageNumber = max(1, pageNumber - 1) }
                        .disabled(pageNumber <= 1).opacity(pageNumber <= 1 ? 0.4 : 1)
                    Text("\(pageNumber) / \(pages)").font(.system(size: 11, weight: .medium)).monospacedDigit().foregroundStyle(Theme.Text.secondary)
                    RowIconButton(symbol: "chevron.right", label: String(localized: "下一頁")) { pageNumber = min(pages, pageNumber + 1) }
                        .disabled(pageNumber >= pages).opacity(pageNumber >= pages ? 0.4 : 1)
                }
            }
        }
        .padding(.horizontal, 24).padding(.vertical, 8)
    }

    /// Click selects one row; ⌘-click toggles; ⇧-click extends from the
    /// last selected row, the way an AppKit table behaves.
    private func select(_ row: MediaFileRow, in rows: [MediaFileRow]) {
        let flags = NSApp.currentEvent?.modifierFlags ?? []
        if flags.contains(.command) {
            if selection.contains(row.id) { selection.remove(row.id) } else { selection.insert(row.id) }
        } else if flags.contains(.shift),
                  let anchor = rows.lastIndex(where: { selection.contains($0.id) }),
                  let target = rows.firstIndex(of: row) {
            for r in rows[min(anchor, target) ... max(anchor, target)] { selection.insert(r.id) }
        } else {
            selection = selection == [row.id] ? [] : [row.id]
        }
    }

    private func load() async {
        page = page.reloading
        let libraryID = library.id
        let filter = filter
        let query = query
        let pageNumber = pageNumber
        page = await page.reloaded { try await client.mediaFiles(libraryID: libraryID, filter: filter, query: query, page: pageNumber) }
        loadedQuery = query
        selection = []
    }

    private func unmatch(_ row: MediaFileRow) async {
        try? await client.unmatchMediaFile(id: row.id)
        await load()
        await store.load()
    }

    private func remove(_ row: MediaFileRow) async {
        try? await client.deleteMediaFile(id: row.id)
        await load()
        await store.load()
    }

    private func unmatchSelected() async {
        for id in selection { try? await client.unmatchMediaFile(id: id) }
        await load()
        await store.load()
    }
}

// MARK: - File list

struct MediaFileSort: Equatable {
    enum Key { case filename, title, status, size, subtitles }
    var key: Key
    var ascending: Bool

    /// Selecting the active column flips direction; a new column sorts ascending.
    mutating func toggle(_ key: Key) {
        if self.key == key { ascending.toggle() } else { self = .init(key: key, ascending: true) }
    }
}

private extension [MediaFileRow] {
    func sorted(using sort: MediaFileSort) -> [MediaFileRow] {
        let order: SortOrder = sort.ascending ? .forward : .reverse
        return switch sort.key {
        case .filename: sorted(using: KeyPathComparator(\.filename, order: order))
        case .title: sorted(using: [KeyPathComparator(\.matchedAnimeTitle, order: order), KeyPathComparator(\.matchedEpisodeSort, order: order)])
        case .status: sorted(using: KeyPathComparator(\.matchStatus, order: order))
        case .size: sorted(using: KeyPathComparator(\.sizeBytes, order: order))
        case .subtitles: sorted(using: KeyPathComparator(\.subtitleCount, order: order))
        }
    }
}

/// Fixed trailing column widths shared by the header and rows so the
/// columns line up without a `Table`; 檔名 takes the remaining width.
private enum FileColumns {
    static let title: CGFloat = 280
    static let status: CGFloat = 72
    static let size: CGFloat = 78
    static let subtitles: CGFloat = 40
    static let actions: CGFloat = 66
    static let spacing: CGFloat = 14
}

private struct MediaFileListHeader: View {
    @Binding var sort: MediaFileSort

    var body: some View {
        HStack(spacing: FileColumns.spacing) {
            header(String(localized: "檔名"), key: .filename).frame(maxWidth: .infinity, alignment: .leading)
            header(String(localized: "作品"), key: .title).frame(width: FileColumns.title, alignment: .leading)
            header(String(localized: "狀態"), key: .status).frame(width: FileColumns.status, alignment: .leading)
            header(String(localized: "大小"), key: .size, trailing: true).frame(width: FileColumns.size, alignment: .trailing)
            header(String(localized: "字幕"), key: .subtitles, trailing: true).frame(width: FileColumns.subtitles, alignment: .trailing)
            Color.clear.frame(width: FileColumns.actions, height: 1)
        }
        .padding(.horizontal, 14).padding(.vertical, 8)
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.ink(0.06)).frame(height: 1) }
    }

    private func header(_ label: String, key: MediaFileSort.Key, trailing: Bool = false) -> some View {
        let active = sort.key == key
        return Button { sort.toggle(key) } label: {
            HStack(spacing: 3) {
                if trailing, active { chevron }
                Text(label).font(.system(size: 11, weight: .bold)).lineLimit(1)
                if !trailing, active { chevron }
            }
            .foregroundStyle(active ? Theme.Text.secondary : Theme.Text.tertiary)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(active ? .isSelected : [])
    }

    private var chevron: some View {
        Image(systemName: sort.ascending ? "chevron.up" : "chevron.down").font(.system(size: 8, weight: .bold))
    }
}

private struct MediaFileListRow: View {
    let row: MediaFileRow
    let selected: Bool
    let onSelect: () -> Void
    let onMatch: () -> Void
    let onUnmatch: () -> Void
    let onRemove: () -> Void

    @Environment(Router.self) private var router
    @State private var hovered = false
    @State private var titleHovered = false
    @State private var confirmDelete = false
    /// Server path resolved through the player's local path mappings; nil
    /// when this Mac can't see the file, so 在 Finder 顯示 is disabled.
    private var localURL: URL? { LocalPathMappings.shared.localURL(forServerPath: row.path) }

    var body: some View {
        HStack(spacing: FileColumns.spacing) {
            Text(row.filename)
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(Theme.ink(0.8))
                .lineLimit(1).truncationMode(.middle)
                .frame(maxWidth: .infinity, alignment: .leading)
                .help(row.path)
            title.frame(width: FileColumns.title, alignment: .leading)
            status.frame(width: FileColumns.status, alignment: .leading)
            Text(ByteCountFormatter.string(fromByteCount: row.sizeBytes, countStyle: .file))
                .font(.system(size: 11.5)).monospacedDigit().foregroundStyle(Theme.Text.tertiary).lineLimit(1)
                .frame(width: FileColumns.size, alignment: .trailing)
            Text(row.subtitleCount > 0 ? "\(row.subtitleCount)" : "—")
                .font(.system(size: 11.5)).monospacedDigit()
                .foregroundStyle(row.subtitleCount > 0 ? Theme.Text.tertiary : Theme.Text.muted)
                .frame(width: FileColumns.subtitles, alignment: .trailing)
            actions.frame(width: FileColumns.actions, alignment: .trailing)
        }
        .padding(.horizontal, 14).padding(.vertical, 7)
        .background(rowBackground, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .padding(3)
        .contentShape(Rectangle())
        .onTapGesture(perform: onSelect)
        .onHover { hovered = $0 }
        .animation(.easeOut(duration: 0.12), value: hovered)
        .contextMenu {
            if row.isMatched { Button("作品頁", systemImage: "info.circle") { router.openAnime(row.matchedBangumiID) } }
            Button("手動匹配…", systemImage: "link", action: onMatch)
            if row.isMatched { Button("取消匹配", systemImage: "link.badge.plus", action: onUnmatch) }
            Divider()
            if let localURL {
                Button("在 Finder 顯示", systemImage: "folder") { NSWorkspace.shared.activateFileViewerSelecting([localURL]) }
            } else {
                Button("在 Finder 顯示（需設定本機路徑對應）", systemImage: "folder") {}.disabled(true)
            }
            Button("複製路徑", systemImage: "doc.on.doc", action: copyPath)
            Divider()
            Button("從磁碟刪除…", systemImage: "trash", role: .destructive) { confirmDelete = true }
        }
        // DELETE /media-files/:id removes the file from disk, not just the row.
        .confirmationDialog(String(localized: "刪除「\(String(row.filename))」？"), isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("從磁碟刪除", role: .destructive, action: onRemove)
        } message: {
            Text("檔案會從磁碟永久刪除，無法復原。")
        }
    }

    private var rowBackground: Color {
        if selected { return Theme.accent.opacity(0.14) }
        return hovered ? Theme.ink(0.04) : .clear
    }

    @ViewBuilder
    private var title: some View {
        if row.isMatched {
            Button { router.openAnime(row.matchedBangumiID) } label: {
                HStack(spacing: 6) {
                    Text(row.matchedAnimeTitle)
                        .font(.system(size: 12.5))
                        .foregroundStyle(titleHovered ? Theme.accent : Theme.Text.secondary)
                        .lineLimit(1)
                    Text(Formatters.episode(row.matchedEpisodeSort))
                        .font(.system(size: 10, weight: .bold)).monospacedDigit()
                        .foregroundStyle(Theme.Text.tertiary)
                        .padding(.horizontal, 5).padding(.vertical, 1.5)
                        .background(Theme.ink(0.06), in: Capsule())
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .onHover { titleHovered = $0 }
            .help(row.matchedAnimeTitle)
        } else {
            Text("—").font(.system(size: 12.5)).foregroundStyle(Theme.Text.muted)
        }
    }

    private var status: some View {
        HStack(spacing: 5) {
            Circle().fill(statusTint).frame(width: 6, height: 6)
            Text(statusLabel).font(.system(size: 11, weight: .medium)).foregroundStyle(Theme.Text.secondary).lineLimit(1)
        }
    }

    private var statusLabel: String {
        switch row.matchStatus {
        case "auto": String(localized: "自動")
        case "manual": String(localized: "手動")
        default: String(localized: "未匹配")
        }
    }

    private var statusTint: Color {
        switch row.matchStatus {
        case "auto": Color(hex: 0x4ADE80)
        case "manual": Theme.accent
        default: Color(hex: 0xFBBF24)
        }
    }

    /// Matched rows: quiet icons on hover. Unmatched rows: the 匹配 chip
    /// stays visible, since that's the row's whole point.
    private var actions: some View {
        HStack(spacing: 4) {
            if row.isMatched {
                RowIconButton(symbol: "info.circle", label: String(localized: "作品頁")) { router.openAnime(row.matchedBangumiID) }
                RowIconButton(symbol: "link.badge.plus", label: String(localized: "取消匹配"), action: onUnmatch)
            } else {
                RowIconButton(symbol: "link", label: String(localized: "手動匹配…"), prominent: true, action: onMatch)
                RowIconButton(symbol: "trash", label: String(localized: "從磁碟刪除…"), destructive: true) { confirmDelete = true }
            }
        }
        .opacity(hovered || !row.isMatched ? 1 : 0)
    }

    private func copyPath() {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(row.path, forType: .string)
    }
}

/// Two-step manual match: find the series, then pick the episode.
private struct MatchSheet: View {
    let row: MediaFileRow
    let client: APIClient
    var onDone: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var results: Loadable<[AnimeSummary]> = .idle
    @State private var picked: AnimeSummary?
    @State private var episodes: Loadable<[DiscoverEpisode]> = .idle
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("手動匹配").font(.system(size: 16, weight: .bold))
            Text(row.filename).font(.system(size: 12, design: .monospaced)).foregroundStyle(Theme.Text.tertiary).lineLimit(2)
            if let picked {
                HStack(spacing: 10) {
                    RemoteImage(url: picked.coverImage, maxPixel: 120) { Rectangle().fill(Theme.animeGradient(picked.title)) }
                        .frame(width: 36, height: 50).clipShape(RoundedRectangle(cornerRadius: 4))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(picked.title).font(.system(size: 13, weight: .semibold))
                        Text("Bangumi \(picked.bangumiID)").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                    }
                    Spacer()
                    Button("換一部") { self.picked = nil; episodes = .idle }
                }
                episodeList
            } else {
                HStack {
                    TextField("搜尋作品", text: $query).textFieldStyle(.roundedBorder).onSubmit { Task { await search() } }
                    Button("搜尋") { Task { await search() } }.disabled(query.isEmpty)
                }
                resultList
            }
            if let error { Text(error).font(.system(size: 12)).foregroundStyle(Color(hex: 0xF87171)) }
            HStack {
                Spacer()
                Button("取消") { dismiss() }.keyboardShortcut(.cancelAction)
            }
        }
        .padding(20)
        .frame(width: 520, height: 520)
        .task {
            query = Self.guessTitle(from: row.filename)
            if !query.isEmpty { await search() }
        }
    }

    @ViewBuilder
    private var resultList: some View {
        switch results {
        case let .loaded(list):
            List(list) { anime in
                Button {
                    picked = anime
                    Task { await loadEpisodes(anime) }
                } label: {
                    HStack(spacing: 10) {
                        RemoteImage(url: anime.coverImage, maxPixel: 120) { Rectangle().fill(Theme.animeGradient(anime.title)) }
                            .frame(width: 32, height: 44).clipShape(RoundedRectangle(cornerRadius: 4))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(anime.title).font(.system(size: 13, weight: .medium)).lineLimit(1)
                            let meta = [Formatters.season(from: anime.airDate), anime.episodeCount > 0 ? String(localized: "\(anime.episodeCount) 集") : nil]
                            Text(meta.compactMap { $0 }.joined(separator: " · "))
                                .font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .listStyle(.plain)
        case let .failed(message):
            ErrorBanner(message: message) { Task { await search() } }
        case .loading:
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        case .idle:
            Spacer()
        }
    }

    @ViewBuilder
    private var episodeList: some View {
        switch episodes {
        case let .loaded(list):
            List(list) { episode in
                Button {
                    Task { await match(episode) }
                } label: {
                    HStack {
                        let number = episode.sort.rounded() == episode.sort ? String(Int(episode.sort)) : String(episode.sort)
                        Text("第 \(number) 集").font(.system(size: 13, weight: .medium)).frame(width: 70, alignment: .leading)
                        Text(episode.title).lineLimit(1)
                        Spacer()
                        if let date = episode.airDate { Text(date).font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary) }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .listRowBackground(episode.sort == row.matchedEpisodeSort ? Theme.accent.opacity(0.1) : Color.clear)
            }
            .listStyle(.plain)
        case let .failed(message):
            ErrorBanner(message: message) { if let picked { Task { await loadEpisodes(picked) } } }
        default:
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func search() async {
        results = results.reloading
        results = await results.reloaded { try await client.searchAnime(query) }
    }

    private func loadEpisodes(_ anime: AnimeSummary) async {
        episodes = episodes.reloading
        episodes = await episodes.reloaded { try await client.discoverEpisodes(bangumiID: anime.bangumiID) }
    }

    private func match(_ episode: DiscoverEpisode) async {
        guard let picked else { return }
        do {
            try await client.matchMediaFile(id: row.id, bangumiID: picked.bangumiID, episodeID: episode.bangumiEpisodeID)
            await onDone()
            dismiss()
        } catch {
            self.error = (error as? APIError)?.serverMessage.flatMap { $0.isEmpty ? nil : $0 } ?? error.localizedDescription
        }
    }

    /// "[Sub] Title - 01 [1080p].mkv" → "Title".
    static func guessTitle(from filename: String) -> String {
        var name = (filename as NSString).deletingPathExtension
        name = name.replacingOccurrences(of: #"\[[^\]]*\]"#, with: " ", options: .regularExpression)
        name = name.replacingOccurrences(of: #"\([^)]*\)"#, with: " ", options: .regularExpression)
        if let range = name.range(of: #"\s-\s*\d+"#, options: .regularExpression) { name = String(name[..<range.lowerBound]) }
        name = name.replacingOccurrences(of: #"(?i)\b(S\d+E\d+|EP?\s*\d+|第\d+[話集])\b.*$"#, with: "", options: .regularExpression)
        return name.replacingOccurrences(of: "_", with: " ").trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

/// Volume usage under the stats: library share, other data, free space,
/// this month's downloads — and a quiet warning row once free space drops
/// under 5 %, well before aria2 starts failing writes.
private struct LibraryStorageBar: View {
    let library: Library
    let client: APIClient
    @State private var capacity: LibraryCapacity?

    private static let warnFraction = 0.05

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let capacity, let used = capacity.usedFraction {
                let libraryShare = min(used, Double(library.totalSizeBytes) / Double(capacity.totalBytes))
                let freeFraction = 1 - used
                GeometryReader { proxy in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Theme.ink(0.08))
                        Capsule().fill(Theme.ink(0.28)).frame(width: proxy.size.width * used)
                        Capsule().fill(Theme.accent).frame(width: proxy.size.width * libraryShare)
                    }
                }
                .frame(height: 6)
                HStack(spacing: 12) {
                    legend(Theme.accent, Self.labelled("媒體庫", size: Self.bytes(library.totalSizeBytes)))
                    legend(Theme.ink(0.28), Self.labelled("其他", size: Self.bytes(max(0, capacity.usedBytes - library.totalSizeBytes))))
                    legend(Theme.ink(0.08), Self.labelled("可用", size: Self.bytes(capacity.freeBytes)))
                    if capacity.downloadedThisMonthBytes > 0 {
                        let size = Self.bytes(capacity.downloadedThisMonthBytes)
                        Text("本月下載 \(size)").foregroundStyle(Theme.Text.tertiary)
                    }
                    Spacer()
                }
                .font(.system(size: 11))
                .monospacedDigit()
                if freeFraction < Self.warnFraction {
                    let size = Self.bytes(capacity.freeBytes)
                    Label(
                        String(localized: "磁碟只剩 \(size)，下載快將失敗；清理重複檔案或看過的集數騰出空間。"),
                        systemImage: "externaldrive.badge.exclamationmark"
                    )
                    .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Color(hex: 0xFBBF24))
                }
            } else if let capacity, capacity.downloadedThisMonthBytes > 0 {
                let size = Self.bytes(capacity.downloadedThisMonthBytes)
                Text("本月下載 \(size)")
                    .font(.system(size: 11)).monospacedDigit().foregroundStyle(Theme.Text.tertiary)
            }
        }
        .task(id: library.id) { capacity = try? await client.libraryCapacity(id: library.id) }
    }

    private func legend(_ color: Color, _ text: String) -> some View {
        HStack(spacing: 5) {
            Circle().fill(color).frame(width: 7, height: 7)
            Text(text).foregroundStyle(Theme.Text.secondary)
        }
    }

    private static func bytes(_ count: Int64) -> String {
        ByteCountFormatter.string(fromByteCount: count, countStyle: .file)
    }

    /// "媒體庫 12.3 GB": the legend word, then the size.
    private static func labelled(_ word: String.LocalizationValue, size: String) -> String {
        "\(String(localized: word)) \(size)"
    }
}
