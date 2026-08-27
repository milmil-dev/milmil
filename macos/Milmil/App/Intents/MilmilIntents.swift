import AppIntents
import AppKit
import MilmilAPI

/// 「播 X 的下一集」: opens the watch page on the series, which resumes the
/// in-progress episode or starts the next unwatched one (the page's own
/// primary action).
struct PlayNextEpisodeIntent: AppIntent {
    static let title: LocalizedStringResource = "Play Next Episode"
    static let description = IntentDescription("Opens milmil and plays the next episode of a series in your collection.")
    static let openAppWhenRun = true

    @Parameter(title: "Anime")
    var anime: AnimeEntity

    static var parameterSummary: some ParameterSummary {
        Summary("Play the next episode of \(\.$anime)")
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        guard let url = URL(string: "milmil://watch/\(anime.id)") else { return .result() }
        AppDelegate.restoreRegularIfNeeded()
        NSApp.activate()
        SystemNotifier.shared.openURL?(url)
        return .result()
    }
}

/// 「今晚有咩播」: the followed series airing today with local times.
nonisolated struct AiringTonightIntent: AppIntent {
    static let title: LocalizedStringResource = "What's Airing Today"
    static let description = IntentDescription("Lists the series you follow that air today, with local times.")

    @MainActor
    func perform() async throws -> some ProvidesDialog {
        guard let client = CurrentSession.shared.session?.client else {
            return .result(dialog: IntentDialog(stringLiteral: String(localized: "尚未登入 milmil。")))
        }
        let airing = await FollowedAiring.today(client: client).items
        guard !airing.isEmpty else {
            return .result(dialog: IntentDialog(stringLiteral: String(localized: "沒有追蹤中的番劇今天播出")))
        }
        let lines = airing.map { show in
            let when = show.localTime ?? show.airTimeJST
            let ep = show.episode.map { " EP\($0)" } ?? ""
            return "\(when)  \(show.title)\(ep)"
        }
        return .result(dialog: IntentDialog(stringLiteral: lines.joined(separator: "\n")))
    }
}

nonisolated struct MilmilShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: PlayNextEpisodeIntent(),
            phrases: ["Play the next episode in \(.applicationName)", "Continue watching in \(.applicationName)"],
            shortTitle: "Play Next Episode",
            systemImageName: "play.fill"
        )
        AppShortcut(
            intent: AiringTonightIntent(),
            phrases: ["What's airing today in \(.applicationName)", "Airing tonight in \(.applicationName)"],
            shortTitle: "Airing Today",
            systemImageName: "calendar"
        )
    }
}
