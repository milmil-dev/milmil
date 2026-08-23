import Foundation

/// Options applied before `mpv_initialize`. Kept as a plain value so the
/// mapping to mpv's string table is unit-testable.
public struct MPVOptions: Sendable, Equatable {
    public enum HardwareDecoding: String, Sendable {
        case videotoolbox
        case autoSafe = "auto-safe"
        case no
    }

    public var hardwareDecoding: HardwareDecoding = .videotoolbox
    public var userAgent = "milmil-macos"
    /// `Authorization: Bearer …` and friends, sent on every HTTP request.
    public var httpHeaders: [String: String] = [:]
    public var subtitleLanguages: [String] = ["zh-TW", "zh-Hant", "zh", "en"]
    public var audioLanguages: [String] = ["ja", "jpn"]
    /// mpv log level forwarded to `PlayerEvent.log` (`"warn"`, `"v"`, …).
    public var logLevel = "warn"
    /// Demuxer read-ahead in bytes; large so seeks over HTTP stay inside cache.
    public var demuxerMaxBytes = 256 * 1024 * 1024
    public var demuxerMaxBackBytes = 64 * 1024 * 1024
    public var volume: Double = 100
    public var initialPause = false
    public var screenshotDirectory: String?
    public var extra: [String: String] = [:]

    public init() {}

    /// The exact `mpv_set_option_string` table, in a stable order.
    public var table: [(key: String, value: String)] {
        var rows: [(String, String)] = [
            ("vo", "libmpv"),
            ("hwdec", hardwareDecoding.rawValue),
            ("keep-open", "yes"),
            ("idle", "yes"),
            ("input-default-bindings", "no"),
            ("input-vo-keyboard", "no"),
            ("osc", "no"),
            ("osd-level", "0"),
            ("cache", "yes"),
            ("demuxer-max-bytes", String(demuxerMaxBytes)),
            ("demuxer-max-back-bytes", String(demuxerMaxBackBytes)),
            ("sub-auto", "fuzzy"),
            ("audio-channels", "auto-safe"),
            ("audio-pitch-correction", "yes"),
            ("user-agent", userAgent),
            ("volume", String(Int(volume))),
            ("pause", initialPause ? "yes" : "no"),
            ("ytdl", "no"),
            ("terminal", "no"),
            ("msg-level", "all=no"),
            ("screenshot-format", "png"),
            ("screenshot-template", "milmil-%F-%p"),
        ]
        if !subtitleLanguages.isEmpty { rows.append(("slang", subtitleLanguages.joined(separator: ","))) }
        if !audioLanguages.isEmpty { rows.append(("alang", audioLanguages.joined(separator: ","))) }
        if !httpHeaders.isEmpty {
            let fields = httpHeaders.keys.sorted().map { "\($0): \(httpHeaders[$0] ?? "")" }
            rows.append(("http-header-fields", fields.joined(separator: ",")))
        }
        if let screenshotDirectory { rows.append(("screenshot-directory", screenshotDirectory)) }
        for key in extra.keys.sorted() { rows.append((key, extra[key] ?? "")) }
        return rows.map { (key: $0.0, value: $0.1) }
    }
}
