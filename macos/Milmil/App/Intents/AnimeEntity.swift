import AppIntents
import MilmilAPI

/// A series in the collection, as Shortcuts / Siri see it. Backed by the
/// live collection through `CurrentSession`; nothing is persisted.
nonisolated struct AnimeEntity: AppEntity {
    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Anime")
    static let defaultQuery = AnimeEntityQuery()

    /// Bangumi subject ID.
    let id: Int
    let title: String

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: LocalizedStringResource(stringLiteral: title))
    }

    @MainActor
    static func collection() async -> [AnimeEntity] {
        guard let client = CurrentSession.shared.session?.client, let items = try? await client.collection() else { return [] }
        return items.compactMap { item in
            guard let id = item.bangumiID, id > 0 else { return nil }
            return AnimeEntity(id: id, title: item.displayTitle)
        }
    }
}

nonisolated struct AnimeEntityQuery: EntityStringQuery {
    func entities(for identifiers: [Int]) async throws -> [AnimeEntity] {
        let wanted = Set(identifiers)
        return await AnimeEntity.collection().filter { wanted.contains($0.id) }
    }

    func entities(matching string: String) async throws -> [AnimeEntity] {
        let needle = string.lowercased()
        return await AnimeEntity.collection().filter { $0.title.lowercased().contains(needle) }
    }

    func suggestedEntities() async throws -> [AnimeEntity] {
        Array(await AnimeEntity.collection().prefix(20))
    }
}
