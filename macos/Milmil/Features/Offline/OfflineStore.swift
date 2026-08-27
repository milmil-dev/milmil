import AppKit
import Foundation
import MilmilAPI
import Observation

/// Episodes kept on this Mac (離線到本機): the on-disk index, the files under
/// `Application Support/<bundle>/Offline/<profile>/<bangumi>/`, and the
/// transfers that fill it. One store per app; `activate` binds it to the
/// signed-in profile so two servers never share a folder.
@Observable
@MainActor
final class OfflineStore {
    static let shared = OfflineStore()

    private(set) var entries: [OfflineEntry] = []
    private(set) var profileID: UUID?
    private(set) var client: APIClient?
    /// Series → error from the last `keep`, for a toast.
    var lastError: String?

    let preferences = OfflinePreferences.shared
    @ObservationIgnored private(set) lazy var rules = OfflineRules(store: self)
    @ObservationIgnored private lazy var downloader = OfflineDownloader(store: self)
    private var saveTask: Task<Void, Never>?

    // MARK: Paths

    static var rootDirectory: URL {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        return support.appending(path: Bundle.main.bundleIdentifier ?? "dev.milmil.macos").appending(path: "Offline")
    }

    var directory: URL? { profileID.map { Self.rootDirectory.appending(path: $0.uuidString) } }

    func seriesDirectory(_ bangumiID: Int) -> URL? { directory?.appending(path: String(bangumiID)) }

    func fileURL(_ entry: OfflineEntry) -> URL? { seriesDirectory(entry.bangumiID)?.appending(path: entry.filename) }

    func sidecarURL(_ entry: OfflineEntry, _ sidecar: OfflineSidecar) -> URL? {
        seriesDirectory(entry.bangumiID)?.appending(path: sidecar.filename)
    }

    func danmakuURL(_ entry: OfflineEntry) -> URL? { seriesDirectory(entry.bangumiID)?.appending(path: "\(entry.fileID).danmaku.json") }

    private var indexURL: URL? { directory?.appending(path: "index.json") }

    // MARK: Lifecycle

    func activate(profileID: UUID, client: APIClient) {
        if self.profileID == profileID { return }
        if self.profileID != nil { deactivate() }
        self.profileID = profileID
        self.client = client
        load()
        Task {
            await downloader.configure(token: client.currentToken())
            downloader.kick()
            #if DEBUG
            await runSnapshotHooks()
            #endif
        }
        rules.start()
    }

    #if DEBUG
    /// Headless verification: `MILMIL_SNAPSHOT_OFFLINE_KEEP=<bangumiID>` keeps
    /// the series' resume episode; `MILMIL_SNAPSHOT_OFFLINE_CLEAR=1` removes
    /// every copy for this profile first.
    private func runSnapshotHooks() async {
        let env = ProcessInfo.processInfo.environment
        if env["MILMIL_SNAPSHOT_OFFLINE_CLEAR"] == "1" { removeAll() }
        guard let raw = env["MILMIL_SNAPSHOT_OFFLINE_KEEP"], let bangumiID = Int(raw), let client else { return }
        guard let playable = try? await client.playableEpisodes(bangumiID: bangumiID) else { return }
        let target = playable.resumeCandidate ?? playable.episodes.first { $0.hasFile }
        guard let target else { return }
        await keep(bangumiID: bangumiID, title: String(bangumiID), episodeIDs: [target.episodeID])
    }
    #endif

    /// Sign-out / profile switch: transfers stop, the index stays on disk for
    /// the next sign-in to that profile.
    func deactivate() {
        rules.stop()
        downloader.cancelAll()
        save(now: true)
        entries = []
        profileID = nil
        client = nil
    }

    private func load() {
        guard let indexURL, let data = try? Data(contentsOf: indexURL),
              let index = try? JSONDecoder().decode(OfflineIndex.self, from: data) else {
            entries = []
            return
        }
        entries = index.entries.compactMap { entry in
            var entry = entry
            switch entry.state {
            case .done:
                // The file went away behind our back (Finder, disk swap).
                guard let url = fileURL(entry), FileManager.default.fileExists(atPath: url.path) else { return nil }
            case .downloading:
                entry.state = .queued
            case .queued, .paused, .failed:
                break
            }
            return entry
        }
    }

    private func save(now: Bool = false) {
        saveTask?.cancel()
        let write = { [entries, indexURL] in
            guard let indexURL else { return }
            try? FileManager.default.createDirectory(at: indexURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            if let data = try? JSONEncoder().encode(OfflineIndex(entries: entries)) {
                try? data.write(to: indexURL, options: .atomic)
            }
        }
        if now {
            write()
        } else {
            saveTask = Task {
                try? await Task.sleep(for: .milliseconds(400))
                guard !Task.isCancelled else { return }
                write()
            }
        }
    }

    // MARK: Queries

    func entry(fileID: String) -> OfflineEntry? { entries.first { $0.fileID == fileID } }

    func entry(episodeID: String) -> OfflineEntry? { entries.first { $0.episodeID == episodeID } }

    func entries(bangumiID: Int) -> [OfflineEntry] {
        entries.filter { $0.bangumiID == bangumiID }.sorted { $0.episodeNumber < $1.episodeNumber }
    }

    /// Any finished copy for the series — the poster badge.
    func hasCopies(bangumiID: Int) -> Bool { entries.contains { $0.bangumiID == bangumiID && $0.state == .done } }

    var seriesWithCopies: Set<Int> { Set(entries.filter { $0.state == .done }.map(\.bangumiID)) }

    /// The playable local file, when the copy is complete and still there.
    func localURL(fileID: String) -> URL? {
        guard let entry = entry(fileID: fileID), entry.state == .done, let url = fileURL(entry),
              FileManager.default.fileExists(atPath: url.path) else { return nil }
        return url
    }

    func localURL(episodeID: String) -> URL? {
        entry(episodeID: episodeID).flatMap { localURL(fileID: $0.fileID) }
    }

    func sidecars(fileID: String) -> [(url: URL, sidecar: OfflineSidecar)] {
        guard let entry = entry(fileID: fileID) else { return [] }
        return entry.subtitles.compactMap { sidecar in
            guard let url = sidecarURL(entry, sidecar), FileManager.default.fileExists(atPath: url.path) else { return nil }
            return (url, sidecar)
        }
    }

    var usedBytes: Int64 { entries.reduce(0) { $0 + ($1.state == .done ? max($1.sizeBytes, $1.downloadedBytes) : $1.downloadedBytes) } }

    var isTransferring: Bool { entries.contains { $0.state == .downloading } }

    /// Aggregate progress of everything queued or moving, for the Dock.
    var transferFraction: Double? {
        let moving = entries.filter { $0.state == .downloading || $0.state == .queued }
        guard !moving.isEmpty else { return nil }
        let total = moving.reduce(Int64(0)) { $0 + max($1.sizeBytes, 1) }
        let done = moving.reduce(Int64(0)) { $0 + min($1.downloadedBytes, max($1.sizeBytes, 1)) }
        return Double(done) / Double(total)
    }

    // MARK: Keeping

    /// Keep one or more episodes of a series. Asks the server for its offline
    /// manifest (sidecars, sizes) and falls back to the playable list on
    /// servers without it. `episodeIDs == nil` keeps every episode with a file.
    func keep(bangumiID: Int, title: String, episodeIDs: Set<String>? = nil) async {
        guard let client else { return }
        var requests: [OfflineRequest] = []
        if let manifest = try? await client.offlineManifest(bangumiID: bangumiID) {
            // The manifest's URLs are server-relative (`/api/v1/stream/…`).
            let base = await client.baseURL
            requests = OfflineRequest.from(manifest).map { request in
                var request = request
                request.sourceURL = Self.absolute(request.sourceURL, base: base)
                request.subtitles = request.subtitles.map { var s = $0; s.url = Self.absolute(s.url, base: base); return s }
                request.danmakuURL = request.danmakuURL.map { Self.absolute($0, base: base) }
                return request
            }
        } else if let playable = try? await client.playableEpisodes(bangumiID: bangumiID) {
            requests = OfflineRequest.from(playable.episodes, bangumiID: bangumiID, title: title, client: client)
        } else {
            lastError = String(localized: "取唔到集數資料，稍後再試。")
            return
        }
        if let episodeIDs { requests = requests.filter { episodeIDs.contains($0.episodeID) } }
        keep(requests)
    }

    func keep(_ requests: [OfflineRequest]) {
        guard profileID != nil else { return }
        for request in requests where entry(fileID: request.fileID) == nil {
            var entry = OfflineEntry(
                fileID: request.fileID, bangumiID: request.bangumiID, seriesTitle: request.seriesTitle,
                episodeID: request.episodeID, episodeNumber: request.episodeNumber, episodeTitle: request.episodeTitle,
                container: request.container, sourceURL: request.sourceURL, etag: request.etag, sizeBytes: request.sizeBytes
            )
            entry.subtitleSources = request.subtitles
            entry.danmakuURL = request.danmakuURL
            entries.append(entry)
        }
        save()
        downloader.kick()
    }

    func remove(fileID: String) {
        guard let entry = entry(fileID: fileID) else { return }
        downloader.cancel(fileID: fileID)
        if let url = fileURL(entry) {
            try? FileManager.default.removeItem(at: url)
            try? FileManager.default.removeItem(at: url.appendingPathExtension("part"))
        }
        for sidecar in entry.subtitles { if let url = sidecarURL(entry, sidecar) { try? FileManager.default.removeItem(at: url) } }
        if let url = danmakuURL(entry) { try? FileManager.default.removeItem(at: url) }
        entries.removeAll { $0.fileID == fileID }
        if let dir = seriesDirectory(entry.bangumiID), (try? FileManager.default.contentsOfDirectory(atPath: dir.path))?.isEmpty == true {
            try? FileManager.default.removeItem(at: dir)
        }
        save()
        downloader.kick()
    }

    func removeSeries(bangumiID: Int) {
        for entry in entries(bangumiID: bangumiID) { remove(fileID: entry.fileID) }
    }

    func removeAll() {
        for entry in entries { remove(fileID: entry.fileID) }
    }

    func pause(fileID: String) {
        downloader.pause(fileID: fileID)
    }

    func resume(fileID: String) {
        update(fileID) { $0.state = .queued; $0.error = nil }
        downloader.kick()
    }

    func setPinned(fileID: String, _ pinned: Bool) {
        update(fileID) { $0.pinned = pinned }
    }

    func markPlayed(fileID: String) {
        update(fileID) { $0.lastPlayedAt = Date() }
    }

    func revealInFinder(fileID: String) {
        guard let entry = entry(fileID: fileID), let url = fileURL(entry) else { return }
        NSWorkspace.shared.activateFileViewerSelecting([url])
    }

    func revealDirectory() {
        guard let directory else { return }
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        NSWorkspace.shared.activateFileViewerSelecting([directory])
    }

    /// Mutation hook shared with the downloader; persists (debounced).
    func update(_ fileID: String, _ change: (inout OfflineEntry) -> Void) {
        guard let index = entries.firstIndex(where: { $0.fileID == fileID }) else { return }
        change(&entries[index])
        save()
        DockController.shared.setExternal(fraction: transferFraction)
    }

    /// Newest cached client for the downloader / rules.
    func currentClient() -> APIClient? { client }

    nonisolated static func absolute(_ url: URL, base: URL) -> URL {
        guard url.scheme == nil else { return url }
        return URL(string: url.relativeString, relativeTo: base)?.absoluteURL ?? url
    }
}
