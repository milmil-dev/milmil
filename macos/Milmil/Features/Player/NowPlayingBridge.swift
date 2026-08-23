import AppKit
import MediaPlayer

/// Now Playing (Control Center, media keys, AirPods) for the single player.
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
        center.playCommand.addTarget { [weak self] _ in self?.withController { $0.togglePause() } ?? .noSuchContent }
        center.pauseCommand.addTarget { [weak self] _ in self?.withController { $0.togglePause() } ?? .noSuchContent }
        center.togglePlayPauseCommand.addTarget { [weak self] _ in self?.withController { $0.togglePause() } ?? .noSuchContent }
        center.nextTrackCommand.addTarget { [weak self] _ in self?.withController { $0.playNext() } ?? .noSuchContent }
        center.previousTrackCommand.addTarget { [weak self] _ in self?.withController { $0.playPrevious() } ?? .noSuchContent }
        center.skipForwardCommand.preferredIntervals = [10]
        center.skipForwardCommand.addTarget { [weak self] _ in self?.withController { $0.seek(by: 10) } ?? .noSuchContent }
        center.skipBackwardCommand.preferredIntervals = [10]
        center.skipBackwardCommand.addTarget { [weak self] _ in self?.withController { $0.seek(by: -10) } ?? .noSuchContent }
        center.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let position = (event as? MPChangePlaybackPositionCommandEvent)?.positionTime else { return .commandFailed }
            return self?.withController { $0.seek(to: position) } ?? .noSuchContent
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
        let image = NSImage(cgImage: cgImage, size: NSSize(width: cgImage.width, height: cgImage.height))
        artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
        if let controller { update(controller) }
    }

    private func withController(_ body: (PlayerController) -> Void) -> MPRemoteCommandHandlerStatus {
        guard let controller else { return .noSuchContent }
        body(controller)
        return .success
    }
}
