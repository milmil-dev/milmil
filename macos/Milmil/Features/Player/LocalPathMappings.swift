import Foundation
import Observation

/// Server path prefix → local mount (e.g. `/media` → `/Volumes/NAS/anime`).
/// When a playable file resolves to an existing local file, mpv opens it
/// directly: no server I/O, instant seeks.
struct LocalPathMapping: Codable, Hashable, Identifiable {
    var id = UUID()
    var serverPrefix: String
    var localPrefix: String
}

@Observable
final class LocalPathMappings {
    static let shared = LocalPathMappings()
    private static let key = "player.localPathMappings"

    private(set) var mappings: [LocalPathMapping] {
        didSet { persist() }
    }

    init(defaults: UserDefaults = .standard) {
        if let data = defaults.data(forKey: Self.key), let decoded = try? JSONDecoder().decode([LocalPathMapping].self, from: data) {
            mappings = decoded
        } else {
            mappings = []
        }
    }

    func add(serverPrefix: String, localPrefix: String) {
        mappings.append(LocalPathMapping(serverPrefix: Self.normalize(serverPrefix), localPrefix: Self.normalize(localPrefix)))
    }

    func update(_ mapping: LocalPathMapping) {
        guard let index = mappings.firstIndex(where: { $0.id == mapping.id }) else { return }
        mappings[index] = LocalPathMapping(id: mapping.id, serverPrefix: Self.normalize(mapping.serverPrefix), localPrefix: Self.normalize(mapping.localPrefix))
    }

    func remove(_ mapping: LocalPathMapping) {
        mappings.removeAll { $0.id == mapping.id }
    }

    /// The local file for a server path, only if it exists right now.
    func localURL(forServerPath path: String) -> URL? {
        guard !path.isEmpty else { return nil }
        // Longest prefix wins so `/media/anime` beats `/media`.
        for mapping in mappings.sorted(by: { $0.serverPrefix.count > $1.serverPrefix.count }) {
            guard !mapping.serverPrefix.isEmpty, path.hasPrefix(mapping.serverPrefix) else { continue }
            let remainder = path.dropFirst(mapping.serverPrefix.count)
            guard remainder.isEmpty || remainder.hasPrefix("/") else { continue }
            let local = mapping.localPrefix + remainder
            if FileManager.default.isReadableFile(atPath: local) {
                return URL(fileURLWithPath: local)
            }
        }
        return nil
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(mappings) {
            UserDefaults.standard.set(data, forKey: Self.key)
        }
    }

    static func normalize(_ path: String) -> String {
        var trimmed = path.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasPrefix("~") { trimmed = NSString(string: trimmed).expandingTildeInPath }
        while trimmed.count > 1, trimmed.hasSuffix("/") { trimmed.removeLast() }
        return trimmed
    }
}
