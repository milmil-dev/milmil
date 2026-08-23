import Foundation
import Testing
@testable import MilmilAPI

@Suite("Discover")
struct DiscoverTests {
    @Test("trending decodes full and sparse summaries; non-http covers become nil")
    func trendingDecodes() async throws {
        let transport = FakeTransport()
        transport.stub("GET /api/v1/discover/trending", json: try Fixtures.string("trending"))
        let client = APIClient(baseURL: URL(string: "http://192.168.50.178:8080")!, transport: transport)

        let items = try await client.trending(page: 1)

        #expect(items.count == 2)
        #expect(transport.requests.first?.url?.query() == "page=1")

        let full = items[0]
        #expect(full.id == 530725)
        #expect(full.coverImage?.host() == "s4.anilist.co")
        #expect(full.genres == ["动作", "冒险", "超自然"])
        #expect(full.score == 8.1 && full.episodeCount == 13 && full.airTime == "23:00")

        let sparse = items[1]
        #expect(sparse.coverImage == nil)
        #expect(sparse.titleOriginal == nil)
        #expect(sparse.genres == ["奇幻"])
        #expect(sparse.anilistID == nil && sparse.nextEpisode == nil)
    }

    @Test("a full live trending page (server 0.1.15) decodes with every cover")
    func liveTrendingPage() async throws {
        let transport = FakeTransport()
        transport.stub("GET /api/v1/discover/trending", json: try Fixtures.string("trending_live"))
        let client = APIClient(baseURL: URL(string: "http://192.168.50.178:8080")!, transport: transport)

        let items = try await client.trending()

        #expect(items.count == 20)
        #expect(items.compactMap(\.coverImage).count == 20)
        #expect(items.allSatisfy { !$0.title.isEmpty && $0.score >= 0 })
    }
}
