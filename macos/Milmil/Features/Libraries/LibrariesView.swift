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
        .onDisappear { backdrop.clear(owner: "libraries") }
    }

    private func content(_ store: LibrariesStore) -> some View {
        HStack(spacing: 0) {
            librariesColumn(store)
                .frame(width: 280)
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
                Text("媒體庫").font(.system(size: 13, weight: .bold)).foregroundStyle(Theme.Text.tertiary)
                Spacer()
                Button { showAdd = true } label: { Image(systemName: "plus") }.buttonStyle(.plain).help("新增媒體庫")
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
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

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: library.isLocal ? "internaldrive" : "externaldrive.connected.to.line.below")
                .font(.system(size: 16)).foregroundStyle(Theme.accent).frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(library.name).font(.system(size: 13, weight: .semibold))
                if let scan, scan.type != ServerEventType.scanError {
                    Text(scanText(scan)).font(.system(size: 11)).foregroundStyle(Theme.accent).lineLimit(1)
                } else {
                    let size = ByteCountFormatter.string(fromByteCount: library.totalSizeBytes, countStyle: .file)
                    Text("\(library.fileCount) 檔案 · \(library.unmatchedCount) 未匹配 · \(size)")
                        .font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary).lineLimit(1)
                }
            }
        }
        .padding(.vertical, 2)
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
    @State private var page: Loadable<MediaFilesPage> = .idle
    @State private var pageNumber = 1
    @State private var selection: Set<String> = []
    @State private var matching: MediaFileRow?
    @State private var sortOrder = [KeyPathComparator(\MediaFileRow.filename)]
    @State private var showDuplicates = false
    @State private var showMissing = false
    @State private var showRename = false

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
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
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text(library.name).font(.system(size: 20, weight: .bold))
                Text(library.path).font(.system(size: 12, design: .monospaced)).foregroundStyle(Theme.Text.tertiary).lineLimit(1).truncationMode(.middle)
                HStack(spacing: 12) {
                    stat(String(localized: "檔案"), library.fileCount)
                    stat(String(localized: "已匹配"), library.matchedCount)
                    stat(String(localized: "未匹配"), library.unmatchedCount, warn: library.unmatchedCount > 0)
                    if let date = library.lastScannedAt {
                        Text("上次掃描 \(Formatters.relative(date))").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                    }
                }
                .padding(.top, 4)
            }
            Spacer()
            if let scan = store.scans[library.id] {
                if scan.type == ServerEventType.scanError {
                    Label(scan.error ?? String(localized: "掃描失敗"), systemImage: "exclamationmark.triangle")
                        .foregroundStyle(Color(hex: 0xF87171)).font(.system(size: 12))
                } else {
                    ProgressView().controlSize(.small)
                }
            }
            Menu {
                Button("重複檔案…", systemImage: "doc.on.doc") { showDuplicates = true }
                Button("缺集摘要…", systemImage: "questionmark.folder") { showMissing = true }
                Button("重新命名…", systemImage: "textformat.abc") { showRename = true }
            } label: {
                Label("工具", systemImage: "wrench.and.screwdriver")
            }
            .fixedSize()
            Button("掃描", systemImage: "arrow.clockwise") { Task { await store.scan(library) } }
                .glassProminentButtonStyle()
                .disabled(store.scans[library.id] != nil && store.scans[library.id]?.type != ServerEventType.scanError)
        }
        .padding(.horizontal, 24).padding(.vertical, 18)
    }

    private func stat(_ label: String, _ value: Int, warn: Bool = false) -> some View {
        HStack(spacing: 4) {
            Text("\(value)").font(.system(size: 13, weight: .semibold)).monospacedDigit().foregroundStyle(warn ? Color(hex: 0xFBBF24) : .primary)
            Text(label).font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
        }
    }

    private var toolbar: some View {
        HStack(spacing: 10) {
            Segmented(options: MediaFileFilter.allCases, selection: $filter) { filter in
                switch filter {
                case .all: String(localized: "全部")
                case .matched: String(localized: "已匹配")
                case .unmatched: String(localized: "未匹配")
                }
            }
            TextField("搜尋檔名…", text: $query).textFieldStyle(.roundedBorder).frame(width: 220)
                .onSubmit { pageNumber = 1; Task { await load() } }
            Spacer()
            if !selection.isEmpty {
                Button("取消匹配 \(selection.count) 個") { Task { await unmatchSelected() } }.controlSize(.small)
            }
        }
        .padding(.horizontal, 24).padding(.vertical, 10)
        .onChange(of: filter) { pageNumber = 1 }
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
            Table(page.items.sorted(using: sortOrder), selection: $selection, sortOrder: $sortOrder) {
                TableColumn(String(localized: "檔名"), value: \.filename) { row in
                    Text(row.filename).lineLimit(1).truncationMode(.middle).help(row.path)
                }
                TableColumn(String(localized: "狀態")) { row in
                    PillBadge(text: statusLabel(row), tint: statusTint(row))
                }
                .width(80)
                TableColumn(String(localized: "作品")) { row in
                    if row.isMatched {
                        Button { router.openAnime(row.matchedBangumiID) } label: {
                            Text("\(row.matchedAnimeTitle) · EP \(Formatters.episode(row.matchedEpisodeSort).dropFirst(3))").lineLimit(1)
                        }
                        .buttonStyle(.plain).foregroundStyle(Theme.accent)
                    } else {
                        Button("匹配…") { matching = row }.controlSize(.small)
                    }
                }
                TableColumn(String(localized: "大小")) { row in
                    Text(ByteCountFormatter.string(fromByteCount: row.sizeBytes, countStyle: .file)).monospacedDigit().foregroundStyle(Theme.Text.tertiary)
                }
                .width(80)
                TableColumn(String(localized: "字幕")) { row in
                    Text(row.subtitleCount > 0 ? "\(row.subtitleCount)" : "—").foregroundStyle(Theme.Text.tertiary)
                }
                .width(40)
            }
            .alternatingRowBackgrounds(.disabled)
            .contextMenu(forSelectionType: String.self) { ids in
                if let id = ids.first, let row = page.items.first(where: { $0.id == id }) {
                    if row.isMatched { Button("作品頁", systemImage: "info.circle") { router.openAnime(row.matchedBangumiID) } }
                    Button("手動匹配…", systemImage: "link") { matching = row }
                    if row.isMatched {
                        Button("取消匹配", systemImage: "link.badge.plus") { Task { await unmatch(row) } }
                    }
                    Button("在 Finder 顯示路徑", systemImage: "doc.on.doc") {
                        NSPasteboard.general.clearContents()
                        NSPasteboard.general.setString(row.path, forType: .string)
                    }
                    Divider()
                    Button("從媒體庫移除", systemImage: "trash", role: .destructive) { Task { await remove(row) } }
                }
            }
        case let .failed(message):
            ErrorBanner(message: message) { Task { await load() } }.padding(24)
        default:
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private var footer: some View {
        HStack {
            if let page = page.value {
                let pages = max(1, Int((Double(page.total) / Double(max(1, page.perPage))).rounded(.up)))
                Text("\(page.total) 個檔案").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                Spacer()
                Button { pageNumber = max(1, pageNumber - 1) } label: { Image(systemName: "chevron.left") }.disabled(pageNumber <= 1)
                Text("\(pageNumber) / \(pages)").font(.system(size: 11)).monospacedDigit()
                Button { pageNumber = min(pages, pageNumber + 1) } label: { Image(systemName: "chevron.right") }.disabled(pageNumber >= pages)
            }
        }
        .controlSize(.small)
        .padding(.horizontal, 24).padding(.vertical, 8)
    }

    private func statusLabel(_ row: MediaFileRow) -> String {
        switch row.matchStatus {
        case "auto": String(localized: "自動")
        case "manual": String(localized: "手動")
        default: String(localized: "未匹配")
        }
    }

    private func statusTint(_ row: MediaFileRow) -> Color {
        row.isMatched ? Color(hex: 0x4ADE80).opacity(0.25) : Color(hex: 0xFBBF24).opacity(0.3)
    }

    private func load() async {
        page = page.reloading
        let libraryID = library.id
        let filter = filter
        let query = query
        let pageNumber = pageNumber
        page = await page.reloaded { try await client.mediaFiles(libraryID: libraryID, filter: filter, query: query, page: pageNumber) }
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
