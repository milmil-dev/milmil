import MilmilAPI
import OpenCC

/// OpenCC converters are expensive to build (dictionary load), so keep one
/// per direction for the app's lifetime.
enum DanmakuConverter {
    nonisolated(unsafe) private static var cache: [ChineseConvert: ChineseConverter] = [:]

    /// A `@Sendable` closure the pipeline can call from any context. OpenCC's
    /// converter is immutable after init and `convert` is re-entrant.
    static func closure(for mode: ChineseConvert) -> (@Sendable (String) -> String)? {
        guard mode != .none, let converter = converter(for: mode) else { return nil }
        nonisolated(unsafe) let shared = converter
        return { @Sendable text in shared.convert(text) }
    }

    private static func converter(for mode: ChineseConvert) -> ChineseConverter? {
        if let cached = cache[mode] { return cached }
        let options: ChineseConverter.Options = switch mode {
        case .s2t: [.traditionalize, .twStandard, .twIdiom] // web: cn → twp
        case .t2s: [.simplify, .twStandard, .twIdiom] // web: twp → cn
        case .none: []
        }
        guard let converter = try? ChineseConverter(options: options) else { return nil }
        cache[mode] = converter
        return converter
    }
}
