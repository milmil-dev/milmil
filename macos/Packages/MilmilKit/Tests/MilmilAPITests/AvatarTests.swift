import Foundation
@testable import MilmilAPI
import Testing

struct AvatarTests {
    private let client = APIClient(baseURL: URL(string: "http://server.local:18080")!)

    @Test func userDecodesWithAndWithoutAvatar() throws {
        let decoder = MilmilJSON.makeDecoder()
        let with = try decoder.decode(User.self, from: Data(#"{"id":"u1","username":"dev","avatar_url":"/api/v1/users/u1/avatar?v=7"}"#.utf8))
        #expect(with.avatarURL == "/api/v1/users/u1/avatar?v=7")
        let without = try decoder.decode(User.self, from: Data(#"{"id":"u1","username":"dev"}"#.utf8))
        #expect(without.avatarURL == nil)
        let blank = try decoder.decode(User.self, from: Data(#"{"id":"u1","username":"dev","avatar_url":""}"#.utf8))
        #expect(blank.avatarURL == nil)
    }

    @Test func avatarURLResolvesAgainstServerAndPicksSize() {
        let small = client.avatarURL("/api/v1/users/u1/avatar?v=7", size: 128)
        #expect(small?.absoluteString == "http://server.local:18080/api/v1/users/u1/avatar?v=7&size=128")
        let plain = client.avatarURL("/api/v1/users/u1/avatar?v=7")
        #expect(plain?.absoluteString == "http://server.local:18080/api/v1/users/u1/avatar?v=7")
        #expect(client.avatarURL(nil) == nil)
        #expect(client.avatarURL("") == nil)
    }

    @Test func multipartBodyFramesOneFile() {
        let body = APIClient.multipartBody(fileField: "file", data: Data("PNG!".utf8), filename: "a.png", mimeType: "image/png", boundary: "B")
        let text = String(bytes: body, encoding: .utf8)
        #expect(text == "--B\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.png\"\r\nContent-Type: image/png\r\n\r\nPNG!\r\n--B--\r\n")
    }
}
