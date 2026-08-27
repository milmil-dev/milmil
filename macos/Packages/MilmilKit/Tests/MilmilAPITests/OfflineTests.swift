import Foundation
@testable import MilmilAPI
import Testing

struct OfflineTests {
    @Test func decodesManifest() throws {
        let json = """
        {"bangumi_id":530725,"title":"Bleach","episodes":[
          {"episode_id":"ep-41","number":41,"title":"雷神",
           "file":{"id":"mf-1","url":"http://s/api/v1/stream/mf-1/direct","size_bytes":794700000,"etag":"abc","container":"mp4","width":1920,"height":1080,"video_codec":"h264"},
           "subtitles":[{"index":0,"language":"zh","title":"CHT","url":"http://s/api/v1/subtitles/1/content"}],
           "danmaku_url":"http://s/api/v1/danmaku/mf-1"},
          {"episode_id":"ep-42","number":42.5,"file":{"id":"mf-2","url":"http://s/f2","container":"mkv"}}
        ]}
        """
        let manifest = try MilmilJSON.makeDecoder().decode(OfflineManifest.self, from: Data(json.utf8))
        #expect(manifest.bangumiID == 530725)
        #expect(manifest.episodes.count == 2)
        let first = manifest.episodes[0]
        #expect(first.file.sizeBytes == 794_700_000)
        #expect(first.file.container == "mp4")
        #expect(first.subtitles.count == 1)
        #expect(first.subtitles[0].language == "zh")
        #expect(first.danmakuURL?.host() == "s")
        let second = manifest.episodes[1]
        #expect(second.number == 42.5)
        #expect(second.title == nil)
        #expect(second.subtitles.isEmpty)
        #expect(second.danmakuURL == nil)
        #expect(second.file.sizeBytes == 0)
    }
}
