import Foundation
import Testing
@testable import MilmilAPI

@Suite("Browse endpoints")
struct BrowseTests {
    let base = URL(string: "http://127.0.0.1:18080")!

    private func client(_ stubs: [String: String]) -> (APIClient, FakeTransport) {
        let transport = FakeTransport()
        for (key, json) in stubs { transport.stub(key, json: json) }
        return (APIClient(baseURL: base, token: "mlml_t", transport: transport), transport)
    }

    @Test("the live calendar decodes all seven days with Bangumi http covers")
    func calendar() async throws {
        let (client, _) = client(["GET /api/v1/discover/calendar": try Fixtures.string("calendar_live")])

        let days = try await client.calendar()

        #expect(days.count == 7)
        #expect(days.map(\.weekdayEN) == ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
        #expect(days.allSatisfy { !$0.items.isEmpty })
        let first = try #require(days.first?.items.first)
        #expect(first.coverImage?.host() == "lain.bgm.tv")
    }

    @Test("playable episodes: file, progress, specials and the resume candidate")
    func playableEpisodes() async throws {
        let (client, _) = client(["GET /api/v1/anime/501234/playable-episodes": try Fixtures.string("playable_episodes")])

        let response = try await client.playableEpisodes(bangumiID: 501234)

        #expect(response.watchStatus == .watching)
        #expect(response.syncDisabled == false)
        #expect(response.episodes.count == 3)
        let first = response.episodes[0]
        #expect(first.displayTitle == "魔法的開端")
        #expect(first.mediaFile?.resolutionLabel == "1080p")
        #expect(first.progress?.remainingSeconds == 411)
        #expect(response.episodes[1].mediaFile?.resolutionLabel == "4K")
        #expect(response.episodes[1].image == nil)
        #expect(response.episodes[2].number == "12.5" && !response.episodes[2].hasFile)
        #expect(response.resumeCandidate?.episodeID == "ep_1")
    }

    @Test("collection rows survive null-heavy entries and string genres")
    func collection() async throws {
        let (client, transport) = client(["GET /api/v1/collection": try Fixtures.string("collection")])

        let items = try await client.collection(status: .watching, search: "帽子", sortByName: true)

        #expect(transport.requests.first?.url?.query()?.contains("status=watching") == true)
        #expect(transport.requests.first?.url?.query()?.contains("sort=name") == true)
        #expect(items.count == 2)
        #expect(items[0].displayTitle == "尖帽子的魔法工房")
        #expect(items[0].genres == ["奇幻", "冒險"])
        #expect(items[0].watchStatusUpdatedAt != nil)
        #expect(items[1].watchStatus == .none && items[1].coverImage == nil && items[1].genres.isEmpty)
    }

    @Test("recent progress: 0/1 completed, mixed timestamps, fraction and remaining")
    func recentProgress() async throws {
        let (client, _) = client(["GET /api/v1/progress/recent": try Fixtures.string("progress_recent")])

        let entries = try await client.recentProgress()

        #expect(entries.count == 2)
        #expect(entries[0].completed == false)
        #expect(entries[0].fraction.map { abs($0 - 0.71) < 0.01 } == true)
        #expect(entries[0].remainingSeconds == 411)
        #expect(entries[0].displayTitle == "尖帽子的魔法工房")
        #expect(entries[1].completed == true && entries[1].fraction == nil && entries[1].animeCoverImage == nil)
        #expect(entries[1].lastWatchedAt != nil)
    }

    @Test("notifications decode NullString, plain-string and null metadata")
    func notifications() async throws {
        let (client, transport) = client(["GET /api/v1/notifications": try Fixtures.string("notifications")])

        let list = try await client.notifications(category: .download, limit: 20)

        #expect(transport.requests.first?.url?.query()?.contains("filter=download") == true)
        #expect(list.count == 3)
        #expect(list[0].metadata == "{\"gid\":\"abc\"}" && list[0].read == false && list[0].category == .download)
        #expect(list[1].metadata == nil && list[1].read == true && list[1].category == .library)
        #expect(list[2].metadata == "{\"feed\":\"dmhy\"}" && list[2].severity == .error && list[2].category == .system)
    }

    @Test("browse query serialises only the set filters")
    func browseQuery() {
        var query = BrowseQuery(genre: "奇幻", sort: .score, year: 2026)
        query.season = "SPRING"
        let names = query.queryItems.map(\.name)
        #expect(names == ["page", "sort", "genre", "year", "season"])
        #expect(query.queryItems.first { $0.name == "sort" }?.value == "score")
    }

    @Test("mutations hit the right paths and unwrap empty bodies")
    func mutations() async throws {
        let transport = FakeTransport()
        // The Go handler answers 204 with no body.
        transport.stub("PATCH /api/v1/collection/501234/status", status: 204, json: "")
        transport.stub("POST /api/v1/progress", status: 204, json: "")
        transport.stub("PATCH /api/v1/notifications/ntf_1/read", json: #"{"status":"ok"}"#)
        transport.stub("GET /api/v1/notifications/unread-count", json: #"{"count":12}"#)
        let client = APIClient(baseURL: base, token: "mlml_t", transport: transport)

        try await client.setWatchStatus(bangumiID: 501234, .completed)
        try await client.saveProgress(ProgressSave(mediaFileID: "mf_1", episodeID: "ep_1", positionSeconds: 10, durationSeconds: 100, completed: false))
        try await client.markNotificationRead(id: "ntf_1")
        let unread = try await client.unreadNotificationCount()

        #expect(unread == 12)
        let statusBody = try JSONSerialization.jsonObject(with: try #require(transport.requests[0].httpBody)) as? [String: Any]
        #expect(statusBody?["status"] as? String == "completed")
        let progressBody = try JSONSerialization.jsonObject(with: try #require(transport.requests[1].httpBody)) as? [String: Any]
        #expect(progressBody?["media_file_id"] as? String == "mf_1")
        #expect(progressBody?["completed"] as? Bool == false)
    }
}
