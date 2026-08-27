import Foundation
@testable import MilmilAPI
import Testing

struct NotificationPayloadTests {
    private func decode(_ json: String) throws -> MilmilNotification {
        try MilmilJSON.makeDecoder().decode(MilmilNotification.self, from: Data(json.utf8))
    }

    @Test func readsAnimeFieldsFromMetadata() throws {
        let metadata = [
            #"\"bangumi_id\": 530725, \"anime_name\": \"Bleach\", \"episode\": \"05\", \"episode_id\": \"ep-1\","#,
            #"\"media_file_id\": \"mf-1\", \"cover_image\": \"https://img.example/c.jpg\""#,
        ].joined(separator: " ")
        let item = try decode(
            #"{"id":"n1","type":"anime.episode_ready","title":"t","message":"m","severity":"success","read":0,"metadata":"{\#(metadata)}"}"#
        )
        #expect(item.category == .anime)
        #expect(item.bangumiID == 530725)
        #expect(item.animeName == "Bleach")
        #expect(item.episodeLabel == "5")
        #expect(item.episodeID == "ep-1")
        #expect(item.mediaFileID == "mf-1")
        #expect(item.coverImage?.host() == "img.example")
    }

    @Test func numericEpisodeAndNullStringMetadata() throws {
        let nullString = #"{"String":"{\"bangumi_id\":\"12\",\"episode_number\":7}","Valid":true}"#
        let item = try decode(
            #"{"id":"n2","type":"anime.airing","title":"t","message":"m","severity":"info","read":1,"metadata":\#(nullString)}"#
        )
        #expect(item.bangumiID == 12)
        #expect(item.episodeLabel == "7")
        #expect(item.category == .anime)
    }

    @Test func missingMetadataYieldsNothing() throws {
        let item = try decode(#"{"id":"n3","type":"system.error","title":"t","message":"m","severity":"error","read":0}"#)
        #expect(item.payload.isEmpty)
        #expect(item.bangumiID == nil)
        #expect(item.episodeLabel == nil)
        #expect(item.category == .system)
    }
}
