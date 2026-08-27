import Foundation
import MilmilAPI

/// ⌘⇧N: the next unwatched episode of whatever was watched most recently —
/// the in-progress one itself when it is unfinished, else the first later
/// episode with a file that has not been completed.
@MainActor
enum NextEpisodeAction {
    struct Target: Equatable {
        let request: PlaybackRequest
        let episodeID: String
    }

    static func resolve(client: APIClient) async -> Target? {
        guard let latest = try? await client.recentProgress().first, let bangumiID = latest.animeBangumiID,
              let playable = try? await client.playableEpisodes(bangumiID: bangumiID) else { return nil }
        let episodes = playable.episodes.sorted { $0.sort < $1.sort }
        let candidate: PlayableEpisode? = if !latest.completed, let current = episodes.first(where: { $0.episodeID == latest.episodeID }), current.hasFile {
            current
        } else {
            episodes.first { $0.sort > latest.episodeNumber && $0.hasFile && $0.progress?.completed != true }
        }
        guard let candidate else { return nil }
        let request = PlaybackRequest(bangumiID: bangumiID, episodeID: candidate.episodeID, title: latest.displayTitle, coverImage: latest.animeCoverImage)
        return Target(request: request, episodeID: candidate.episodeID)
    }

    static func perform(session: ServerSession, player: PlayerCoordinator, router: Router?) async {
        guard let target = await resolve(client: session.client) else { return }
        player.play(target.request)
        router?.openWatch(bangumiID: target.request.bangumiID, episodeID: target.episodeID)
    }
}

extension Notification.Name {
    /// `/` anywhere: the Search page focuses its field; other pages open the palette.
    static let milmilFocusSearch = Notification.Name("dev.milmil.focusSearch")
}
