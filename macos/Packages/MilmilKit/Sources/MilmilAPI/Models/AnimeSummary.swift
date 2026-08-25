import Foundation

/// `metadata.AnimeSummary` — the card-sized shape the discover endpoints,
/// calendar and hero carousel all return. Image fields are absolute CDN URLs
/// (AniList / Bangumi / TMDB); the server has no image proxy.
public struct AnimeSummary: Decodable, Sendable, Hashable, Identifiable {
    public let bangumiID: Int
    public let anilistID: Int?
    public let title: String
    public let titleOriginal: String?
    public let titleEN: String?
    public let coverImage: URL?
    public let bannerImage: URL?
    public let description: String?
    @LenientStringArray public var genres: [String]
    public let airDate: String?
    public let episodeCount: Int
    public let score: Double
    public let nextEpisode: Int?
    /// `HH:mm` in Asia/Tokyo.
    public let airTime: String?
    /// TV, MOVIE, OVA, ONA, SPECIAL.
    public let mediaType: String?

    /// AniList-only entries all have `bangumiID == 0`, so keying by it alone
    /// makes `ForEach` collapse them; compose both ids like the web's card key.
    public var id: String { "\(bangumiID)-\(anilistID ?? 0)" }

    enum CodingKeys: String, CodingKey {
        case bangumiID = "bangumi_id"
        case anilistID = "anilist_id"
        case title
        case titleOriginal = "title_original"
        case titleEN = "title_en"
        case coverImage = "cover_image"
        case bannerImage = "banner_image"
        case description, genres
        case airDate = "air_date"
        case episodeCount = "episode_count"
        case score
        case nextEpisode = "next_episode"
        case airTime = "air_time"
        case mediaType = "media_type"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        bangumiID = try c.decode(Int.self, forKey: .bangumiID)
        anilistID = try c.decodeIfPresent(Int.self, forKey: .anilistID)
        title = try c.decode(String.self, forKey: .title)
        titleOriginal = try c.decodeIfPresent(String.self, forKey: .titleOriginal).nonEmpty
        titleEN = try c.decodeIfPresent(String.self, forKey: .titleEN).nonEmpty
        coverImage = try c.decodeIfPresent(String.self, forKey: .coverImage).httpURL
        bannerImage = try c.decodeIfPresent(String.self, forKey: .bannerImage).httpURL
        description = try c.decodeIfPresent(String.self, forKey: .description).nonEmpty
        _genres = try c.decode(LenientStringArray.self, forKey: .genres)
        airDate = try c.decodeIfPresent(String.self, forKey: .airDate).nonEmpty
        episodeCount = try c.decodeIfPresent(Int.self, forKey: .episodeCount) ?? 0
        score = try c.decodeIfPresent(Double.self, forKey: .score) ?? 0
        nextEpisode = try c.decodeIfPresent(Int.self, forKey: .nextEpisode)
        airTime = try c.decodeIfPresent(String.self, forKey: .airTime).nonEmpty
        mediaType = try c.decodeIfPresent(String.self, forKey: .mediaType).nonEmpty
    }
}

extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
}

extension String? {
    var nonEmpty: String? {
        guard let self, !self.isEmpty else { return nil }
        return self
    }

    /// The web client guards every image with `src.startsWith('http')`;
    /// anything else (empty, relative, placeholder) is treated as no image.
    var httpURL: URL? {
        guard let self, self.hasPrefix("http"), let url = URL(string: self) else { return nil }
        return url
    }
}
