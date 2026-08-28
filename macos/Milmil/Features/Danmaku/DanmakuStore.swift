import Foundation
import MilmilAPI
import MilmilDanmaku
import MilmilDanmakuAPI
import Observation
import OSLog

/// Danmaku for one episode: DandanPlay (by media file) + external imports
/// (by episode) + comments sent from here, run through the pipeline with
/// the shared preferences into the timeline the overlay renders.
@Observable
final class DanmakuStore {
    private static let log = Logger(subsystem: "dev.milmil.macos", category: "danmaku")

    struct Style: Equatable {
        var fontFamily: String
        var fontSize: Double
        var opacity: Double
        var bold: Bool
        var stroke: DanmakuStroke
        /// `#FFFFFF` means "keep each comment's own colour".
        var colorOverride: String
        var area: Double
        var speed: Double
        var antiSubtitle: Bool

        init(preferences: GlobalPreferences) {
            fontFamily = preferences.danmakuFontFamily
            fontSize = Double(preferences.danmakuFontSize)
            opacity = preferences.danmakuOpacity
            bold = preferences.danmakuBold
            stroke = preferences.danmakuStroke
            colorOverride = preferences.danmakuColor
            area = preferences.danmakuArea
            speed = Double(preferences.danmakuSpeed)
            antiSubtitle = preferences.danmakuAntiSubtitle
        }
    }

    let fileID: String
    let episodeID: String
    private let client: APIClient

    private(set) var dandanplay: [DanmakuComment] = []
    private(set) var imported: [ImportedDanmaku] = []
    private(set) var local: [DanmakuComment] = []
    private(set) var timeline: DanmakuTimeline = .empty
    private(set) var style: Style
    private(set) var isLoading = false
    private(set) var loadError: String?
    private(set) var sendError: String?
    private(set) var isSending = false

    // External sources UI state
    private(set) var sources: [DanmakuSourceInfo] = []
    private(set) var searchResults: [DanmakuSearchResult] = []
    private(set) var parts: [DanmakuVideoPart] = []
    private(set) var sourceBusy = false
    private(set) var sourceError: String?
    /// Comments 防雷模式 kept off the screen for this episode.
    private(set) var spoilerHidden = 0
    /// The episode's number, for "第 N 集" spoiler detection; the player's
    /// danmaku views hand it over when they know it (the store only has the ID).
    var episodeNumber: Double? {
        didSet { if episodeNumber != oldValue, spoilerGuard.enabled { rebuild() } }
    }

    private var preferences: GlobalPreferences
    private let spoilerGuard = DanmakuSpoilerGuard.shared
    private var spoilerSignature: (Bool, [String])?

    init(fileID: String, episodeID: String, client: APIClient, preferences: GlobalPreferences) {
        self.fileID = fileID
        self.episodeID = episodeID
        self.client = client
        self.preferences = preferences
        style = Style(preferences: preferences)
    }

    #if DEBUG
    /// `MILMIL_SNAPSHOT_DANMAKU=1`: fake comments so the renderer can be eyeballed without DandanPlay.
    func injectSamples() {
        let texts = ["前方高能", "名場面來了", "這集作畫太神了", "OP 神曲", "233333", "字幕組辛苦了", "這裡有伏筆", "笑死", "淚目", "下一集更精彩", "經典", "彈幕護體"]
        var samples: [DanmakuComment] = []
        for index in 0..<240 {
            let mode: DanmakuComment.Mode = index % 9 == 0 ? .top : (index % 11 == 0 ? .bottom : .scroll)
            let color = [RGB.white, RGB(hex: "#FFD302"), RGB(hex: "#89D5FF"), RGB(hex: "#A0EE00"), RGB(hex: "#FF7204")][index % 5]
            samples.append(DanmakuComment(
                id: "sample:\(index)", time: Double(index) * 0.37, mode: mode, color: color, text: texts[index % texts.count], source: .dandanplay
            ))
        }
        dandanplay = samples
        rebuild()
    }
    #endif

    var totalCount: Int { dandanplay.count + imported.reduce(0) { $0 + $1.comments.count } + local.count }
    var importedComments: [DanmakuComment] { imported.flatMap(DanmakuParser.comments(from:)) }

    // MARK: - Loading

    func load() async {
        isLoading = true
        defer { isLoading = false }
        loadError = nil
        async let ddp: DandanPlayResponse? = try? client.danmaku(fileID: fileID)
        async let ext: [ImportedDanmaku]? = try? client.importedDanmaku(episodeID: episodeID)
        let (response, importedRows) = await (ddp, ext)
        dandanplay = response.map(DanmakuParser.comments(from:)) ?? []
        imported = importedRows ?? []
        if response == nil, importedRows == nil { loadError = String(localized: "無法載入彈幕") }
        rebuild()
    }

    func reloadImported() async {
        imported = (try? await client.importedDanmaku(episodeID: episodeID)) ?? []
        rebuild()
    }

    func apply(preferences: GlobalPreferences) {
        let old = self.preferences
        self.preferences = preferences
        let newStyle = Style(preferences: preferences)
        if newStyle != style { style = newStyle }
        // Only filter / density / conversion changes need the pipeline again;
        // style-only changes (sliders) must not re-run OpenCC over every comment.
        let pipelineChanged = old.danmakuDensity != preferences.danmakuDensity
            || old.danmakuFilterScroll != preferences.danmakuFilterScroll
            || old.danmakuFilterTop != preferences.danmakuFilterTop
            || old.danmakuFilterBottom != preferences.danmakuFilterBottom
            || old.danmakuBlockKeywords != preferences.danmakuBlockKeywords
            || old.danmakuChineseConvert != preferences.danmakuChineseConvert
        if pipelineChanged || spoilerSettingsChanged { rebuild() }
    }

    /// 防雷模式 lives outside `GlobalPreferences`; the settings view calls
    /// `apply(preferences:)` after every change, and this notices it.
    private var spoilerSettingsChanged: Bool {
        let signature = (spoilerGuard.enabled, spoilerGuard.keywords)
        defer { spoilerSignature = signature }
        guard let previous = spoilerSignature else { return true }
        return previous.0 != signature.0 || previous.1 != signature.1
    }

    private func rebuild() {
        var options = DanmakuPipeline.Options()
        options.density = switch preferences.danmakuDensity {
        case .low: .low
        case .medium: .medium
        case .high: .high
        }
        options.showScroll = preferences.danmakuFilterScroll
        options.showTop = preferences.danmakuFilterTop
        options.showBottom = preferences.danmakuFilterBottom
        options.blockKeywords = preferences.danmakuBlockKeywords
        options.convert = DanmakuConverter.closure(for: preferences.danmakuChineseConvert)
        var comments = dandanplay + importedComments + local
        if let matcher = spoilerGuard.matcher(currentEpisode: episodeNumber) {
            let before = comments.count
            comments.removeAll { matcher.hides($0.text) }
            spoilerHidden = before - comments.count
        } else {
            spoilerHidden = 0
        }
        timeline = DanmakuPipeline(options: options).process(comments)
    }

    // MARK: - Sending

    /// Optimistic: appears immediately, stays even if the server later fails
    /// (the web does the same); `sendError` surfaces the failure.
    func send(text: String, at time: Double, mode: DanmakuComment.Mode, color: RGB) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isSending else { return }
        let comment = DanmakuComment(id: "local:\(UUID().uuidString)", time: time, mode: mode, color: color, text: trimmed, source: .local)
        local.append(comment)
        rebuild()
        isSending = true
        sendError = nil
        defer { isSending = false }
        do {
            try await client.postDanmaku(fileID: fileID, time: time, mode: DanmakuParser.dandanPlayMode(mode), color: color.intValue, comment: trimmed)
        } catch {
            Self.log.error("danmaku post failed: \(error)")
            sendError = (error as? APIError)?.serverMessage ?? error.localizedDescription
        }
    }

    // MARK: - External sources

    func loadSources() async {
        sources = (try? await client.danmakuSources()) ?? []
    }

    func search(source: String, query: String) async {
        sourceBusy = true
        sourceError = nil
        defer { sourceBusy = false }
        do {
            searchResults = try await client.searchExternalDanmaku(source: source, query: query)
            parts = []
        } catch {
            sourceError = error.localizedDescription
        }
    }

    func loadParts(source: String, videoID: String) async {
        sourceBusy = true
        defer { sourceBusy = false }
        parts = (try? await client.externalDanmakuParts(source: source, videoID: videoID)) ?? []
    }

    func importExternal(source: String, videoID: String, partIndex: Int) async -> Int? {
        sourceBusy = true
        sourceError = nil
        defer { sourceBusy = false }
        do {
            let result = try await client.importExternalDanmaku(source: source, videoID: videoID, episodeID: episodeID, partIndex: partIndex)
            await reloadImported()
            return result.count ?? 0
        } catch {
            sourceError = error.localizedDescription
            return nil
        }
    }

    func toggleSave(source: String, save: Bool) async {
        sourceError = nil
        do {
            try await client.toggleSaveImportedDanmaku(episodeID: episodeID, source: source, save: save)
        } catch {
            // 404 "no cached danmaku to save" once the 24 h import cache expired.
            sourceError = (error as? APIError)?.serverMessage ?? error.localizedDescription
        }
        await reloadImported()
    }

    func removeImported(source: String?) async {
        try? await client.removeImportedDanmaku(episodeID: episodeID, source: source)
        await reloadImported()
    }
}

// MARK: - Endpoints

nonisolated struct DanmakuSourceInfo: Decodable, Sendable, Hashable, Identifiable {
    let name: String
    let label: String
    var id: String { name }
}

nonisolated struct DanmakuSearchResult: Decodable, Sendable, Hashable, Identifiable {
    let videoId: String
    let title: String
    let danmakuCount: Int?
    let duration: String?
    let thumbnail: String?
    var id: String { videoId }
}

nonisolated struct DanmakuVideoPart: Decodable, Sendable, Hashable, Identifiable {
    let index: Int
    let title: String?
    let duration: Double?
    var id: Int { index }
}

nonisolated struct DanmakuImportResult: Decodable, Sendable {
    let source: String?
    let count: Int?
    let saved: Bool?
}

extension APIClient {
    /// The handler serialises "nothing imported" as JSON `null`, not `[]`.
    func importedDanmaku(episodeID: String) async throws -> [ImportedDanmaku] {
        let rows: [ImportedDanmaku]? = try await get("/api/v1/danmaku/external/imported/\(episodeID)")
        return rows ?? []
    }

    func danmakuSources() async throws -> [DanmakuSourceInfo] {
        try await get("/api/v1/danmaku/external/sources")
    }

    func searchExternalDanmaku(source: String, query: String, page: Int = 1) async throws -> [DanmakuSearchResult] {
        try await get("/api/v1/danmaku/external/search", query: [
            URLQueryItem(name: "source", value: source), URLQueryItem(name: "q", value: query), URLQueryItem(name: "page", value: String(page)),
        ])
    }

    func externalDanmakuParts(source: String, videoID: String) async throws -> [DanmakuVideoPart] {
        try await get("/api/v1/danmaku/external/parts", query: [URLQueryItem(name: "source", value: source), URLQueryItem(name: "videoId", value: videoID)])
    }

    func importExternalDanmaku(source: String, videoID: String, episodeID: String, partIndex: Int) async throws -> DanmakuImportResult {
        struct Body: Encodable { let source: String; let videoId: String; let episodeId: String; let partIndex: Int }
        return try await post("/api/v1/danmaku/external/import", body: Body(source: source, videoId: videoID, episodeId: episodeID, partIndex: partIndex))
    }

    func toggleSaveImportedDanmaku(episodeID: String, source: String, save: Bool) async throws {
        struct Body: Encodable { let source: String; let save: Bool }
        struct Reply: Decodable { let saved: Bool? }
        let _: Reply = try await patch("/api/v1/danmaku/external/imported/\(episodeID)/save", body: Body(source: source, save: save))
    }

    func removeImportedDanmaku(episodeID: String, source: String?) async throws {
        let query = source.map { [URLQueryItem(name: "source", value: $0)] } ?? []
        try await delete("/api/v1/danmaku/external/imported/\(episodeID)", query: query)
    }
}
