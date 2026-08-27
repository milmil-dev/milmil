import Foundation

/// Stale-while-revalidate copies of page responses on disk, one directory per
/// server profile, so a revisited page paints from the last answer at once
/// while the network refreshes it. Bodies are stored verbatim and decoded
/// with the API client's own decoder, which keeps the models decode-only.
actor PageCache {
    static let shared = PageCache()

    private let root: URL
    private let maxAge: TimeInterval

    init(root: URL? = nil, maxAge: TimeInterval = 30 * 24 * 3600) {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first ?? FileManager.default.temporaryDirectory
        self.root = root ?? caches.appending(path: Bundle.main.bundleIdentifier ?? "dev.milmil.macos").appending(path: "pages")
        self.maxAge = maxAge
    }

    /// The cached body for `key` under `scope`, unless it is older than `maxAge`.
    func read(_ key: String, scope: String) -> Data? {
        let url = fileURL(key, scope: scope)
        guard let attributes = try? FileManager.default.attributesOfItem(atPath: url.path),
              let modified = attributes[.modificationDate] as? Date,
              Date().timeIntervalSince(modified) < maxAge else { return nil }
        return try? Data(contentsOf: url)
    }

    func write(_ data: Data, key: String, scope: String) {
        let url = fileURL(key, scope: scope)
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: url, options: .atomic)
    }

    func remove(_ key: String, scope: String) {
        try? FileManager.default.removeItem(at: fileURL(key, scope: scope))
    }

    private func fileURL(_ key: String, scope: String) -> URL {
        root.appending(path: scope).appending(path: key + ".json")
    }
}
