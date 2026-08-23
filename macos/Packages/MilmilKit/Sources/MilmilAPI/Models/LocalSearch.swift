import Foundation

/// `GET /search/anime?q=` — fuzzy search over series already in the library
/// (what ⌘K shows under "在你的媒體庫").
public struct LocalSearchHit: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let bangumiID: Int?
    public let anilistID: Int?
    public let title: String
    public let altTitles: [String]
    public let score: Double
    public let source: String

    enum CodingKeys: String, CodingKey {
        case id, title, score, source
        case bangumiID = "bangumi_id"
        case anilistID = "anilist_id"
        case altTitles = "alt_titles"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        bangumiID = try c.decodeIfPresent(Int.self, forKey: .bangumiID)
        anilistID = try c.decodeIfPresent(Int.self, forKey: .anilistID)
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
        altTitles = try c.decodeIfPresent([String].self, forKey: .altTitles) ?? []
        score = try c.decodeIfPresent(Double.self, forKey: .score) ?? 0
        source = try c.decodeIfPresent(String.self, forKey: .source) ?? ""
    }
}

struct LocalSearchResponse: Decodable, Sendable {
    let items: [LocalSearchHit]
}
