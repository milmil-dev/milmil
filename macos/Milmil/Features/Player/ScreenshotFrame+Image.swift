import CoreGraphics
import Foundation
import MilmilPlayer

/// The app target is `MainActor` by default; this is pure pixel work and
/// runs on the capture task, so it stays nonisolated.
nonisolated extension ScreenshotFrame {
    /// mpv hands back packed 32-bit pixels; map its layout onto CoreGraphics'.
    private var bitmapInfo: CGBitmapInfo? {
        switch format {
        case "bgr0":
            CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)
        case "bgra":
            CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)
        case "rgba":
            CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue)
        default:
            nil
        }
    }

    func cgImage() -> CGImage? {
        guard let bitmapInfo, data.count >= stride * height,
              let provider = CGDataProvider(data: data as CFData)
        else { return nil }
        return CGImage(
            width: width,
            height: height,
            bitsPerComponent: 8,
            bitsPerPixel: 32,
            bytesPerRow: stride,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: bitmapInfo,
            provider: provider,
            decode: nil,
            shouldInterpolate: false,
            intent: .defaultIntent
        )
    }
}
