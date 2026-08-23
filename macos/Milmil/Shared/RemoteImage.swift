import ImageIO
import SwiftUI
import UniformTypeIdentifiers

/// Small image cache for CDN posters: de-duplicates in-flight loads, decodes
/// off the main actor with ImageIO (no NSImage), and downsamples to the size
/// the view needs. Nuke replaces this in Phase 1 if profiling asks for it.
actor ImageCache {
    static let shared = ImageCache()

    private let session: URLSession
    private var images: [Key: CGImage] = [:]
    private var inflight: [Key: Task<CGImage?, Never>] = [:]

    private struct Key: Hashable {
        let url: URL
        let maxPixel: Int
    }

    init() {
        let config = URLSessionConfiguration.default
        config.requestCachePolicy = .returnCacheDataElseLoad
        // An explicit directory: a relative `diskPath` lands in the process's
        // working directory (the repo root when launched from a terminal).
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first ?? FileManager.default.temporaryDirectory
        let directory = caches.appending(path: Bundle.main.bundleIdentifier ?? "dev.milmil.macos").appending(path: "images")
        config.urlCache = URLCache(memoryCapacity: 64 << 20, diskCapacity: 512 << 20, directory: directory)
        config.httpAdditionalHeaders = ["Accept": "image/*"]
        session = URLSession(configuration: config)
    }

    func image(for url: URL, maxPixel: Int) async -> CGImage? {
        let key = Key(url: url, maxPixel: maxPixel)
        if let cached = images[key] { return cached }
        if let task = inflight[key] { return await task.value }

        let task = Task<CGImage?, Never> { [session] in
            guard let (data, response) = try? await session.data(from: url),
                  (response as? HTTPURLResponse).map({ 200..<300 ~= $0.statusCode }) ?? true else { return nil }
            return Self.decode(data, maxPixel: maxPixel)
        }
        inflight[key] = task
        let image = await task.value
        inflight[key] = nil
        if let image { images[key] = image }
        return image
    }

    nonisolated private static func decode(_ data: Data, maxPixel: Int) -> CGImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixel,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
        ]
        return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
    }
}

/// Fills its frame with a remote image, showing `placeholder` until (or if
/// never) it arrives. Decorative by default — pass `label` for content images.
struct RemoteImage<Placeholder: View>: View {
    let url: URL?
    var maxPixel: Int = 600
    var label: String?
    @ViewBuilder var placeholder: () -> Placeholder

    @State private var image: CGImage?

    var body: some View {
        ZStack {
            placeholder()
            if let image {
                swiftUIImage(image)
                    .resizable()
                    .scaledToFill()
                    .transition(.opacity.animation(.easeOut(duration: 0.25)))
            }
        }
        .clipped()
        .task(id: url) {
            guard let url else {
                image = nil
                return
            }
            image = await ImageCache.shared.image(for: url, maxPixel: maxPixel)
        }
    }

    private func swiftUIImage(_ cgImage: CGImage) -> Image {
        if let label {
            Image(cgImage, scale: 1, label: Text(label))
        } else {
            Image(decorative: cgImage, scale: 1)
        }
    }
}
