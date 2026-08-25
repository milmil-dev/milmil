import Foundation

/// `GET /discover/anime/{id}` — `metadata.AnimeDetail`. Flattened rather than
/// embedding `AnimeSummary` so call sites read `detail.title`, not `detail.summary.title`.
public struct AnimeDetail: Decodable, Sendable, Hashable, Identifiable {
    public let summary: AnimeSummary
    public let synopsis: String?
    public let trailerURL: URL?
    @LenientStringArray public var tags: [String]
    public let popularity: Int?
    public let rating: Rating
    public let relations: [RelatedAnime]
    public let recommendations: [AnimeSummary]
    public let reviews: [UserReview]
    public let characters: [AnimeCharacter]

    public var id: Int { summary.bangumiID }
    public var title: String { summary.title }
    public var coverImage: URL? { summary.coverImage }
    public var bannerImage: URL? { summary.bannerImage }

    enum CodingKeys: String, CodingKey {
        case synopsis, tags, popularity, rating, relations, recommendations, reviews, characters
        case trailerURL = "trailer_url"
    }

    public init(from decoder: any Decoder) throws {
        summary = try AnimeSummary(from: decoder)
        let c = try decoder.container(keyedBy: CodingKeys.self)
        synopsis = try c.decodeIfPresent(String.self, forKey: .synopsis).nonEmpty
        trailerURL = try c.decodeIfPresent(String.self, forKey: .trailerURL).httpURL
        _tags = try c.decode(LenientStringArray.self, forKey: .tags)
        popularity = try c.decodeIfPresent(Int.self, forKey: .popularity)
        rating = try c.decodeIfPresent(Rating.self, forKey: .rating) ?? Rating(score: 0, total: 0)
        relations = try c.decodeIfPresent([RelatedAnime].self, forKey: .relations) ?? []
        recommendations = try c.decodeIfPresent([AnimeSummary].self, forKey: .recommendations) ?? []
        reviews = try c.decodeIfPresent([UserReview].self, forKey: .reviews) ?? []
        characters = try c.decodeIfPresent([AnimeCharacter].self, forKey: .characters) ?? []
    }
}

public struct Rating: Decodable, Sendable, Hashable {
    public let score: Double
    public let total: Int

    public init(score: Double, total: Int) {
        self.score = score
        self.total = total
    }
}

public struct RelatedAnime: Decodable, Sendable, Hashable, Identifiable {
    /// PREQUEL, SEQUEL, SIDE_STORY, …
    public let relationType: String
    public let anime: AnimeSummary

    public var id: Int { anime.bangumiID }

    enum CodingKeys: String, CodingKey {
        case relationType = "relation_type"
        case anime
    }
}

public struct UserReview: Decodable, Sendable, Hashable, Identifiable {
    public let id: Int
    public let summary: String
    public let score: Int
    public let username: String
    public let avatar: URL?

    enum CodingKeys: String, CodingKey { case id, summary, score, username, avatar }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(Int.self, forKey: .id)
        summary = try c.decodeIfPresent(String.self, forKey: .summary) ?? ""
        score = try c.decodeIfPresent(Int.self, forKey: .score) ?? 0
        username = try c.decodeIfPresent(String.self, forKey: .username) ?? ""
        avatar = try c.decodeIfPresent(String.self, forKey: .avatar).httpURL
    }
}

public struct AnimeCharacter: Decodable, Sendable, Hashable, Identifiable {
    /// "MAIN" | "SUPPORTING"
    public let role: String
    public let character: CharacterPerson
    public let voiceActor: CharacterPerson?

    public var id: Int { character.id }

    enum CodingKeys: String, CodingKey {
        case role, character
        case voiceActor = "voice_actor"
    }
}

public struct CharacterPerson: Decodable, Sendable, Hashable, Identifiable {
    public let id: Int
    public let name: String
    public let nameNative: String?
    public let image: URL?

    enum CodingKeys: String, CodingKey {
        case id, name, image
        case nameNative = "name_native"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(Int.self, forKey: .id)
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
        nameNative = try c.decodeIfPresent(String.self, forKey: .nameNative).nonEmpty
        image = try c.decodeIfPresent(String.self, forKey: .image).httpURL
    }
}

/// `GET /discover/calendar` — seven entries, `weekdayEN` is `Mon`…`Sun`.
public struct CalendarDay: Decodable, Sendable, Hashable, Identifiable {
    public let weekday: String
    public let weekdayEN: String
    public let items: [AnimeSummary]

    public var id: String { weekdayEN }

    enum CodingKeys: String, CodingKey {
        case weekday, items
        case weekdayEN = "weekday_en"
    }
}

/// `GET /discover/anime/{id}/episodes` — Bangumi's episode list (not the
/// library's; see `PlayableEpisode` for what is actually on disk).
public struct DiscoverEpisode: Decodable, Sendable, Hashable, Identifiable {
    public let bangumiEpisodeID: Int
    public let sort: Double
    public let title: String
    public let titleOriginal: String?
    public let airDate: String?
    public let synopsis: String?
    public let image: URL?
    /// Minutes.
    public let duration: Int?

    public var id: Int { bangumiEpisodeID }

    enum CodingKeys: String, CodingKey {
        case sort, title, synopsis, image, duration
        case bangumiEpisodeID = "bangumi_episode_id"
        case titleOriginal = "title_original"
        case airDate = "air_date"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        bangumiEpisodeID = try c.decode(Int.self, forKey: .bangumiEpisodeID)
        sort = try c.decodeIfPresent(Double.self, forKey: .sort) ?? 0
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
        titleOriginal = try c.decodeIfPresent(String.self, forKey: .titleOriginal).nonEmpty
        airDate = try c.decodeIfPresent(String.self, forKey: .airDate).nonEmpty
        synopsis = try c.decodeIfPresent(String.self, forKey: .synopsis).nonEmpty
        image = try c.decodeIfPresent(String.self, forKey: .image).httpURL
        duration = try c.decodeIfPresent(Int.self, forKey: .duration)
    }
}

/// `GET /discover/anime/{id}/comments` — Bangumi user comments.
public struct BangumiComment: Decodable, Sendable, Hashable, Identifiable {
    public let id: Int
    public let username: String
    public let nickname: String
    public let avatar: URL?
    public let rate: Int
    public let comment: String
    /// Unix seconds.
    public let updatedAt: Int

    enum CodingKeys: String, CodingKey {
        case id, username, nickname, avatar, rate, comment
        case updatedAt = "updated_at"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(Int.self, forKey: .id)
        username = try c.decodeIfPresent(String.self, forKey: .username) ?? ""
        nickname = try c.decodeIfPresent(String.self, forKey: .nickname) ?? ""
        avatar = try c.decodeIfPresent(String.self, forKey: .avatar).httpURL
        rate = try c.decodeIfPresent(Int.self, forKey: .rate) ?? 0
        comment = try c.decodeIfPresent(String.self, forKey: .comment) ?? ""
        updatedAt = try c.decodeIfPresent(Int.self, forKey: .updatedAt) ?? 0
    }
}

/// `GET /discover/tags/popular`.
public struct HotTag: Decodable, Sendable, Hashable, Identifiable {
    public let id: Int
    public let name: String
    /// theme / source / mood / …
    public let category: String
    public let count: Int
}

public struct FranchiseEntry: Decodable, Sendable, Hashable, Identifiable {
    public let anilistID: Int
    public let bangumiID: Int
    public let title: String
    public let titleOriginal: String?
    public let coverImage: URL?
    public let mediaType: String?
    public let airDate: String?
    public let episodeCount: Int
    public let score: Double
    public let relationType: String?

    public var id: Int { anilistID != 0 ? anilistID : bangumiID }

    enum CodingKeys: String, CodingKey {
        case title, score
        case anilistID = "anilist_id"
        case bangumiID = "bangumi_id"
        case titleOriginal = "title_original"
        case coverImage = "cover_image"
        case mediaType = "media_type"
        case airDate = "air_date"
        case episodeCount = "episode_count"
        case relationType = "relation_type"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        anilistID = try c.decodeIfPresent(Int.self, forKey: .anilistID) ?? 0
        bangumiID = try c.decodeIfPresent(Int.self, forKey: .bangumiID) ?? 0
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
        titleOriginal = try c.decodeIfPresent(String.self, forKey: .titleOriginal).nonEmpty
        coverImage = try c.decodeIfPresent(String.self, forKey: .coverImage).httpURL
        mediaType = try c.decodeIfPresent(String.self, forKey: .mediaType).nonEmpty
        airDate = try c.decodeIfPresent(String.self, forKey: .airDate).nonEmpty
        episodeCount = try c.decodeIfPresent(Int.self, forKey: .episodeCount) ?? 0
        score = try c.decodeIfPresent(Double.self, forKey: .score) ?? 0
        relationType = try c.decodeIfPresent(String.self, forKey: .relationType).nonEmpty
    }
}

public struct FranchiseResult: Decodable, Sendable, Hashable {
    public let mainSeries: [FranchiseEntry]
    public let sideStories: [FranchiseEntry]

    enum CodingKeys: String, CodingKey {
        case mainSeries = "main_series"
        case sideStories = "side_stories"
    }
}

/// Query for `GET /discover/browse`.
public struct BrowseQuery: Sendable, Hashable {
    public enum Sort: String, Sendable, CaseIterable {
        case popularity, score, trending, date

        /// The AniList MediaSort value the API expects (mirrors web's SORT_OPTIONS);
        /// the raw value is only a local identifier.
        var queryValue: String {
            switch self {
            case .popularity: "POPULARITY_DESC"
            case .score: "SCORE_DESC"
            case .trending: "TRENDING_DESC"
            case .date: "START_DATE_DESC"
            }
        }
    }

    public var genre: String?
    public var sort: Sort = .popularity
    public var year: Int?
    /// WINTER / SPRING / SUMMER / FALL
    public var season: String?
    public var minScore: Double?
    /// RELEASING / FINISHED / NOT_YET_RELEASED
    public var status: String?
    /// TV / MOVIE / OVA / ONA / SPECIAL
    public var format: String?
    public var adult = false
    public var page = 1

    public init(
        genre: String? = nil,
        sort: Sort = .popularity,
        year: Int? = nil,
        season: String? = nil,
        minScore: Double? = nil,
        status: String? = nil,
        format: String? = nil,
        adult: Bool = false,
        page: Int = 1
    ) {
        self.genre = genre
        self.sort = sort
        self.year = year
        self.season = season
        self.minScore = minScore
        self.status = status
        self.format = format
        self.adult = adult
        self.page = page
    }

    var queryItems: [URLQueryItem] {
        var items: [URLQueryItem] = [URLQueryItem(name: "page", value: String(page)), URLQueryItem(name: "sort", value: sort.queryValue)]
        if let genre { items.append(URLQueryItem(name: "genre", value: genre)) }
        if let year { items.append(URLQueryItem(name: "year", value: String(year))) }
        if let season { items.append(URLQueryItem(name: "season", value: season)) }
        if let minScore { items.append(URLQueryItem(name: "min_score", value: String(minScore))) }
        if let status { items.append(URLQueryItem(name: "status", value: status)) }
        if let format { items.append(URLQueryItem(name: "format", value: format)) }
        if adult { items.append(URLQueryItem(name: "adult", value: "true")) }
        return items
    }
}
