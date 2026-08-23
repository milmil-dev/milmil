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
    /// The user dismissed the next-episode card for this episode.
    private var postPlayDismissed = false
    private var activity: NSObjectProtocol?
    private var loadGeneration = 0
    private var authToken: String?

    var episodes: [PlayableEpisode] { playable?.episodes.sorted { $0.sort < $1.sort } ?? [] }
    var nextEpisode: PlayableEpisode? { adjacentEpisode(offset: 1) }
    var previousEpisode: PlayableEpisode? { adjacentEpisode(offset: -1) }

    init(session: ServerSession) {
        self.session = session
        keymap = PlayerKeymap(userBindings: session.preferences.keyboardBindings)
        danmakuEnabled = session.preferences.danmakuEnabled
        var options = MPVOptions()
        options.userAgent = UserAgent.value
        options.subtitleLanguages = Self.languageChain(session.preferences.defaultSubtitleLanguage, fallback: ["zh-TW", "zh-Hant", "zh", "en"])
        options.audioLanguages = Self.languageChain(session.preferences.defaultAudioLanguage, fallback: ["ja", "jpn"])
        options.screenshotDirectory = Self.screenshotDirectory()
        // Set on the handle after init since the token can rotate per session.
        do {
            player = try MPVPlayer(options: options)
        } catch {
            Self.log.error("mpv init failed: \(String(describing: error))")
            player = nil
            state.status = .failed("無法初始化 mpv：\(error)")
        }
        Task { await refreshAuthHeader() }
        startEventLoop()
        applySubtitleStyle(session.preferences.subtitleStyle)
        NowPlayingBridge.shared.attach(self)
    }

    // MARK: - Loading

    func play(_ request: PlaybackRequest) {
        self.request = request
        state.status = .loading("讀取集數…")
        state.mediaTitle = request.title
        loadTask?.cancel()
        loadGeneration += 1
        let generation = loadGeneration
        loadTask = Task { await loadSeries(request, generation: generation) }
    }

    /// Browse screens may only know the id; fill the title/cover in later.
    func updateTitle(_ title: String, cover: URL?) {
        guard let request, request.title != title || request.coverImage != cover else { return }
        self.request = PlaybackRequest(bangumiID: request.bangumiID, episodeID: request.episodeID, title: title, coverImage: cover)
        if let episode { state.mediaTitle = "\(title) 第 \(episode.number) 集" }
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
                state.status = .failed("這部作品沒有可播放的檔案")
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
        state.status = .loading("準備串流…")
        state.segments = []
        state.sidecarSubtitles = []
        state.thumbnails = nil
        state.timePos = 0
        state.duration = Double(episode.progress?.durationSeconds ?? 0)
        skippedSegmentIDs = []
        lastSavedPosition = -1
        hasPosition = false
        postPlayDismissed = false
        let number = episode.number
        state.mediaTitle = "\(request?.title ?? "") 第 \(number) 集"
        if let progress = episode.progress, progress.positionSeconds > 0, !progress.completed {
            resumePosition = progress.positionSeconds
        } else {
            resumePosition = nil
        }
        showResumePill = false

        // Ask the server what it knows; mpv ignores can_direct_play but the
        // ladder needs library_online and the transcode availability.
        let info = try? await session.client.mediaInfo(fileID: file.id)
        guard generation == loadGeneration, !Task.isCancelled else { return }
        if let info, !info.libraryOnline {
            player?.stop()
            state.status = .failed("媒體庫目前離線，無法播放此檔案")
            return
        }
        fallback = StreamFallback(hasLocalFile: false, canRemux: info?.canRemux ?? true, canTranscode: true)
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

    private func loadCurrentStage(fileID: String) async {
        let stage = fallback.current
        state.stage = stage
        let generation = loadGeneration
        switch stage {
        case .localFile:
            fallback.advance()
            await loadCurrentStage(fileID: fileID)
        case .direct:
            load(url: session.client.directStreamURL(fileID: fileID), generation: generation)
        case .remux:
            load(url: session.client.remuxStreamURL(fileID: fileID), generation: generation)
        case .hls:
            state.status = .loading("伺服器轉碼中…")
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
                            state.status = .loading("伺服器轉碼中… \(progress ?? 0)%")
                        case .failed:
                            state.status = .failed("伺服器轉碼失敗")
                            return
                        }
                        token = start.token
                    }
                } catch {
                    if !Task.isCancelled { state.status = .failed("無法開始轉碼：\(error.localizedDescription)") }
                }
            }
        }
    }

    private func load(url: URL, generation: Int) {
        guard let player, generation == loadGeneration else { return }
        var options: [String: String] = [:]
        // A fallback after playback already started continues where we were;
        // the first load honours the server's resume position.
        if state.timePos > 1 {
            options["start"] = String(Int(state.timePos))
        } else if let resumePosition {
            options["start"] = String(resumePosition)
        }
        // Titles can contain commas, which would split loadfile's option list.
        player.set("force-media-title", state.mediaTitle)
        player.loadFile(url.absoluteString, options: options)
        player.set("pause", false)
    }

    private func loadThumbnails(fileID: String, generation: Int) async {
        guard let vttURL = session.client.thumbnailsURL(fileID: fileID, token: authToken),
              let spriteURL = session.client.spriteURL(fileID: fileID, token: authToken) else { return }
        guard let (data, response) = try? await URLSession.milmil.data(from: vttURL),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let text = String(data: data, encoding: .utf8), generation == loadGeneration else { return }
        state.thumbnails = ThumbnailTrack.parse(text, spriteURL: spriteURL)
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
            state.status = state.paused ? .paused : .playing
            showResumePill = resumePosition != nil
            if showResumePill { scheduleHideResumePill() }
            addSidecarSubtitles()
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
        case .log, .commandReply, .queueOverflow, .shutdown:
            break
        }
    }

    private func handleEndFile(_ reason: EndFileReason) {
        endActivity()
        switch reason {
        case .eof:
            markCompleted()
            state.status = .ended
            if session.preferences.autoNext, nextEpisode != nil, !postPlayDismissed { beginPostPlayCountdown(seconds: 5) }
        case .error:
            if fallback.advance() != nil, let file = episode?.mediaFile {
                Self.log.warning("stage \(self.state.stage.rawValue) failed, trying \(self.fallback.current.rawValue)")
                Task { await loadCurrentStage(fileID: file.id) }
            } else {
                state.status = .failed("無法播放此檔案（已嘗試所有串流方式）")
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
            guard let pos = value?.doubleValue else { return true }
            hasPosition = true
            state.clock.update(position: pos, hostTime: now)
            if now - lastTimelinePush >= 0.1 {
                lastTimelinePush = now
                state.timePos = pos
                checkAutoSkip(at: pos)
                checkPostPlay(at: pos)
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
        case "track-list": state.tracks = MediaTrack.parseList(value?.nodeValue)
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

    func seek(to seconds: Double) {
        player?.seek(to: max(0, min(seconds, state.duration)))
        state.timePos = seconds
        flash(.seek(seconds))
    }

    func seek(by delta: Double) {
        player?.seek(by: delta)
        let target = max(0, min(state.timePos + delta, state.duration))
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
    }

    func adjustSpeed(by delta: Double) { setSpeed(state.speed + delta) }

    func toggleSubtitles() {
        let next = !state.subtitlesVisible
        player?.set("sub-visibility", next)
        flash(.text(next ? "字幕：開" : "字幕：關"))
    }

    func selectTrack(_ kind: MediaTrack.Kind, id: Int64?) {
        let property = switch kind {
        case .video: "vid"
        case .audio: "aid"
        case .sub: "sid"
        }
        if let id { player?.set(property, id) } else { player?.set(property, "no") }
    }

    func selectSecondarySubtitle(id: Int64?) {
        if let id { player?.set("secondary-sid", id) } else { player?.set("secondary-sid", "no") }
    }

    func cycleSubtitle() {
        try? player?.command(["cycle", "sid"])
        flash(.text("切換字幕軌"))
    }

    func cycleAudio() {
        try? player?.command(["cycle", "aid"])
        flash(.text("切換音軌"))
    }

    func adjustSubtitleDelay(by delta: Double) {
        let next = ((state.subDelay + delta) * 10).rounded() / 10
        player?.set("sub-delay", next)
        flash(.text(String(format: "字幕延遲 %+.1fs", next)))
    }

    func setSubtitleDelay(_ seconds: Double) { player?.set("sub-delay", seconds) }
    func setAudioDelay(_ seconds: Double) { player?.set("audio-delay", seconds) }

    func toggleABLoop() {
        try? player?.command(["ab-loop"])
        if state.abLoopA == nil {
            flash(.text("A-B 循環：設定 A 點"))
        } else if state.abLoopB == nil {
            flash(.text("A-B 循環：設定 B 點"))
        } else {
            flash(.text("A-B 循環：清除"))
        }
    }

    func screenshot(withSubtitles: Bool) {
        player?.commandAsync(["screenshot", withSubtitles ? "subtitles" : "video"])
        flash(.text("已儲存截圖"))
    }

    func addExternalSubtitle(fileURL: URL) {
        player?.addSubtitle(fileURL.path, title: fileURL.lastPathComponent)
        flash(.text("已載入 \(fileURL.lastPathComponent)"))
    }

    func skipCurrentSegment() {
        guard let segment = state.currentSegment else { return }
        skippedSegmentIDs.insert(segment.id)
        seek(to: segment.endTime)
        flash(.text("跳過 \(segment.label)"))
    }

    func setDanmakuEnabled(_ enabled: Bool) {
        danmakuEnabled = enabled
        session.updatePreferences { $0.danmakuEnabled = enabled }
        flash(.text(enabled ? "彈幕：開" : "彈幕：關"))
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
        case .danmakuToggle: setDanmakuEnabled(!danmakuEnabled)
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
        guard let segment = state.currentSegment, !skippedSegmentIDs.contains(segment.id) else { return }
        let auto = (segment.type == "op" && session.preferences.autoSkipOp) || (segment.type == "ed" && session.preferences.autoSkipEd)
        guard auto else { return }
        skipCurrentSegment()
    }

    /// Shows the next-episode card for the last 30 s with the seconds left;
    /// the actual switch waits for EOF (`handleEndFile`) like the web.
    private func checkPostPlay(at position: Double) {
        guard state.duration > 0, nextEpisode != nil, postPlayTask == nil, !postPlayDismissed else { return }
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
        guard let player, sidecarsAddedForGeneration != loadGeneration, !state.sidecarSubtitles.isEmpty else { return }
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
        eventTask?.cancel()
        loadTask?.cancel()
        transcodeTask?.cancel()
        loadGeneration += 1
        endActivity()
        NowPlayingBridge.shared.detach()
        player?.destroy()
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

    private static func screenshotDirectory() -> String {
        let pictures = FileManager.default.urls(for: .picturesDirectory, in: .userDomainMask).first ?? URL(fileURLWithPath: NSHomeDirectory())
        let dir = pictures.appending(path: "milmil")
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
