import Foundation

/// `GET /anime/{bangumiId}/offline-manifest` — everything a client needs to
/// keep a series on disk: one entry per episode that has a file, with the
/// sidecar subtitles and the danmaku snapshot URL when the server has them.
public struct OfflineManifest: Decodable, Sendable, Hashable {
    public let bangumiID: Int
    public let title: String
    public let episodes: [Episode]

    public struct Episode: Decodable, Sendable, Hashable, Identifiable {
        public let episodeID: String
        public let number: Double
        public let title: String?
        public let file: File
        public let subtitles: [Subtitle]
        public let danmakuURL: URL?

        public var id: String { episodeID }

        enum CodingKeys: String, CodingKey {
            case number, title, file, subtitles
            case episodeID = "episode_id"
            case danmakuURL = "danmaku_url"
        }

        public init(from decoder: any Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            episodeID = try c.decode(String.self, forKey: .episodeID)
            number = try c.decodeIfPresent(Double.self, forKey: .number) ?? 0
            title = try c.decodeIfPresent(String.self, forKey: .title).nonEmpty
            file = try c.decode(File.self, forKey: .file)
            subtitles = try c.decodeIfPresent([Subtitle].self, forKey: .subtitles) ?? []
            danmakuURL = try c.decodeIfPresent(String.self, forKey: .danmakuURL).flatMap { URL(string: $0) }
        }

        public init(episodeID: String, number: Double, title: String?, file: File, subtitles: [Subtitle] = [], danmakuURL: URL? = nil) {
            self.episodeID = episodeID
            self.number = number
            self.title = title
            self.file = file
            self.subtitles = subtitles
            self.danmakuURL = danmakuURL
        }
    }

    public struct File: Decodable, Sendable, Hashable {
        public let id: String
        public let url: URL
        public let sizeBytes: Int64
        public let etag: String?
        public let container: String
        public let width: Int?
        public let height: Int?
        public let videoCodec: String?

        enum CodingKeys: String, CodingKey {
            case id, url, etag, container, width, height
            case sizeBytes = "size_bytes"
            case videoCodec = "video_codec"
        }

        public init(from decoder: any Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = try c.decode(String.self, forKey: .id)
            guard let url = URL(string: try c.decode(String.self, forKey: .url)) else {
                throw DecodingError.dataCorruptedError(forKey: .url, in: c, debugDescription: "invalid file url")
            }
            self.url = url
            sizeBytes = try c.decodeIfPresent(Int64.self, forKey: .sizeBytes) ?? 0
            etag = try c.decodeIfPresent(String.self, forKey: .etag).nonEmpty
            container = try c.decodeIfPresent(String.self, forKey: .container).nonEmpty ?? "mkv"
            width = try c.decodeIfPresent(Int.self, forKey: .width)
            height = try c.decodeIfPresent(Int.self, forKey: .height)
            videoCodec = try c.decodeIfPresent(String.self, forKey: .videoCodec).nonEmpty
        }

        public init(
            id: String, url: URL, sizeBytes: Int64, etag: String? = nil, container: String,
            width: Int? = nil, height: Int? = nil, videoCodec: String? = nil
        ) {
            self.id = id
            self.url = url
            self.sizeBytes = sizeBytes
            self.etag = etag
            self.container = container
            self.width = width
            self.height = height
            self.videoCodec = videoCodec
        }
    }

    public struct Subtitle: Decodable, Sendable, Hashable {
        public let index: Int
        public let language: String?
        public let title: String?
        public let url: URL

        public init(from decoder: any Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            index = try c.decodeIfPresent(Int.self, forKey: .index) ?? 0
            language = try c.decodeIfPresent(String.self, forKey: .language).nonEmpty
            title = try c.decodeIfPresent(String.self, forKey: .title).nonEmpty
            guard let url = URL(string: try c.decode(String.self, forKey: .url)) else {
                throw DecodingError.dataCorruptedError(forKey: .url, in: c, debugDescription: "invalid subtitle url")
            }
            self.url = url
        }

        enum CodingKeys: String, CodingKey { case index, language, title, url }
    }

    enum CodingKeys: String, CodingKey {
        case title, episodes
        case bangumiID = "bangumi_id"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        bangumiID = try c.decode(Int.self, forKey: .bangumiID)
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
        episodes = try c.decodeIfPresent([Episode].self, forKey: .episodes) ?? []
    }

    public init(bangumiID: Int, title: String, episodes: [Episode]) {
        self.bangumiID = bangumiID
        self.title = title
        self.episodes = episodes
    }
}
