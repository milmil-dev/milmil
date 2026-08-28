import AVFoundation
import Combine
import MilmilAPI
import Observation

/// AVPlayer behind `PlaybackEngine`. The ladder lives here rather than in the
/// screen: a rung failing is a playback event, and the view only ever needs to
/// know which rung it ended up on.
@Observable
@MainActor
final class AVPlaybackEngine: PlaybackEngine {
    /// No ASS styling: AVFoundation renders the text of a WebVTT track and
    /// nothing of an ASS one, which is the known cost of v1 not being libmpv.
    /// Claiming a screenshot would repeat the macOS mistake this set exists to
    /// prevent.
    let capabilities: Set<Capability> = [.multiAudioTrack, .playbackSpeed]

    private(set) var state = PlaybackState()

    let player = AVPlayer()

    private let client: APIClient
    private var ladder = StreamFallback(hasLocalFile: false)
    private var fileID: String?
    private var resumeAt: Double = 0
    private var ticker: Task<Void, Never>?
    private var observers: [any NSObjectProtocol] = []
    private var statusObservation: NSKeyValueObservation?

    init(client: APIClient) {
        self.client = client
        configureSession()
    }

    /// Background audio and picture-in-picture both require this; without it
    /// the sound stops the moment the app leaves the foreground.
    private func configureSession() {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    func positionNow() -> Double {
        let time = player.currentTime().seconds
        return time.isFinite ? max(0, time) : 0
    }

    func open(fileID: String, startAt: Double) {
        self.fileID = fileID
        resumeAt = startAt
        state = PlaybackState(status: .buffering)
        Task {
            // Ask first: a file the server already knows it cannot remux should
            // not cost the user a failed open to find that out.
            let info = try? await client.mediaInfo(fileID: fileID)
            ladder = StreamFallback(
                hasLocalFile: false,
                canRemux: info?.canRemux ?? true,
                canTranscode: true
            )
            if info?.canDirectPlay == false { _ = ladder.advance() }
            await openCurrentStage()
        }
        startTicking()
    }

    private func openCurrentStage() async {
        guard let fileID else { return }
        // APIClient is an actor; the token has to be read across it before the
        // URL can be built on this side.
        let token = await client.currentToken()
        let stage = ladder.current
        let url: URL
        switch stage {
        case .hls:
            guard let started = try? await client.startTranscode(fileID: fileID) else {
                fail("轉碼開唔到")
                return
            }
            url = client.hlsURL(token: started.token)
        default:
            url = client.authorizedStreamURL(fileID: fileID, stage: stage, token: token)
        }

        state.stage = stage
        state.status = .buffering
        state.message = nil

        let item = AVPlayerItem(url: url)
        observe(item)
        player.replaceCurrentItem(with: item)
        if resumeAt > 0 {
            await player.seek(to: CMTime(seconds: resumeAt, preferredTimescale: 600))
        }
        player.play()
    }

    private func observe(_ item: AVPlayerItem) {
        observers.forEach(NotificationCenter.default.removeObserver)
        observers.removeAll()
        observers.append(
            NotificationCenter.default.addObserver(
                forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main
            ) { [weak self] _ in
                Task { @MainActor in self?.state.status = .ended }
            }
        )
        observers.append(
            NotificationCenter.default.addObserver(
                forName: .AVPlayerItemFailedToPlayToEndTime, object: item, queue: .main
            ) { [weak self] _ in
                Task { @MainActor in self?.fallBack("播放中斷") }
            }
        )
        statusObservation = item.observe(\.status, options: [.new]) { [weak self] item, _ in
            Task { @MainActor in
                guard let self else { return }
                switch item.status {
                case .readyToPlay: break
                case .failed: self.fallBack(item.error?.localizedDescription ?? "開唔到")
                default: break
                }
            }
        }
    }

    /// A rung failed: drop to the next one, or give up and say which.
    private func fallBack(_ reason: String) {
        guard ladder.advance() != nil else {
            fail(reason)
            return
        }
        // Keep the position: falling a rung should not restart the episode.
        resumeAt = positionNow()
        Task { await openCurrentStage() }
    }

    private func fail(_ reason: String) {
        state.status = .failed
        state.message = reason
    }

    func play() {
        player.play()
        state.status = .playing
    }

    func pause() {
        player.pause()
        state.status = .paused
    }

    func seek(to seconds: Double) {
        Task { await player.seek(to: CMTime(seconds: max(0, seconds), preferredTimescale: 600)) }
    }

    func setSpeed(_ speed: Float) {
        player.rate = speed
        state.speed = speed
    }

    func select(stage: StreamStage) {
        guard ladder.select(stage) else { return }
        resumeAt = positionNow()
        Task { await openCurrentStage() }
    }

    func stop() {
        ticker?.cancel()
        statusObservation?.invalidate()
        observers.forEach(NotificationCenter.default.removeObserver)
        observers.removeAll()
        player.pause()
        player.replaceCurrentItem(with: nil)
    }

    /// AVPlayer reports position by polling, so the UI needs a clock. One
    /// second is what a progress bar and a time label can tell apart.
    private func startTicking() {
        ticker?.cancel()
        ticker = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                guard let self else { return }
                self.state.position = self.positionNow()
                let duration = self.player.currentItem?.duration.seconds ?? 0
                self.state.duration = duration.isFinite ? duration : 0
                // Status comes from `timeControlStatus`, not from the item's
                // `readyToPlay` transition: the rate is still 0 at that moment,
                // so the engine sat in `.buffering` for the whole episode and
                // the ten-second progress reporter never fired once.
                if self.state.status != .failed, self.state.status != .ended {
                    self.state.status = switch self.player.timeControlStatus {
                    case .playing: .playing
                    case .paused: .paused
                    default: .buffering
                    }
                }
            }
        }
    }
}
