import AppKit
import Foundation
import MilmilAPI
import MilmilPlayer
import Observation
import OSLog

/// One per player window: owns the mpv instance, the episode list, the
/// stream ladder and progress sync. Views talk to it; it talks to mpv.
@Observable
final class PlayerController {
    private static let log = Logger(subsystem: "dev.milmil.macos", category: "player")
    private static let saveInterval: TimeInterval = 10
    private static let completionThreshold: Double = 30
    private static let postPlayLead: Double = 30

    let session: ServerSession
    let state = PlayerState()
    let player: MPVPlayer?
    private(set) var keymap: PlayerKeymap
    /// The one render view; `PlayerRenderHost` moves it between the watch
    /// page and the pop-out window (libmpv allows one render context).
    @ObservationIgnored private(set) lazy var renderView: MPVRenderView? = player.map { MPVRenderView(player: $0) }

    // Current series / episode
    private(set) var request: PlaybackRequest?
    private(set) var playable: PlayableEpisodesResponse?
    private(set) var episode: PlayableEpisode?
    private(set) var resumePosition: Int?
    var showResumePill = false
    var osd: OSDMessage?
    var postPlayCountdown: Int?
    var danmakuEnabled: Bool
    private(set) var danmakuStore: DanmakuStore?

    private var fallback = StreamFallback(hasLocalFile: false)
    private var eventTask: Task<Void, Never>?
    private var saveTask: Task<Void, Never>?
    private var transcodeTask: Task<Void, Never>?
    private var loadTask: Task<Void, Never>?
    private var resumePillTask: Task<Void, Never>?
    private var sidecarsAddedForGeneration = -1
    private var osdTask: Task<Void, Never>?
    private var postPlayTask: Task<Void, Never>?
    private var lastTimelinePush: TimeInterval = 0
    private var lastSavedPosition = -1
    private var skippedSegmentIDs: Set<String> = []
    /// mpv has reported a real `time-pos` for the current file; before that a
    /// progress save would write 0 and wipe the server's resume point.
    private var hasPosition = false
    /// `loadGeneration` of the file mpv last finished opening. Timeline
    /// updates from an older file are dropped: between `start(_:)` and the
    /// new file's `fileLoaded` the previous episode keeps playing and
    /// reporting `time-pos`, which used to refill `state.timePos` — so the
    /// next episode opened at the previous one's position, and a progress
    /// save in that window wrote it to the new episode as well.
    private var loadedGeneration = -1
    /// Consumed by the next `start(_:)`: 從頭播放 from a request.
    private var startFromBeginning = false
    /// `milmil://watch/…&t=<seconds>`: open at this position instead of the
    /// server's resume point. Consumed by the next `start(_:)`.
    private var startOffset: Double?
    /// The user dismissed the next-episode card for this episode.
    private var postPlayDismissed = false
    private var activity: NSObjectProtocol?
    private var loadGeneration = 0
    private var authToken: String?
    /// The mapped local file for the current episode, when a mapping hits.
    private var localFileURL: URL?
    /// A copy kept on this Mac (離線到本機), tried before every other rung.
    private var offlineURL: URL?
    /// The most recent capture, shown as a thumbnail card until it times out
    /// or the viewer dismisses it.
    var lastCapture: CaptureResult?
    private var captureDismissTask: Task<Void, Never>?

    // Habits: per-series track memory, learned OP/ED skips, sleep timer,
    // night mode, headphone watch, playback report.
    private let seriesPreferences = SeriesPlaybackPreferences.shared
    private let learnedSkips = LearnedSkips.shared
    private var seriesPreferenceAppliedGeneration = -1
    /// Learned skips already taken this episode (index into the series' list).
    private var skippedLearned: Set<Int> = []
    /// An OP/ED the user jumped over by hand twice; `acceptSkipSuggestion`
    /// remembers it. The window shows it like the resume pill.
    private(set) var skipSuggestion: LearnedSkip?
    private var skipSuggestionTask: Task<Void, Never>?
    private(set) var sleepTimerMode: SleepTimerMode = .off
    private var sleepTask: Task<Void, Never>?
    private var fadeTask: Task<Void, Never>?
    private(set) var nightMode = UserDefaults.standard.bool(forKey: DesktopDefaults.nightMode)
    private let audioWatcher = AudioDeviceWatcher()
    /// mpv's last log lines, for 報告播放問題.
    @ObservationIgnored private var logRing: [String] = []
    private static let logRingLimit = 200

    var episodes: [PlayableEpisode] { playable?.episodes.sorted { $0.sort < $1.sort } ?? [] }
    /// Bangumi / TMDB stills by episode `sort`, for episodes whose playable
    /// row has no `image` (the local DB often lacks them — web merges the
    /// discover list the same way).
    private(set) var episodeImages: [Double: URL] = [:]

    func updateEpisodeImages(_ images: [Double: URL]) {
        guard images != episodeImages else { return }
        episodeImages = images
    }

    func still(for episode: PlayableEpisode) -> URL? {
        episode.image ?? episodeImages[episode.sort]
    }
    var nextEpisode: PlayableEpisode? { adjacentEpisode(offset: 1) }
    var previousEpisode: PlayableEpisode? { adjacentEpisode(offset: -1) }

    init(session: ServerSession) {
        self.session = session
        keymap = PlayerKeymap(userBindings: session.preferences.keyboardBindings.filter { !$0.key.isEmpty })
        danmakuEnabled = session.preferences.danmakuEnabled
        var options = MPVOptions()
        options.userAgent = UserAgent.value
        if let hwdec = UserDefaults.standard.string(forKey: DesktopDefaults.hardwareDecoding),
           let choice = MPVOptions.HardwareDecoding(rawValue: hwdec) {
            options.hardwareDecoding = choice
        }
        options.subtitleLanguages = Self.languageChain(session.preferences.defaultSubtitleLanguage, fallback: ["zh-TW", "zh-Hant", "zh", "en"])
        options.audioLanguages = Self.languageChain(session.preferences.defaultAudioLanguage, fallback: ["ja", "jpn"])
        options.screenshotDirectory = Self.screenshotDirectory()
        // Set on the handle after init since the token can rotate per session.
        do {
            player = try MPVPlayer(options: options)
        } catch {
            Self.log.error("mpv init failed: \(String(describing: error))")
            player = nil
            state.status = .failed(String(localized: "無法初始化 mpv：\(error.localizedDescription)"))
        }
        Task { await refreshAuthHeader() }
        startEventLoop()
        applySubtitleStyle(session.preferences.subtitleStyle)
        applyAnime4K()
        if nightMode { applyNightMode(true) }
        audioWatcher.onRouteLost = { [weak self] in self?.outputRouteLost() }
        audioWatcher.start()
        NowPlayingBridge.shared.attach(self)
        #if DEBUG
        DevSnapshot.playerScreenshot = { [weak self] in self?.screenshot(withSubtitles: false) }
        DevSnapshot.playerStateDump = { [weak self] in
            guard let self else { return [:] }
            var dict: [String: Any] = [
                "status": String(describing: state.status),
                "stage": String(describing: state.stage),
                "timePos": state.timePos,
                "duration": state.duration,
                "sidecarCount": state.sidecarSubtitles.count,
                "log": Array(logRing.suffix(40)), // mpv errors never reach stderr (terminal=no)
            ]
            if let player {
                dict["path"] = player.getString("path") ?? ""
                dict["subTitle"] = player.getString("current-tracks/sub/title") ?? ""
                dict["subLang"] = player.getString("current-tracks/sub/lang") ?? ""
                dict["subExternal"] = player.getString("current-tracks/sub/external") ?? ""
                dict["audioLang"] = player.getString("current-tracks/audio/lang") ?? ""
                dict["trackCount"] = player.getInt("track-list/count") ?? -1
                dict["videoCodec"] = player.getString("video-codec") ?? ""
                dict["hwdecCurrent"] = player.getString("hwdec-current") ?? ""
                dict["containerFps"] = player.getDouble("container-fps") ?? 0
                dict["estimatedVfFps"] = player.getDouble("estimated-vf-fps") ?? 0
                dict["frameDropCount"] = player.getInt("frame-drop-count") ?? -1
                dict["decoderFrameDropCount"] = player.getInt("decoder-frame-drop-count") ?? -1
                dict["voDelayedFrameCount"] = player.getInt("vo-delayed-frame-count") ?? -1
                dict["avsync"] = player.getDouble("avsync") ?? 0
            }
            return dict
        }
        #endif
    }

    /// (Re)applies the Anime4K shader chain from UserDefaults. Safe to call
    /// while playing — mpv swaps the `glsl-shaders` list on the fly.
    func applyAnime4K() {
        guard let player else { return }
        let paths = Anime4K.shaderPaths()
        do {
            // clr + per-item append sidesteps the option's platform-specific
            // separator parsing (a ':'-joined `set` lands as one item).
            try player.command(["change-list", "glsl-shaders", "clr", ""])
            for path in paths {
                try player.command(["change-list", "glsl-shaders", "append", path])
            }
            // The property string joins items with ':' on macOS.
            let active = player.getString("glsl-shaders") ?? ""
            let count = active.isEmpty ? 0 : active.split(separator: ":").count(where: { $0.hasSuffix(".glsl") || $0.hasSuffix(".hook") })
            Self.log.info("anime4k: \(paths.count) shaders requested, \(count) active")
        } catch {
            Self.log.error("anime4k: change-list failed: \(String(describing: error))")
        }
    }

    // MARK: - Loading

    func play(_ request: PlaybackRequest) {
        self.request = request
        startFromBeginning = request.fromStart
        startOffset = request.startSeconds
        state.status = .loading(String(localized: "讀取集數…"))
        state.mediaTitle = request.title
        loadTask?.cancel()
        loadGeneration += 1
        let generation = loadGeneration
        loadTask = Task { await loadSeries(request, generation: generation) }
    }

    /// Browse screens may only know the id; fill the title/cover in later.
    func updateTitle(_ title: String, cover: URL?) {
        guard let request, request.title != title || request.coverImage != cover else { return }
        self.request = PlaybackRequest(
            bangumiID: request.bangumiID, episodeID: request.episodeID, title: title, coverImage: cover,
            fromStart: request.fromStart, startSeconds: request.startSeconds
        )
        if let episode { state.mediaTitle = String(localized: "\(title) 第 \(episode.number) 集") }
        NowPlayingBridge.shared.update(self)
    }

    var isInCollection: Bool {
        guard let status = playable?.watchStatus else { return false }
        return status != .none
    }

    func toggleCollection() async {
        guard let request else { return }
        let next: WatchStatus = isInCollection ? .none : .watching
        try? await session.client.setWatchStatus(bangumiID: request.bangumiID, next)
        playable = try? await session.client.playableEpisodes(bangumiID: request.bangumiID)
    }

    func setScore(_ score: Int?) async {
        guard let request else { return }
        if let score, !(1...10).contains(score) { return }
        try? await session.client.setScore(bangumiID: request.bangumiID, score)
        playable = try? await session.client.playableEpisodes(bangumiID: request.bangumiID)
    }

    private func loadSeries(_ request: PlaybackRequest, generation: Int) async {
        do {
            let playable = try await session.client.playableEpisodes(bangumiID: request.bangumiID)
            guard generation == loadGeneration, !Task.isCancelled else { return }
            self.playable = playable
            let target = request.episodeID.flatMap { id in playable.episodes.first { $0.episodeID == id } } ?? playable.resumeCandidate
            guard let target, target.mediaFile != nil else {
                state.status = .failed(String(localized: "這部作品沒有可播放的檔案"))
                return
            }
            await start(target)
        } catch {
            state.status = .failed(error.localizedDescription)
        }
    }

    func play(episode: PlayableEpisode) {
        guard episode.mediaFile != nil else { return }
        loadTask?.cancel()
        loadTask = Task { await start(episode) }
    }

    /// The episode that was playing before `windowClosed()` stopped it.
    func resumeCurrentEpisode() {
        guard let episode, state.status == .idle else { return }
        play(episode: episode)
    }

    func playNext() {
        guard let next = nextEpisode else { return }
        play(episode: next)
    }

    func playPrevious() {
        guard let previous = previousEpisode else { return }
        play(episode: previous)
    }

    private func start(_ episode: PlayableEpisode) async {
        guard let file = episode.mediaFile else { return }
        saveProgressNow()
        cancelPostPlay()
        transcodeTask?.cancel()
        resumePillTask?.cancel()
        loadGeneration += 1
        let generation = loadGeneration
        self.episode = episode
        state.status = .loading(String(localized: "準備串流…"))
        state.segments = []
        state.sidecarSubtitles = []
        state.thumbnails = nil
        state.timePos = 0
        state.duration = Double(episode.progress?.durationSeconds ?? 0)
        skippedSegmentIDs = []
        skippedLearned = []
        skipSuggestion = nil
        skipSuggestionTask?.cancel()
        lastSavedPosition = -1
        hasPosition = false
        postPlayDismissed = false
        let number = episode.number
        state.mediaTitle = String(localized: "\(request?.title ?? "") 第 \(number) 集")
        applyScreenshotTemplate(title: request?.title ?? "", number: number)
        if let startOffset, startOffset > 0 {
            resumePosition = Int(startOffset)
        } else if startFromBeginning {
            resumePosition = nil
        } else if let progress = episode.progress, progress.positionSeconds > 0, !progress.completed {
            resumePosition = progress.positionSeconds
        } else {
            resumePosition = nil
        }
        startFromBeginning = false
        startOffset = nil
        showResumePill = false

        // Ask the server what it knows; mpv ignores can_direct_play but the
        // ladder needs library_online and the transcode availability.
        offlineURL = OfflineStore.shared.localURL(fileID: file.id)
        let info = try? await session.client.mediaInfo(fileID: file.id)
        guard generation == loadGeneration, !Task.isCancelled else { return }
        if let info, !info.libraryOnline, offlineURL == nil {
            player?.stop()
            state.status = .failed(String(localized: "媒體庫目前離線，無法播放此檔案"))
            return
        }
        localFileURL = file.path.flatMap { LocalPathMappings.shared.localURL(forServerPath: $0) }
        fallback = StreamFallback(
            hasOfflineCopy: offlineURL != nil, hasLocalFile: localFileURL != nil, canRemux: info?.canRemux ?? true, canTranscode: true
        )
        await refreshAuthHeader()
        guard generation == loadGeneration, !Task.isCancelled else { return }
        await loadCurrentStage(fileID: file.id)

        let danmaku = DanmakuStore(fileID: file.id, episodeID: episode.episodeID, client: session.client, preferences: session.preferences)
        danmakuStore = danmaku
        #if DEBUG
        if ProcessInfo.processInfo.environment["MILMIL_SNAPSHOT_DANMAKU"] == "1" {
            danmaku.injectSamples()
        } else {
            Task { await danmaku.load() }
        }
        #else
        Task { await danmaku.load() }
        #endif

        async let segments = session.client.segments(fileID: file.id)
        async let sidecars = session.client.subtitles(fileID: file.id)
        let (loadedSegments, loadedSidecars) = await (try? segments, try? sidecars)
        guard generation == loadGeneration else { return }
        state.segments = loadedSegments ?? []
        state.sidecarSubtitles = loadedSidecars ?? []
        // `fileLoaded` may already have passed; attach sidecars now if so.
        if state.status.isActive { addSidecarSubtitles() }
        await loadThumbnails(fileID: file.id, generation: generation)
    }

    /// The rungs this file can actually be played from, best first — what the
    /// quality menu offers.
    var availableStages: [StreamStage] { fallback.stages }

    /// Switch rung by hand. `load(url:generation:)` carries the position over,
    /// and a rung that then fails still falls back down the ladder.
    func selectStage(_ stage: StreamStage) {
        guard stage != state.stage, let file = episode?.mediaFile, fallback.select(stage) else { return }
        Task { await loadCurrentStage(fileID: file.id) }
    }

    private func loadCurrentStage(fileID: String) async {
        let stage = fallback.current
        state.stage = stage
        let generation = loadGeneration
        switch stage {
        case .offlineCopy:
            if let offlineURL {
                load(url: offlineURL, generation: generation)
                OfflineStore.shared.markPlayed(fileID: fileID)
            } else {
                fallback.advance()
                await loadCurrentStage(fileID: fileID)
            }
        case .localFile:
            if let localFileURL {
                load(url: localFileURL, generation: generation)
                armLocalFileWatchdog(fileID: fileID, generation: generation)
            } else {
                fallback.advance()
                await loadCurrentStage(fileID: fileID)
            }
        case .direct:
            load(url: session.client.directStreamURL(fileID: fileID), generation: generation)
        case .remux:
            load(url: session.client.remuxStreamURL(fileID: fileID), generation: generation)
        case .hls:
            loadTranscode(fileID: fileID, generation: generation)
        }
    }

    /// A pending TCC consent dialog or a dead network mount blocks mpv's
    /// open() without ever posting an event, which would pin the UI on
    /// 準備串流 forever — give the local rung a deadline and fall back to the
    /// server stream instead.
    private func armLocalFileWatchdog(fileID: String, generation: Int) {
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(8))
            guard let self, generation == loadGeneration,
                  state.stage == .localFile, case .loading = state.status else { return }
            Self.log.warning("local file did not open within 8s, falling back to server stream")
            player?.stop()
            if fallback.advance() != nil {
                await loadCurrentStage(fileID: fileID)
            }
        }
    }

    private func load(url: URL, generation: Int) {
        guard let player, generation == loadGeneration else { return }
        // libmpv's VO needs the render context, which the layer only creates
        // on its first on-screen draw; a `loadfile` before that plays with no
        // picture. Usually the network round-trip wins the race — the trailer
        // window did not, so gate here too.
        if let layer = renderView?.renderLayer, !layer.isRenderContextReady {
            layer.onRenderContextReady = { [weak self] in
                Task { @MainActor in self?.load(url: url, generation: generation) }
            }
            return
        }
        var options: [String: String] = [:]
        // A fallback after playback already started continues where we were;
        // the first load honours the server's resume position. `hasPosition`
        // is only ever set by this generation's own file (see loadedGeneration).
        if hasPosition, state.timePos > 1 {
            options["start"] = String(Int(state.timePos))
        } else if let resumePosition {
            options["start"] = String(resumePosition)
        }
        // Titles can contain commas, which would split loadfile's option list.
        player.set("force-media-title", state.mediaTitle)
        player.loadFile(url.absoluteString, options: options)
        player.set("pause", false)
    }

    /// The HLS rung: ask the server to transcode and poll until the playlist
    /// is ready (split out of `loadCurrentStage` for readability).
    private func loadTranscode(fileID: String, generation: Int) {
        state.status = .loading(String(localized: "伺服器轉碼中…"))
        transcodeTask?.cancel()
        transcodeTask = Task { [weak self] in
            guard let self else { return }
            do {
                let start = try await session.client.startTranscode(fileID: fileID)
                guard generation == loadGeneration, !Task.isCancelled else { return }
                var token = start.token
                if start.status == "ready" {
                    load(url: session.client.hlsURL(token: token), generation: generation)
                    return
                }
                while !Task.isCancelled, generation == loadGeneration {
                    try await Task.sleep(for: .seconds(2))
                    let transcode = try await session.client.transcodeState(token: token)
                    guard generation == loadGeneration, !Task.isCancelled else { return }
                    switch transcode {
                    case .ready:
                        load(url: session.client.hlsURL(token: token), generation: generation)
                        return
                    case let .pending(progress):
                        state.status = .loading(String(localized: "伺服器轉碼中… \(progress ?? 0)%"))
                    case .failed:
                        state.status = .failed(String(localized: "伺服器轉碼失敗"))
                        return
                    }
                    token = start.token
                }
            } catch {
                if !Task.isCancelled { state.status = .failed(String(localized: "無法開始轉碼：\(error.localizedDescription)")) }
            }
        }
    }

    /// The server renders the sprite sheet on the first request for a file,
    /// which can outlast `URLSession.milmil`'s idle timeout. The render
    /// survives our disconnect, so keep asking until the cached track
    /// appears or the episode changes.
    private func loadThumbnails(fileID: String, generation: Int) async {
        guard let vttURL = session.client.thumbnailsURL(fileID: fileID, token: authToken),
              let spriteURL = session.client.spriteURL(fileID: fileID, token: authToken) else { return }
        for attempt in 0..<12 {
            if attempt > 0 {
                try? await Task.sleep(for: .seconds(10))
            }
            guard generation == loadGeneration, !Task.isCancelled else { return }
            guard let (data, response) = try? await URLSession.milmil.data(from: vttURL) else { continue }
            guard generation == loadGeneration else { return }
            switch (response as? HTTPURLResponse)?.statusCode ?? 0 {
            case 200:
                guard let text = String(data: data, encoding: .utf8) else { return }
                state.thumbnails = ThumbnailTrack.parse(text, spriteURL: spriteURL)
                return
            case 401, 403, 404:
                return
            default:
                continue
            }
        }
    }

    private func refreshAuthHeader() async {
        let token = await session.client.currentToken()
        authToken = token
        if let token, let player {
            player.setOption("http-header-fields", "Authorization: Bearer \(token)")
        }
    }

    // MARK: - Events

    private func startEventLoop() {
        guard let player else { return }
        eventTask = Task { [weak self] in
            for await event in player.events {
                guard let self else { return }
                handle(event)
            }
        }
    }

    private func handle(_ event: PlayerEvent) {
        switch event {
        case .startFile:
            break
        case .fileLoaded:
            loadedGeneration = loadGeneration
            state.status = state.paused ? .paused : .playing
            showResumePill = resumePosition != nil
            if showResumePill { scheduleHideResumePill() }
            addSidecarSubtitles()
            applySeriesPreference()
            beginActivity()
            NowPlayingBridge.shared.update(self)
        case let .endFile(reason):
            handleEndFile(reason)
        case .seek:
            state.isSeeking = true
        case .playbackRestart:
            state.isSeeking = false
            if case .buffering = state.status { state.status = state.paused ? .paused : .playing }
            state.clock.update(position: state.timePos, hostTime: CACurrentMediaTime())
            NowPlayingBridge.shared.update(self)
        case .videoReconfig:
            break
        case let .propertyChange(name, value):
            apply(name, value)
        case .commandReply:
            break
        case let .log(prefix, level, text):
            logRing.append("[\(prefix)] \(level): \(text.trimmingCharacters(in: .whitespacesAndNewlines))")
            if logRing.count > Self.logRingLimit { logRing.removeFirst(logRing.count - Self.logRingLimit) }
        case .queueOverflow, .shutdown:
            break
        }
    }

    private func handleEndFile(_ reason: EndFileReason) {
        endActivity()
        switch reason {
        case .eof:
            markCompleted()
            state.status = .ended
            if state.sleepAtEndOfEpisode {
                // 播完這集停止: mpv's keep-open already paused at the end.
                finishSleepTimer()
                return
            }
            if session.preferences.autoNext, nextEpisode != nil, !postPlayDismissed { beginPostPlayCountdown(seconds: 5) }
        case .error:
            if fallback.advance() != nil, let file = episode?.mediaFile {
                Self.log.warning("stage \(self.state.stage.rawValue) failed, trying \(self.fallback.current.rawValue)")
                Task { await loadCurrentStage(fileID: file.id) }
            } else {
                state.status = .failed(String(localized: "無法播放此檔案（已嘗試所有串流方式）"))
            }
        case .stop, .quit, .redirect, .unknown:
            if case .loading = state.status { return }
            state.status = .idle
        }
    }

    private func apply(_ name: String, _ value: MPVValue?) {
        let now = CACurrentMediaTime()
        if applyTimeline(name, value, now: now) { return }
        if applyPlayback(name, value, now: now) { return }
        applyMedia(name, value)
    }

    private func applyTimeline(_ name: String, _ value: MPVValue?, now: TimeInterval) -> Bool {
        switch name {
        case "time-pos":
            guard let pos = value?.doubleValue, loadedGeneration == loadGeneration else { return true }
            hasPosition = true
            state.clock.update(position: pos, hostTime: now)
            if now - lastTimelinePush >= 0.1 {
                lastTimelinePush = now
                state.timePos = pos
                checkAutoSkip(at: pos)
                checkPostPlay(at: pos)
                checkSleepFade(at: pos)
            }
        case "duration":
            state.duration = value?.doubleValue ?? 0
            NowPlayingBridge.shared.update(self)
        case "eof-reached":
            // `keep-open=yes`: mpv pauses at the end instead of emitting END_FILE.
            if value?.boolValue == true, state.status != .ended, state.status.isActive || state.paused { handleEndFile(.eof) }
        case "demuxer-cache-duration": state.cacheSeconds = value?.doubleValue ?? 0
        case "seeking": state.isSeeking = value?.boolValue ?? false
        case "paused-for-cache":
            if value?.boolValue == true, state.status.isActive {
                state.status = .buffering(percent: 0)
                state.clock.setPaused(true, hostTime: now)
            } else if case .buffering = state.status {
                state.status = state.paused ? .paused : .playing
                state.clock.setPaused(state.paused, hostTime: now)
            }
        case "cache-buffering-state":
            if case .buffering = state.status { state.status = .buffering(percent: Int(value?.intValue ?? 0)) }
        default: return false
        }
        return true
    }

    private func applyPlayback(_ name: String, _ value: MPVValue?, now: TimeInterval) -> Bool {
        switch name {
        case "pause":
            let paused = value?.boolValue ?? true
            state.paused = paused
            state.clock.setPaused(paused, hostTime: now)
            if state.status.isActive {
                state.status = paused ? .paused : .playing
            } else if state.status == .ended, !paused {
                state.status = .playing
            }
            if paused { saveProgressNow() }
            NowPlayingBridge.shared.update(self)
        case "speed":
            state.speed = value?.doubleValue ?? 1
            state.clock.setSpeed(state.speed, hostTime: now)
            NowPlayingBridge.shared.update(self)
        case "volume": state.volume = value?.doubleValue ?? 100
        case "mute": state.muted = value?.boolValue ?? false
        case "sub-delay": state.subDelay = value?.doubleValue ?? 0
        case "audio-delay": state.audioDelay = value?.doubleValue ?? 0
        case "sub-visibility": state.subtitlesVisible = value?.boolValue ?? true
        case "ab-loop-a": state.abLoopA = value?.doubleValue
        case "ab-loop-b": state.abLoopB = value?.doubleValue
        default: return false
        }
        return true
    }

    private func applyMedia(_ name: String, _ value: MPVValue?) {
        switch name {
        case "track-list":
            state.tracks = MediaTrack.parseList(value?.nodeValue)
            // Tracks can land after `fileLoaded`; apply the series memory then.
            if state.status.isActive { applySeriesPreference() }
        case "chapter-list": state.chapters = MediaChapter.parseList(value?.nodeValue)
        case "vid": state.videoID = value?.intValue
        case "aid": state.audioID = value?.intValue
        case "sid": state.subtitleID = value?.intValue
        case "secondary-sid": state.secondarySubtitleID = value?.intValue
        case "dwidth": state.videoSize.width = CGFloat(value?.intValue ?? 0)
        case "dheight": state.videoSize.height = CGFloat(value?.intValue ?? 0)
        default: applyVideoInfo(name, value)
        }
    }

    private func applyVideoInfo(_ name: String, _ value: MPVValue?) {
        switch name {
        case "video-params/primaries", "video-params/gamma":
            let text = value?.stringValue ?? ""
            state.isHDR = text.contains("2020") || text == "pq" || text == "hlg"
        case "hwdec-current": state.hwdec = value?.stringValue ?? ""
        case "video-codec": state.videoCodec = value?.stringValue ?? ""
        case "audio-codec-name": state.audioCodec = value?.stringValue ?? ""
        case "container-fps", "estimated-vf-fps":
            if let fps = value?.doubleValue, fps > 0 { state.fps = fps }
        case "video-bitrate": state.videoBitrate = value?.doubleValue ?? 0
        default: break
        }
    }

    // MARK: - Commands

    func togglePause() {
        setPaused(!state.paused)
    }

    func setPaused(_ paused: Bool) {
        guard let player else { return }
        if !paused, state.status == .ended {
            player.seek(to: 0)
            player.set("pause", false)
            return
        }
        player.set("pause", paused)
    }

    /// Pinch zoom: mpv resamples at source resolution (`video-zoom` is log2,
    /// so 2× = 1) instead of the window scaling finished pixels.
    func setVideoZoom(_ zoom: Double) {
        player?.set("video-zoom", log2(max(zoom, 0.01)))
    }

    func seek(to seconds: Double) {
        let target = max(0, min(seconds, state.duration))
        noteManualSeek(from: state.timePos, to: target)
        player?.seek(to: target)
        state.timePos = seconds
        flash(.seek(seconds))
    }

    func seek(by delta: Double) {
        let target = max(0, min(state.timePos + delta, state.duration))
        noteManualSeek(from: state.timePos, to: target)
        player?.seek(by: delta)
        state.timePos = target
        flash(.seekDelta(delta, target))
    }

    func frameStep(backward: Bool) {
        player?.frameStep(backward: backward)
    }

    func setVolume(_ volume: Double) {
        let clamped = max(0, min(130, volume))
        player?.set("volume", clamped)
        state.volume = clamped
        flash(.volume(Int(clamped), muted: false))
    }

    func adjustVolume(by delta: Double) { setVolume(state.volume + delta) }

    func toggleMute() {
        let next = !state.muted
        player?.set("mute", next)
        state.muted = next
        flash(.volume(Int(state.volume), muted: next))
    }

    func setSpeed(_ speed: Double) {
        let clamped = max(0.25, min(4, (speed * 100).rounded() / 100))
        player?.set("speed", clamped)
        state.speed = clamped
        flash(.speed(clamped))
        rememberForSeries { $0.speed = clamped == 1 ? nil : clamped }
    }

    func adjustSpeed(by delta: Double) { setSpeed(state.speed + delta) }

    func toggleSubtitles() {
        let next = !state.subtitlesVisible
        player?.set("sub-visibility", next)
        flash(.text(next ? String(localized: "字幕：開") : String(localized: "字幕：關")))
        rememberForSeries { $0.subtitlesVisible = next ? nil : false }
    }

    func selectTrack(_ kind: MediaTrack.Kind, id: Int64?) {
        let property = switch kind {
        case .video: "vid"
        case .audio: "aid"
        case .sub: "sid"
        }
        if let id { player?.set(property, id) } else { player?.set(property, "no") }
        rememberTrack(kind, id: id)
    }

    func selectSecondarySubtitle(id: Int64?) {
        if let id { player?.set("secondary-sid", id) } else { player?.set("secondary-sid", "no") }
    }

    func cycleSubtitle() {
        try? player?.command(["cycle", "sid"])
        flash(.text(String(localized: "切換字幕軌")))
        rememberTrack(.sub, id: player?.getInt("sid"))
    }

    func cycleAudio() {
        try? player?.command(["cycle", "aid"])
        flash(.text(String(localized: "切換音軌")))
        rememberTrack(.audio, id: player?.getInt("aid"))
    }

    func adjustSubtitleDelay(by delta: Double) {
        let next = ((state.subDelay + delta) * 10).rounded() / 10
        player?.set("sub-delay", next)
        flash(.text(String(localized: "字幕延遲 \(String(format: "%+.1f", next))s")))
    }

    func setSubtitleDelay(_ seconds: Double) { player?.set("sub-delay", seconds) }
    func setAudioDelay(_ seconds: Double) { player?.set("audio-delay", seconds) }

    func toggleABLoop() {
        try? player?.command(["ab-loop"])
        if state.abLoopA == nil {
            flash(.text(String(localized: "A-B 循環：設定 A 點")))
        } else if state.abLoopB == nil {
            flash(.text(String(localized: "A-B 循環：設定 B 點")))
        } else {
            flash(.text(String(localized: "A-B 循環：清除")))
        }
    }

    /// Captures the frame on screen to a temp PNG. When the reply lands the
    /// file is filed into the screenshot folder straight away and a thumbnail
    /// card offers the follow-ups (reveal, copy, save elsewhere, share,
    /// delete) — the way macOS's own screenshot does it. Interrupting
    /// playback with a modal save panel to answer a question that has a good
    /// default was the wrong trade; "詢問儲存位置" brings the panel back for
    /// anyone who wants it.
    func screenshot(withSubtitles: Bool) {
        Task { [weak self] in
            guard let png = await self?.capturePNG(withSubtitles: withSubtitles) else {
                self?.flash(.text(String(localized: "截圖失敗")))
                return
            }
            self?.fileCapture(png: png)
        }
    }

    /// Grabs the frame and encodes it here rather than through mpv's
    /// `screenshot-to-file`: MPVKit's FFmpeg carries no still-image encoder,
    /// so mpv can decode the frame but never write one out.
    private func capturePNG(withSubtitles: Bool) async -> Data? {
        guard let player else { return nil }
        return await Task.detached {
            guard let frame = try? player.screenshotRaw(includeSubtitles: withSubtitles),
                  let cgImage = frame.cgImage()
            else { return nil }
            return NSBitmapImageRep(cgImage: cgImage).representation(using: .png, properties: [:])
        }.value
    }

    private func fileCapture(png: Data) {
        let temp = FileManager.default.temporaryDirectory.appending(path: "milmil-shot-\(UUID().uuidString).png")
        do {
            try png.write(to: temp)
        } catch {
            logRing.append("[milmil] error: screenshot write failed: \(error.localizedDescription)")
            flash(.text(String(localized: "截圖失敗")))
            return
        }
        let name = screenshotFileName()
        if UserDefaults.standard.bool(forKey: DesktopDefaults.screenshotAskWhere) {
            guard let destination = askWhereToSave(named: name) else {
                try? FileManager.default.removeItem(at: temp)
                return
            }
            fileCapture(from: temp, to: destination)
        } else {
            let folder = URL(fileURLWithPath: Self.screenshotDirectory())
            fileCapture(from: temp, to: Self.uniqueURL(in: folder, named: name))
        }
    }

    private func askWhereToSave(named name: String) -> URL? {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.png]
        panel.canCreateDirectories = true
        panel.isExtensionHidden = false
        panel.message = String(localized: "儲存截圖")
        panel.nameFieldStringValue = name
        panel.directoryURL = URL(fileURLWithPath: Self.screenshotDirectory())
        return panel.runModal() == .OK ? panel.url : nil
    }

    private func fileCapture(from temp: URL, to destination: URL) {
        do {
            if FileManager.default.fileExists(atPath: destination.path) {
                try FileManager.default.removeItem(at: destination)
            }
            try FileManager.default.moveItem(at: temp, to: destination)
        } catch {
            try? FileManager.default.removeItem(at: temp)
            logRing.append("[milmil] error: screenshot save failed: \(error.localizedDescription)")
            flash(.text(String(localized: "截圖失敗")))
            return
        }
        // Downscale for the card so a 4K PNG is not held in memory as-is.
        let thumbnail = NSImage(contentsOf: destination).map { image -> NSImage in
            let side = CGSize(width: 240, height: 240 * (image.size.height / max(image.size.width, 1)))
            let scaled = NSImage(size: side)
            scaled.lockFocus()
            image.draw(in: NSRect(origin: .zero, size: side))
            scaled.unlockFocus()
            return scaled
        }
        showCapture(CaptureResult(url: destination, thumbnail: thumbnail))
    }

    private func showCapture(_ capture: CaptureResult) {
        lastCapture = capture
        captureDismissTask?.cancel()
        captureDismissTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(6))
            guard !Task.isCancelled else { return }
            self?.lastCapture = nil
        }
    }

    /// Keeps the card up while the pointer is on it, the way macOS's capture
    /// thumbnail waits rather than sliding away under the cursor.
    func holdCapture(_ hold: Bool) {
        guard lastCapture != nil else { return }
        if hold {
            captureDismissTask?.cancel()
        } else if let capture = lastCapture {
            showCapture(capture)
        }
    }

    func dismissCapture() {
        captureDismissTask?.cancel()
        lastCapture = nil
    }

    func revealCapture() {
        guard let capture = lastCapture else { return }
        NSWorkspace.shared.activateFileViewerSelecting([capture.url])
        dismissCapture()
    }

    func copyCapture() {
        guard let capture = lastCapture, let image = NSImage(contentsOf: capture.url) else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.writeObjects([image])
        flash(.text(String(localized: "截圖已複製")))
    }

    /// Moves an already-filed capture somewhere else, so "save as…" after the
    /// fact never leaves a stray copy behind.
    func relocateCapture() {
        guard let capture = lastCapture else { return }
        guard let destination = askWhereToSave(named: capture.url.lastPathComponent) else { return }
        do {
            if FileManager.default.fileExists(atPath: destination.path) {
                try FileManager.default.removeItem(at: destination)
            }
            try FileManager.default.moveItem(at: capture.url, to: destination)
            lastCapture = CaptureResult(url: destination, thumbnail: capture.thumbnail)
            flash(.text(String(localized: "已儲存 \(destination.lastPathComponent)")))
        } catch {
            logRing.append("[milmil] error: screenshot move failed: \(error.localizedDescription)")
            flash(.text(String(localized: "截圖失敗")))
        }
    }

    func deleteCapture() {
        guard let capture = lastCapture else { return }
        try? FileManager.default.trashItem(at: capture.url, resultingItemURL: nil)
        dismissCapture()
        flash(.text(String(localized: "已刪除截圖")))
    }

    /// `name.png`, `name 2.png`, … so a second capture at the same timestamp
    /// never overwrites the first.
    private static func uniqueURL(in folder: URL, named name: String) -> URL {
        let base = (name as NSString).deletingPathExtension
        let ext = (name as NSString).pathExtension
        var candidate = folder.appending(path: name)
        var counter = 2
        while FileManager.default.fileExists(atPath: candidate.path) {
            candidate = folder.appending(path: "\(base) \(counter).\(ext)")
            counter += 1
        }
        return candidate
    }

    /// `<title> 第N集 mm-ss.png` (`hh-mm-ss` past an hour), the same shape
    /// mpv's template produces for the clipboard path.
    private func screenshotFileName() -> String {
        let title = Self.screenshotSafeTitle(request?.title ?? "")
        let clock = Formatters.clock(state.timePos).replacingOccurrences(of: ":", with: "-")
        if let number = episode?.number, !number.isEmpty {
            return "\(title) 第\(number)集 \(clock).png"
        }
        return "\(title) \(clock).png"
    }

    /// Renders to a temp PNG via `screenshot-to-file`, then puts it on the
    /// pasteboard when mpv's reply arrives.
    func screenshotToClipboard(withSubtitles: Bool = true) {
        Task { [weak self] in
            guard let png = await self?.capturePNG(withSubtitles: withSubtitles),
                  let image = NSImage(data: png)
            else {
                self?.flash(.text(String(localized: "截圖失敗")))
                return
            }
            NSPasteboard.general.clearContents()
            NSPasteboard.general.writeObjects([image])
            self?.flash(.text(String(localized: "截圖已複製")))
        }
    }

    func addExternalSubtitle(fileURL: URL) {
        player?.addSubtitle(fileURL.path, title: fileURL.lastPathComponent)
        flash(.text(String(localized: "已載入 \(fileURL.lastPathComponent)")))
    }

    func skipCurrentSegment() {
        guard let segment = state.currentSegment else { return }
        skippedSegmentIDs.insert(segment.id)
        seek(to: segment.endTime)
        flash(.text(String(localized: "跳過 \(segment.label)")))
    }

    func setDanmakuEnabled(_ enabled: Bool) {
        danmakuEnabled = enabled
        session.updatePreferences { $0.danmakuEnabled = enabled }
        flash(.text(enabled ? String(localized: "彈幕：開") : String(localized: "彈幕：關")))
    }

    /// Settings changed the shared `keyboardBindings`.
    func refreshKeymap() {
        keymap = PlayerKeymap(userBindings: session.preferences.keyboardBindings.filter { !$0.key.isEmpty })
    }

    /// Re-run the danmaku pipeline after a preferences change (settings UI, web sync).
    func refreshDanmakuPreferences() {
        danmakuEnabled = session.preferences.danmakuEnabled
        danmakuStore?.apply(preferences: session.preferences)
    }

    func dismissResumePill() { showResumePill = false }

    func restartFromBeginning() {
        showResumePill = false
        seek(to: 0)
    }

    // MARK: - Keyboard

    /// Returns true when the chord was consumed.
    func perform(_ action: PlayerAction, window: PlayerWindowActions?) -> Bool {
        if performPlayback(action) { return true }
        if performAudioVideo(action) { return true }
        switch action {
        case .nextEpisode: playNext()
        case .previousEpisode: playPrevious()
        case .screenshot: screenshot(withSubtitles: false)
        case .screenshotWithSubs: screenshot(withSubtitles: true)
        case .screenshotToClipboard: screenshotToClipboard()
        case .danmakuToggle: setDanmakuEnabled(!danmakuEnabled)
        case .sleepTimer: setSleepTimer(sleepTimerMode.next)
        case .nightMode: setNightMode(!nightMode)
        case .reportProblem: copyPlaybackReport()
        case .fullscreen, .miniPlayer, .help, .techInfo, .inspector, .danmakuSettings, .danmakuCompose, .theater:
            window?.perform(action)
        default: return false
        }
        return true
    }

    private func performPlayback(_ action: PlayerAction) -> Bool {
        switch action {
        case .toggle: togglePause()
        case .seekBack5: seek(by: -5)
        case .seekForward5: seek(by: 5)
        case .seekBack30: seek(by: -30)
        case .seekForward30: seek(by: 30)
        case .frameForward: frameStep(backward: false)
        case .frameBackward: frameStep(backward: true)
        case .speedDown: adjustSpeed(by: -0.25)
        case .speedUp: adjustSpeed(by: 0.25)
        case .speedReset: setSpeed(1)
        case .abLoop: toggleABLoop()
        case .skipSegment:
            guard state.currentSegment != nil else { return false }
            skipCurrentSegment()
        default: return false
        }
        return true
    }

    private func performAudioVideo(_ action: PlayerAction) -> Bool {
        switch action {
        case .volumeUp: adjustVolume(by: 5)
        case .volumeDown: adjustVolume(by: -5)
        case .mute: toggleMute()
        case .subtitleToggle: toggleSubtitles()
        case .subtitleNext: cycleSubtitle()
        case .subtitleDelayDecrease: adjustSubtitleDelay(by: -0.1)
        case .subtitleDelayIncrease: adjustSubtitleDelay(by: 0.1)
        case .audioNext: cycleAudio()
        default: return false
        }
        return true
    }

    // MARK: - Progress

    private func scheduleSaves() {
        saveTask?.cancel()
        saveTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(Self.saveInterval))
                self?.saveProgressIfMoved()
            }
        }
    }

    private func saveProgressIfMoved() {
        guard !state.paused, state.status.isActive else { return }
        saveProgressNow()
    }

    func saveProgressNow() {
        guard let episode, let file = episode.mediaFile, state.duration > 0, hasPosition else { return }
        guard state.status.isActive || state.status == .ended else { return }
        let position = Int(state.timePos)
        guard position != lastSavedPosition else { return }
        lastSavedPosition = position
        let completed = state.duration - state.timePos <= Self.completionThreshold
        let save = ProgressSave(
            mediaFileID: file.id, episodeID: episode.episodeID,
            positionSeconds: position, durationSeconds: Int(state.duration), completed: completed
        )
        Task { [client = session.client] in
            try? await client.saveProgress(save)
        }
    }

    private func markCompleted() {
        guard let episode, let file = episode.mediaFile else { return }
        let duration = Int(max(state.duration, state.timePos))
        let save = ProgressSave(mediaFileID: file.id, episodeID: episode.episodeID, positionSeconds: duration, durationSeconds: duration, completed: true)
        Task { [client = session.client] in
            try? await client.saveProgress(save)
        }
        // Keep the local list in sync so "next unwatched" is right.
        if var playable, let index = playable.episodes.firstIndex(where: { $0.episodeID == episode.episodeID }) {
            playable = playable.markingCompleted(at: index, duration: duration)
            self.playable = playable
        }
    }

    // MARK: - Segments / post-play

    /// First entry into an OP/ED with the matching preference skips it,
    /// including when resuming into the middle of one (web `SkipSegment`).
    private func checkAutoSkip(at position: Double) {
        guard let segment = state.currentSegment, !skippedSegmentIDs.contains(segment.id) else {
            checkLearnedSkip(at: position)
            return
        }
        let auto = (segment.type == "op" && session.preferences.autoSkipOp) || (segment.type == "ed" && session.preferences.autoSkipEd)
        guard auto else { return }
        skipCurrentSegment()
    }

    /// Series without server segments use what the user taught the player:
    /// entering the first 3 s of a learned range jumps to its end, once per
    /// episode, so seeking back into it on purpose still works.
    private func checkLearnedSkip(at position: Double) {
        guard state.segments.isEmpty, let bangumiID = request?.bangumiID else { return }
        let skips = learnedSkips.skips(for: bangumiID)
        for (index, skip) in skips.enumerated() where !skippedLearned.contains(index) {
            guard position >= skip.start, position < skip.start + 3, skip.end < state.duration else { continue }
            skippedLearned.insert(index)
            player?.seek(to: skip.end)
            state.timePos = skip.end
            flash(.text(String(localized: "跳過（學會的段落）")))
            return
        }
    }

    /// Shows the next-episode card for the last 30 s with the seconds left;
    /// the actual switch waits for EOF (`handleEndFile`) like the web.
    private func checkPostPlay(at position: Double) {
        guard state.duration > 0, nextEpisode != nil, postPlayTask == nil, !postPlayDismissed, !state.sleepAtEndOfEpisode else { return }
        let remaining = state.duration - position
        if remaining <= Self.postPlayLead, remaining > 0 {
            postPlayCountdown = Int(remaining.rounded(.up))
        } else if postPlayCountdown != nil {
            postPlayCountdown = nil
        }
    }

    private func beginPostPlayCountdown(seconds: Int) {
        guard postPlayTask == nil else { return }
        postPlayCountdown = seconds
        postPlayTask = Task { [weak self] in
            while let self, let remaining = postPlayCountdown, remaining > 0, !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                guard !Task.isCancelled else { return }
                postPlayCountdown = remaining - 1
            }
            guard let self, !Task.isCancelled, postPlayCountdown == 0 else { return }
            postPlayCountdown = nil
            postPlayTask = nil
            playNext()
        }
    }

    func cancelPostPlay() {
        postPlayTask?.cancel()
        postPlayTask = nil
        postPlayCountdown = nil
    }

    /// The user closed the card: stay dismissed for the rest of this episode.
    func dismissPostPlay() {
        postPlayDismissed = true
        cancelPostPlay()
    }

    var autoNextEnabled: Bool { session.preferences.autoNext }
    var autoSkipOpEnabled: Bool { session.preferences.autoSkipOp }
    var autoSkipEdEnabled: Bool { session.preferences.autoSkipEd }

    /// The three playback habits worth flipping without leaving the picture;
    /// Settings writes the same fields.
    func setAutoNext(_ enabled: Bool) { session.updatePreferences { $0.autoNext = enabled } }
    func setAutoSkipOp(_ enabled: Bool) { session.updatePreferences { $0.autoSkipOp = enabled } }
    func setAutoSkipEd(_ enabled: Bool) { session.updatePreferences { $0.autoSkipEd = enabled } }

    // MARK: - OSD

    private func flash(_ message: OSDMessage) {
        osd = message
        osdTask?.cancel()
        osdTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(900))
            guard !Task.isCancelled else { return }
            self?.osd = nil
        }
    }

    private func scheduleHideResumePill() {
        resumePillTask?.cancel()
        resumePillTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(4))
            guard !Task.isCancelled else { return }
            self?.showResumePill = false
        }
    }

    // MARK: - Subtitles

    private func addSidecarSubtitles() {
        guard let player, sidecarsAddedForGeneration != loadGeneration else { return }
        // Playing the kept copy: its saved subtitle files, no server needed.
        if state.stage == .offlineCopy, let file = episode?.mediaFile {
            let local = OfflineStore.shared.sidecars(fileID: file.id)
            guard !local.isEmpty else { return }
            sidecarsAddedForGeneration = loadGeneration
            for item in local {
                player.addSubtitle(item.url.absoluteString, title: item.sidecar.title ?? item.sidecar.filename, language: item.sidecar.language, select: false)
            }
            return
        }
        guard !state.sidecarSubtitles.isEmpty else { return }
        sidecarsAddedForGeneration = loadGeneration
        for subtitle in state.sidecarSubtitles {
            guard let url = session.client.subtitleContentURL(id: subtitle.id, token: authToken) else { continue }
            player.addSubtitle(url.absoluteString, title: subtitle.filename, language: subtitle.language, select: false)
        }
    }

    func applySubtitleStyle(_ style: SubtitleStyle) {
        guard let player else { return }
        for (key, value) in SubtitleOptionMapper.options(for: style) {
            player.set(key, value)
        }
    }

    // MARK: - Lifecycle

    private func beginActivity() {
        guard activity == nil else { return }
        activity = ProcessInfo.processInfo.beginActivity(options: [.idleDisplaySleepDisabled, .userInitiated], reason: "Playing video")
        scheduleSaves()
    }

    private func endActivity() {
        if let activity { ProcessInfo.processInfo.endActivity(activity) }
        activity = nil
        saveTask?.cancel()
        saveTask = nil
    }

    /// Window closed: persist, stop, keep the instance for reuse.
    func windowClosed() {
        saveProgressNow()
        cancelPostPlay()
        loadTask?.cancel()
        transcodeTask?.cancel()
        loadGeneration += 1
        player?.stop()
        endActivity()
        state.status = .idle
        NowPlayingBridge.shared.clear()
    }

    func shutdown() {
        saveProgressNow()
        cancelPostPlay()
        cancelSleepTimer()
        audioWatcher.stop()
        eventTask?.cancel()
        loadTask?.cancel()
        transcodeTask?.cancel()
        loadGeneration += 1
        endActivity()
        NowPlayingBridge.shared.detach()
        player?.destroy()
    }

    // MARK: - Series memory

    private func rememberForSeries(_ change: (inout SeriesPlaybackPreference) -> Void) {
        guard let bangumiID = request?.bangumiID else { return }
        seriesPreferences.update(bangumiID, change)
    }

    private func rememberTrack(_ kind: MediaTrack.Kind, id: Int64?) {
        let track = id.flatMap { id in state.tracks.first { $0.kind == kind && $0.id == id } }
        switch kind {
        case .audio:
            rememberForSeries {
                $0.audioLanguage = track?.language
                $0.audioTitle = track?.title
            }
        case .sub:
            rememberForSeries {
                $0.subtitleOff = id == nil
                $0.subtitleLanguage = track?.language
                $0.subtitleTitle = track?.title
            }
        case .video:
            break
        }
    }

    /// Re-applies what the user chose on this series' last episode, once
    /// per file and only once the tracks are known. A remembered track wins
    /// over mpv's language chain when it exists in this file; otherwise the
    /// chain's pick stands.
    private func applySeriesPreference() {
        guard seriesPreferenceAppliedGeneration != loadGeneration, !state.tracks.isEmpty, let player,
              let bangumiID = request?.bangumiID, let preference = seriesPreferences.preference(for: bangumiID) else { return }
        seriesPreferenceAppliedGeneration = loadGeneration
        if let audio = SeriesPlaybackPreferences.match(state.audioTracks, language: preference.audioLanguage, title: preference.audioTitle) {
            player.set("aid", audio.id)
        }
        if preference.subtitleOff {
            player.set("sid", "no")
        } else if let sub = SeriesPlaybackPreferences.match(state.subtitleTracks, language: preference.subtitleLanguage, title: preference.subtitleTitle) {
            player.set("sid", sub.id)
        }
        if let visible = preference.subtitlesVisible { player.set("sub-visibility", visible) }
        if let speed = preference.speed, speed != state.speed {
            player.set("speed", speed)
            state.speed = speed
        }
    }

    // MARK: - Learned skips

    /// A hand-made forward jump the length of an OP/ED is a hint; the second
    /// matching one on the same series becomes a suggestion.
    private func noteManualSeek(from: Double, to: Double) {
        guard let bangumiID = request?.bangumiID, hasPosition, to > from else { return }
        guard let learned = learnedSkips.record(start: from, length: to - from, for: bangumiID) else { return }
        skipSuggestion = learned
        flash(.text(String(localized: "這段自動跳過？側欄 › 視訊 可以記住")))
        skipSuggestionTask?.cancel()
        skipSuggestionTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(20))
            guard !Task.isCancelled else { return }
            self?.skipSuggestion = nil
        }
    }

    func acceptSkipSuggestion() {
        guard let skip = skipSuggestion, let bangumiID = request?.bangumiID else { return }
        learnedSkips.remember(skip, for: bangumiID)
        skipSuggestion = nil
        skipSuggestionTask?.cancel()
        flash(.text(String(localized: "已記住：之後自動跳過這段")))
    }

    func declineSkipSuggestion() {
        skipSuggestion = nil
        skipSuggestionTask?.cancel()
    }

    /// Learned ranges for the current series, for the inspector.
    var learnedSkipsForSeries: [LearnedSkip] {
        request.map { learnedSkips.skips(for: $0.bangumiID) } ?? []
    }

    func forgetLearnedSkips() {
        guard let bangumiID = request?.bangumiID else { return }
        learnedSkips.forget(for: bangumiID)
        skippedLearned = []
        flash(.text(String(localized: "已忘記學會的段落")))
    }

    // MARK: - Sleep timer

    func setSleepTimer(_ mode: SleepTimerMode) {
        cancelSleepTimer()
        sleepTimerMode = mode
        switch mode {
        case .off:
            flash(.text(String(localized: "睡眠計時器：關")))
        case .endOfEpisode:
            state.sleepAtEndOfEpisode = true
            cancelPostPlay()
            flash(.text(String(localized: "播完這集停止")))
        case let .minutes(minutes):
            let endsAt = Date().addingTimeInterval(Double(minutes) * 60)
            state.sleepTimerEndsAt = endsAt
            flash(.text(String(localized: "\(minutes) 分鐘後停")))
            sleepTask = Task { [weak self] in
                // Fade starts 10 s before the deadline so the pause lands on time.
                try? await Task.sleep(for: .seconds(max(0, Double(minutes) * 60 - 10)))
                guard !Task.isCancelled else { return }
                await self?.fadeOutAndPause()
                self?.finishSleepTimer()
            }
        }
    }

    func cancelSleepTimer() {
        sleepTask?.cancel()
        sleepTask = nil
        fadeTask?.cancel()
        fadeTask = nil
        state.sleepTimerEndsAt = nil
        state.sleepAtEndOfEpisode = false
        sleepTimerMode = .off
    }

    private func finishSleepTimer() {
        cancelSleepTimer()
        setPaused(true)
        flash(.text(String(localized: "睡眠計時器：已暫停")))
    }

    /// 播完這集停止 fades over the episode's last 10 s.
    private func checkSleepFade(at position: Double) {
        guard state.sleepAtEndOfEpisode, fadeTask == nil, state.duration > 0, state.duration - position <= 10 else { return }
        fadeTask = Task { [weak self] in await self?.fadeOutAndPause(pauseAtEnd: false) }
    }

    /// Volume to zero over ten seconds, then (optionally) pause, then the
    /// volume back where it was so the next play is not silent.
    private func fadeOutAndPause(pauseAtEnd: Bool = true) async {
        guard let player else { return }
        let original = state.volume
        let steps = 40
        for step in 1...steps {
            guard !Task.isCancelled else {
                player.set("volume", original)
                return
            }
            player.set("volume", original * Double(steps - step) / Double(steps))
            try? await Task.sleep(for: .milliseconds(250))
        }
        if pauseAtEnd { player.set("pause", true) }
        player.set("volume", original)
        state.volume = original
    }

    // MARK: - Night mode / headphones

    /// Loudness normalisation for late nights: quieter peaks, clearer dialogue.
    func setNightMode(_ enabled: Bool) {
        nightMode = enabled
        UserDefaults.standard.set(enabled, forKey: DesktopDefaults.nightMode)
        applyNightMode(enabled)
        flash(.text(enabled ? String(localized: "夜間模式：開") : String(localized: "夜間模式：關")))
    }

    private static let nightFilter = "@night:lavfi=[loudnorm=I=-24:LRA=7:TP=-2]"

    private func applyNightMode(_ enabled: Bool) {
        guard let player else { return }
        do {
            if enabled {
                try player.command(["change-list", "af", "add", Self.nightFilter])
            } else {
                try player.command(["change-list", "af", "remove", "@night"])
            }
        } catch {
            Self.log.error("night mode: af change failed: \(String(describing: error))")
        }
    }

    /// Headphones / Bluetooth gone: pause rather than play on through the speakers.
    private func outputRouteLost() {
        guard UserDefaults.standard.object(forKey: DesktopDefaults.pauseOnHeadphoneDisconnect) as? Bool ?? true else { return }
        guard state.status == .playing || { if case .buffering = state.status { return true }; return false }() else { return }
        setPaused(true)
        flash(.text(String(localized: "耳機已中斷，已暫停")))
    }

    // MARK: - Screenshots / report

    /// `<title> 第N集 mm-ss.png` (`hh-mm-ss` past an hour) instead of mpv's
    /// `mpv-shot0001`. `%` is mpv's own escape, so the title loses it.
    private func applyScreenshotTemplate(title: String, number: String) {
        guard let player else { return }
        let clock = state.duration >= 3600 ? "%wH-%wM-%wS" : "%wM-%wS"
        player.set("screenshot-template", "\(Self.screenshotSafeTitle(title)) 第\(number)集 \(clock)")
    }

    /// The title with path separators, mpv's `%` escape and other unsafe
    /// filename characters removed, capped at 60 characters.
    private static func screenshotSafeTitle(_ title: String) -> String {
        let banned = CharacterSet(charactersIn: "/:%\\?*\"<>|").union(.controlCharacters).union(.newlines)
        var safe = title.unicodeScalars.filter { !banned.contains($0) }.map(String.init).joined().trimmingCharacters(in: .whitespaces)
        if safe.count > 60 { safe = String(safe.prefix(60)) }
        return safe.isEmpty ? "milmil" : safe
    }

    /// Deep link to this moment, for sharing a screenshot with context:
    /// `milmil://watch/<bangumiID>?ep=<episodeID>&t=<seconds>`.
    var screenshotShareURL: URL? {
        guard let request, let episode else { return nil }
        return URL(string: "milmil://watch/\(request.bangumiID)?ep=\(episode.episodeID)&t=\(Int(state.timePos))")
    }

    /// Everything a bug report about this playback needs, as plain text.
    func playbackReport() -> String {
        var lines: [String] = []
        lines.append("milmil playback report · \(Date().formatted(.iso8601))")
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
        lines.append("app: \(version) · macOS \(ProcessInfo.processInfo.operatingSystemVersionString)")
        if let request { lines.append("series: \(request.title) (bangumi \(request.bangumiID))") }
        if let episode { lines.append("episode: \(episode.number) · \(episode.episodeID)") }
        if let file = episode?.mediaFile { lines.append("file: \(file.filename) · \(file.path ?? "") · \(file.sizeBytes ?? 0) B") }
        lines.append("stage: \(state.stage.rawValue) · status: \(state.status) · position: \(Int(state.timePos))/\(Int(state.duration)) s")
        let size = "\(Int(state.videoSize.width))×\(Int(state.videoSize.height))"
        lines.append("video: \(state.videoCodec) \(size) · hwdec: \(state.hwdec) · HDR: \(state.isHDR) · fps: \(state.fps)")
        lines.append("audio: \(state.audioCodec) · speed: \(state.speed) · volume: \(Int(state.volume)) · night mode: \(nightMode)")
        if let player {
            lines.append("mpv: \(player.getString("mpv-version") ?? "?") · ffmpeg: \(player.getString("ffmpeg-version") ?? "?")")
            lines.append("path: \(player.getString("path") ?? "")")
            let drops = [
                "frame \(player.getInt("frame-drop-count") ?? -1)",
                "decoder \(player.getInt("decoder-frame-drop-count") ?? -1)",
                "vo-delayed \(player.getInt("vo-delayed-frame-count") ?? -1)",
            ]
            lines.append("drops: " + drops.joined(separator: " · "))
            let sync = "estimated-vf-fps: \(player.getDouble("estimated-vf-fps") ?? 0) · avsync: \(player.getDouble("avsync") ?? 0)"
            lines.append("\(sync) · cache: \(Int(state.cacheSeconds)) s")
            lines.append("tracks: aid \(player.getString("aid") ?? "?") · sid \(player.getString("sid") ?? "?")")
            lines.append("af: \(player.getString("af") ?? "") · shaders: \(player.getString("glsl-shaders") ?? "")")
        }
        lines.append("tracks:")
        for track in state.tracks { lines.append("  \(track.kind.rawValue) \(track.id) \(track.displayName)\(track.isSelected ? " *" : "")") }
        lines.append("segments: \(state.segments.map { "\($0.type) \(Int($0.startTime))-\(Int($0.endTime))" }.joined(separator: ", "))")
        lines.append("")
        lines.append("mpv log (last \(logRing.count)):")
        lines.append(contentsOf: logRing)
        return lines.joined(separator: "\n")
    }

    func copyPlaybackReport() {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(playbackReport(), forType: .string)
        flash(.text(String(localized: "播放問題報告已複製")))
    }

    // MARK: - Helpers

    private func adjacentEpisode(offset: Int) -> PlayableEpisode? {
        let list = episodes
        guard let episode, let index = list.firstIndex(where: { $0.episodeID == episode.episodeID }) else { return nil }
        var cursor = index + offset
        while cursor >= 0, cursor < list.count {
            if list[cursor].mediaFile != nil { return list[cursor] }
            cursor += offset
        }
        return nil
    }

    private static func languageChain(_ preferred: String?, fallback: [String]) -> [String] {
        guard let preferred, !preferred.isEmpty else { return fallback }
        return [preferred] + fallback.filter { $0 != preferred }
    }

    /// The configured screenshot folder, falling back to ~/Pictures/milmil.
    /// Created on demand — the old code assumed it existed.
    static func screenshotDirectory() -> String {
        let custom = UserDefaults.standard.string(forKey: DesktopDefaults.screenshotFolder)
        let dir: URL
        if let custom, !custom.isEmpty {
            dir = URL(fileURLWithPath: custom)
        } else {
            let pictures = FileManager.default.urls(for: .picturesDirectory, in: .userDomainMask).first ?? URL(fileURLWithPath: NSHomeDirectory())
            dir = pictures.appending(path: "milmil")
        }
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.path
    }
}

/// Short messages the OSD pill shows for ~0.9 s.
enum OSDMessage: Equatable {
    case seek(Double)
    case seekDelta(Double, Double)
    case volume(Int, muted: Bool)
    case speed(Double)
    case text(String)
}

/// Things only the window can do (fullscreen, panels); the controller
/// routes those keyboard actions back to it.
@MainActor
protocol PlayerWindowActions: AnyObject {
    func perform(_ action: PlayerAction)
}

extension PlayableEpisodesResponse {
    /// Copy with one episode's progress replaced by "completed".
    func markingCompleted(at index: Int, duration: Int) -> PlayableEpisodesResponse {
        var copy = self
        copy.episodes[index] = episodes[index].withProgress(PlayableProgress(positionSeconds: duration, durationSeconds: duration, completed: true))
        return copy
    }
}

/// A capture that has been written to disk, plus a small preview for the card.
struct CaptureResult: Equatable, Identifiable {
    let url: URL
    let thumbnail: NSImage?
    var id: URL { url }
}
