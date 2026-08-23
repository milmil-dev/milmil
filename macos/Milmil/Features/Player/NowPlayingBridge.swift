import AppKit
import MediaPlayer

/// Now Playing (Control Center, media keys, AirPods) for the single player.
///
/// MediaPlayer invokes command handlers and the artwork request block on
/// its own queue, so every closure handed to it is `@Sendable` and hops
/// back to the main actor explicitly — the app's default MainActor
/// isolation would otherwise trap in `dispatch_assert_queue`.
@MainActor
final class NowPlayingBridge {
    static let shared = NowPlayingBridge()

    private weak var controller: PlayerController?
    private var registered = false
    private var artworkURL: URL?
    private var artwork: MPMediaItemArtwork?

    func attach(_ controller: PlayerController) {
        self.controller = controller
        guard !registered else { return }
        registered = true
        let center = MPRemoteCommandCenter.shared()
        register(center.playCommand) { $0.togglePause() }
        register(center.pauseCommand) { $0.togglePause() }
        register(center.togglePlayPauseCommand) { $0.togglePause() }
        register(center.nextTrackCommand) { $0.playNext() }
        register(center.previousTrackCommand) { $0.playPrevious() }
        center.skipForwardCommand.preferredIntervals = [10]
        register(center.skipForwardCommand) { $0.seek(by: 10) }
        center.skipBackwardCommand.preferredIntervals = [10]
        register(center.skipBackwardCommand) { $0.seek(by: -10) }
        center.changePlaybackPositionCommand.addTarget { @Sendable event in
            guard let position = (event as? MPChangePlaybackPositionCommandEvent)?.positionTime else { return .commandFailed }
            Task { @MainActor in NowPlayingBridge.shared.controller?.seek(to: position) }
            return .success
        }
    }

    private func register(_ command: MPRemoteCommand, _ body: @escaping @MainActor (PlayerController) -> Void) {
        command.addTarget { @Sendable _ in
            Task { @MainActor in
                if let controller = NowPlayingBridge.shared.controller { body(controller) }
            }
            return .success
        }
    }

    func detach() {
        controller = nil
        clear()
    }

    func update(_ controller: PlayerController) {
        let state = controller.state
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: state.mediaTitle,
            MPMediaItemPropertyArtist: controller.request?.title ?? "milmil",
            MPMediaItemPropertyPlaybackDuration: state.duration,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: state.timePos,
            MPNowPlayingInfoPropertyPlaybackRate: state.paused ? 0 : state.speed,
            MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.video.rawValue,
        ]
        if let artwork { info[MPMediaItemPropertyArtwork] = artwork }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
        MPNowPlayingInfoCenter.default().playbackState = state.paused ? .paused : .playing
        if let cover = controller.request?.coverImage, cover != artworkURL {
            artworkURL = cover
            Task { await loadArtwork(cover) }
        }
    }

    func clear() {
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        MPNowPlayingInfoCenter.default().playbackState = .stopped
    }

    private func loadArtwork(_ url: URL) async {
        guard let cgImage = await ImageCache.shared.image(for: url, maxPixel: 600) else { return }
        let size = NSSize(width: cgImage.width, height: cgImage.height)
        // NSImage is not Sendable; the request block only reads it, and the
        // image is never mutated after creation.
        nonisolated(unsafe) let image = NSImage(cgImage: cgImage, size: size)
        artwork = MPMediaItemArtwork(boundsSize: size) { @Sendable _ in image }
        if let controller { update(controller) }
    }
}
