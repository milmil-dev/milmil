import Foundation
import MilmilAPI
import MilmilDanmaku

/// The two danmaku calls a player makes.
///
/// Its own target on purpose: `MilmilDanmaku` is deliberately free of any
/// `MilmilAPI` dependency so its parsers and lane allocation can be tested
/// anywhere, and `MilmilAPI` has no business knowing what a comment is. This
/// is the seam where the two meet, and it exists so the macOS and iOS players
/// call one implementation rather than each carrying a copy of the path.
extension APIClient {
    /// `GET /danmaku/{fileId}` — the DandanPlay track for a media file.
    public func danmaku(fileID: String) async throws -> DandanPlayResponse {
        try await get("/api/v1/danmaku/\(fileID)")
    }

    /// `POST /danmaku/{fileId}` — send one of your own.
    public func postDanmaku(fileID: String, time: Double, mode: Int, color: Int, comment: String) async throws {
        struct Body: Encodable {
            let time: Double
            let mode: Int
            let color: Int
            let comment: String
        }
        try await post("/api/v1/danmaku/\(fileID)", body: Body(time: time, mode: mode, color: color, comment: comment))
    }
}
