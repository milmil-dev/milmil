import Foundation
import MilmilAPI
import Observation

/// 「繼續睇？」: an episode left paused mid-way (more than two minutes to go,
/// not completed) for half an hour gets one gentle banner with 播放, and the
/// banner is withdrawn the moment playback resumes or the episode changes.
/// Read-only over the player: it observes `PlayerCoordinator.controller`'s
/// state and never drives it.
@MainActor
final class ResumeReminder {
    static let delay: TimeInterval = 30 * 60
    static let minimumRemaining: Double = 120

    private let coordinator: PlayerCoordinator
    private let preferences: NotificationPreferences
    private let notifier: SystemNotifier
    private var timer: Task<Void, Never>?
    private var watching = false
    /// Episode the pending timer belongs to; a different one restarts it.
    private var pendingEpisodeID: String?

    init(coordinator: PlayerCoordinator, preferences: NotificationPreferences = .shared, notifier: SystemNotifier = .shared) {
        self.coordinator = coordinator
        self.preferences = preferences
        self.notifier = notifier
    }

    func start() {
        guard !watching else { return }
        watching = true
        observe()
    }

    func stop() {
        watching = false
        cancel()
    }

    private func observe() {
        guard watching else { return }
        withObservationTracking {
            evaluate()
        } onChange: { [weak self] in
            Task { @MainActor in self?.observe() }
        }
    }

    /// Paused mid-episode → arm; anything else → disarm. Reads the same
    /// observable properties every pass so the tracking stays registered.
    private func evaluate() {
        guard let controller = coordinator.controller, let episode = controller.episode, let request = controller.request else {
            cancel()
            return
        }
        let state = controller.state
        // Only read the clock once paused: `timePos` ticks ten times a
        // second while playing and would re-arm the tracking each time.
        guard state.status == .paused, episode.hasFile, preferences.resumeReminders else {
            cancel()
            return
        }
        let remaining = state.duration - state.timePos
        guard remaining > Self.minimumRemaining else {
            cancel()
            return
        }
        guard pendingEpisodeID != episode.episodeID else { return }
        cancel()
        pendingEpisodeID = episode.episodeID
        let title = request.title.isEmpty ? episode.displayTitle ?? "" : request.title
        let ep = episode.number
        let minutes = max(1, Int(remaining / 60))
        timer = Task { [weak self] in
            try? await Task.sleep(for: .seconds(Self.delay))
            guard !Task.isCancelled, let self else { return }
            // Still the same episode, still paused?
            guard coordinator.controller?.episode?.episodeID == episode.episodeID, coordinator.controller?.state.status == .paused else { return }
            notifier.postLocal(
                id: "resume-\(episode.episodeID)",
                title: String(localized: "繼續睇《\(title)》？"),
                body: String(localized: "第 \(ep) 集仲有 \(minutes) 分鐘就睇完"),
                bangumiID: request.bangumiID,
                episodeID: episode.episodeID,
                category: SystemNotifier.CategoryID.anime
            )
        }
    }

    private func cancel() {
        timer?.cancel()
        timer = nil
        if let id = pendingEpisodeID {
            notifier.removePending(["resume-\(id)"])
            pendingEpisodeID = nil
        }
    }
}
