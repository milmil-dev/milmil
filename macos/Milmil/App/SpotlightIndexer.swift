import AppKit
import CoreSpotlight
import MilmilAPI
import Observation

/// Puts the collection into Spotlight: one searchable item per series (title,
/// alternate titles, genres, cover thumbnail) that opens the series page.
/// Re-indexes on session start and, throttled, after library events.
@MainActor
final class SpotlightIndexer {
    static let shared = SpotlightIndexer()

    static let domain = "anime"
    private static let identifierPrefix = "anime-"
    private var indexedAt: Date?
    private var task: Task<Void, Never>?
    private let throttle: TimeInterval = 60

    static func identifier(for bangumiID: Int) -> String { identifierPrefix + String(bangumiID) }

    static func bangumiID(fromIdentifier identifier: String) -> Int? {
        guard identifier.hasPrefix(identifierPrefix) else { return nil }
        return Int(identifier.dropFirst(identifierPrefix.count))
    }

    /// Start following a session: index now, then again after every
    /// library / scan / match event, at most once a minute.
    func follow(_ session: ServerSession) {
        task?.cancel()
        task = Task { [weak self] in
            await self?.reindex(client: session.client)
            await self?.observe(session)
        }
    }

    func stop() {
        task?.cancel()
        task = nil
    }

    private func observe(_ session: ServerSession) async {
        while !Task.isCancelled {
            let generation = session.eventGeneration
            await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                withObservationTracking {
                    _ = session.eventGeneration
                } onChange: {
                    continuation.resume()
                }
            }
            guard !Task.isCancelled, session.eventGeneration != generation else { continue }
            let type = session.lastEvent?.type ?? ""
            let relevant = type.hasPrefix("scan:completed") || type.hasPrefix("match:completed") || type.hasPrefix("library") || type == "notification:new"
            guard relevant else { continue }
            if let indexedAt, Date().timeIntervalSince(indexedAt) < throttle { continue }
            await reindex(client: session.client)
        }
    }

    /// Full rebuild: drop the domain, then add every series in the collection.
    func reindex(client: APIClient) async {
        guard CSSearchableIndex.isIndexingAvailable(), let items = try? await client.collection() else { return }
        indexedAt = Date()
        let index = CSSearchableIndex.default()
        try? await index.deleteSearchableItems(withDomainIdentifiers: [Self.domain])
        var searchable: [CSSearchableItem] = []
        for item in items {
            guard let bangumiID = item.bangumiID, bangumiID > 0 else { continue }
            let attributes = CSSearchableItemAttributeSet(contentType: .content)
            attributes.title = item.displayTitle
            attributes.alternateNames = [item.title, item.titleZh, item.titleEN].compactMap { $0 }.filter { !$0.isEmpty && $0 != item.displayTitle }
            attributes.keywords = item.genres + ["anime", "milmil"]
            var description = item.genres.prefix(4).joined(separator: " · ")
            if let year = item.year { description = "\(year) · " + description }
            attributes.contentDescription = description
            attributes.identifier = Self.identifier(for: bangumiID)
            if let cover = item.coverImage, let image = await ImageCache.shared.image(for: cover, maxPixel: 240) {
                attributes.thumbnailData = NSBitmapImageRep(cgImage: image).representation(using: .jpeg, properties: [.compressionFactor: 0.8])
            }
            searchable.append(CSSearchableItem(uniqueIdentifier: Self.identifier(for: bangumiID), domainIdentifier: Self.domain, attributeSet: attributes))
        }
        guard !searchable.isEmpty else { return }
        try? await index.indexSearchableItems(searchable)
    }

    func clear() async {
        try? await CSSearchableIndex.default().deleteSearchableItems(withDomainIdentifiers: [Self.domain])
    }
}
