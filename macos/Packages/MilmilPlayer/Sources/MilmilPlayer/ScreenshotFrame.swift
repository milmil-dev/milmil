import Foundation
import Libmpv

/// One decoded frame handed back by `screenshot-raw`, still in mpv's packed
/// layout. Callers turn it into an image themselves — MPVKit's FFmpeg ships
/// no still-image encoder (no png/mjpeg/bmp/tiff), so mpv's own
/// `screenshot-to-file` can never write a file in this app.
public struct ScreenshotFrame: Sendable, Equatable {
    public let width: Int
    public let height: Int
    /// Bytes per row; not necessarily `width * 4`.
    public let stride: Int
    /// mpv's pixel layout, e.g. `bgr0`, `bgra`, `rgba`.
    public let format: String
    public let data: Data

    public init(width: Int, height: Int, stride: Int, format: String, data: Data) {
        self.width = width
        self.height = height
        self.stride = stride
        self.format = format
        self.data = data
    }
}

extension MPVPlayer {
    /// `screenshot-raw`: the current frame as pixels, without going through
    /// libavcodec. `includeSubtitles` picks mpv's `subtitles` window over the
    /// clean `video` one.
    public func screenshotRaw(includeSubtitles: Bool) throws -> ScreenshotFrame {
        let node = try commandNode(["screenshot-raw", includeSubtitles ? "subtitles" : "video"])
        guard let width = node["w"]?.intValue,
              let height = node["h"]?.intValue,
              let stride = node["stride"]?.intValue,
              let format = node["format"]?.stringValue,
              case let .bytes(data)? = node["data"],
              width > 0, height > 0, stride > 0
        else {
            throw MPVError.status(code: MPV_ERROR_INVALID_PARAMETER.rawValue, message: "screenshot-raw returned no frame")
        }
        return ScreenshotFrame(
            width: Int(width),
            height: Int(height),
            stride: Int(stride),
            format: format,
            data: data
        )
    }
}
