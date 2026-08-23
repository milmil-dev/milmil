import Foundation
import Testing
@testable import MilmilAPI

@Suite("Preferences")
struct PreferencesTests {
    @Test("a partial server payload fills defaults and keeps unknown keys")
    func partialDecode() async throws {
        let transport = FakeTransport()
        transport.stub("GET /api/v1/user/preferences", json: #"""
        {"data":{"danmakuOpacity":0.85,"danmakuDensity":"high","danmakuBlockKeywords":["劇透"],
                 "subtitleStyle":{"fontSize":28},"keyboardBindings":[{"action":"toggleDanmaku","key":"d","modifiers":["shift"]}],
                 "defaultSubtitleLanguage":"zh-Hant","webOnlyThing":{"nested":[1,2,3]}}}
        """#)
        transport.stub("PUT /api/v1/user/preferences", status: 204, json: "")
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:18080")!, token: "mlml_t", transport: transport)

        var prefs = try await client.globalPreferences()

        #expect(prefs.danmakuOpacity == 0.85 && prefs.danmakuDensity == .high)
        #expect(prefs.danmakuFontSize == 20 && prefs.danmakuSpeed == 144 && prefs.autoNext)
        #expect(prefs.subtitleStyle.fontSize == 28 && prefs.subtitleStyle.fontFamily == "Noto Sans CJK")
        #expect(prefs.keyboardBindings.first?.modifiers == ["shift"])
        #expect(prefs.defaultSubtitleLanguage == "zh-Hant" && prefs.defaultAudioLanguage == nil)
        #expect(prefs.extra["webOnlyThing"] != nil)

        prefs.danmakuEnabled = false
        try await client.saveGlobalPreferences(prefs)

        let body = try JSONSerialization.jsonObject(with: try #require(transport.requests.last?.httpBody)) as? [String: Any]
        let data = try #require(body?["data"] as? [String: Any])
        #expect(data["danmakuEnabled"] as? Bool == false)
        #expect(data["danmakuDensity"] as? String == "high")
        #expect((data["webOnlyThing"] as? [String: Any])?["nested"] as? [Double] == [1, 2, 3])
        #expect(data.keys.contains("bufferMode"))
    }

    @Test("defaults match the web store")
    func defaults() {
        let prefs = GlobalPreferences()
        #expect(prefs.danmakuStroke == .shadow && prefs.danmakuArea == 1 && prefs.danmakuChineseConvert == .none)
        #expect(prefs.bufferMode == .auto && prefs.gestureSensitivity == 50 && prefs.subtitlePreset == "default")
        #expect(prefs.subtitleStyle.shadowType == "outline" && prefs.subtitleStyle.respectAssStyle)
    }
}
