import Foundation
import Libmpv
import os
import Synchronization

public enum MPVError: Error, Sendable, Equatable {
    case createFailed
    case status(code: Int32, message: String)
    case destroyed
}

/// One libmpv instance.
///
/// Thread-safety: every `mpv_*` call is thread-safe by libmpv's contract
/// (only creation and destruction need ordering, which `destroy()` does
/// on the event queue). The little mutable state this class keeps lives
/// behind a `Mutex`, so the `@unchecked Sendable` is honest.
public final class MPVPlayer: @unchecked Sendable {
    /// Properties observed on every instance; the index is the reply id.
    public static let observedProperties: [(name: String, format: mpv_format)] = [
        ("pause", MPV_FORMAT_FLAG),
        ("time-pos", MPV_FORMAT_DOUBLE),
        ("duration", MPV_FORMAT_DOUBLE),
        ("percent-pos", MPV_FORMAT_DOUBLE),
        ("demuxer-cache-duration", MPV_FORMAT_DOUBLE),
        ("paused-for-cache", MPV_FORMAT_FLAG),
        ("cache-buffering-state", MPV_FORMAT_INT64),
        ("core-idle", MPV_FORMAT_FLAG),
        ("idle-active", MPV_FORMAT_FLAG),
        ("eof-reached", MPV_FORMAT_FLAG),
        ("seeking", MPV_FORMAT_FLAG),
        ("speed", MPV_FORMAT_DOUBLE),
        ("volume", MPV_FORMAT_DOUBLE),
        ("mute", MPV_FORMAT_FLAG),
        ("track-list", MPV_FORMAT_NODE),
        ("chapter-list", MPV_FORMAT_NODE),
        ("chapter", MPV_FORMAT_INT64),
        ("vid", MPV_FORMAT_NODE),
        ("aid", MPV_FORMAT_NODE),
        ("sid", MPV_FORMAT_NODE),
        ("secondary-sid", MPV_FORMAT_NODE),
        ("sub-delay", MPV_FORMAT_DOUBLE),
        ("audio-delay", MPV_FORMAT_DOUBLE),
        ("sub-visibility", MPV_FORMAT_FLAG),
        ("dwidth", MPV_FORMAT_INT64),
        ("dheight", MPV_FORMAT_INT64),
        ("video-params/primaries", MPV_FORMAT_STRING),
        ("video-params/gamma", MPV_FORMAT_STRING),
        ("hwdec-current", MPV_FORMAT_STRING),
        ("video-codec", MPV_FORMAT_STRING),
        ("audio-codec-name", MPV_FORMAT_STRING),
        ("container-fps", MPV_FORMAT_DOUBLE),
        ("estimated-vf-fps", MPV_FORMAT_DOUBLE),
        ("media-title", MPV_FORMAT_STRING),
        ("ab-loop-a", MPV_FORMAT_NODE),
        ("ab-loop-b", MPV_FORMAT_NODE),
        ("video-bitrate", MPV_FORMAT_DOUBLE),
        ("audio-bitrate", MPV_FORMAT_DOUBLE),
    ]

    private struct State {
        var destroyed = false
    }

    private let nextCommandID = Atomic<UInt64>(1)
    /// Separate from `state`: the render thread registers this while other
    /// threads may be inside `withLiveHandle`, and render.h forbids the
    /// render thread waiting on a thread that is inside a libmpv call.
    private let renderTeardown = Mutex<(@Sendable () -> Void)?>(nil)

    nonisolated(unsafe) private let handle: OpaquePointer
    private let state = Mutex(State())
    private let eventQueue = DispatchQueue(label: "dev.milmil.mpv.events", qos: .userInteractive)
    private let wakeupPending = Atomic(false)
    private let logger = Logger(subsystem: "dev.milmil.macos", category: "mpv")

    public let events: AsyncStream<PlayerEvent>
    private let continuation: AsyncStream<PlayerEvent>.Continuation

    public init(options: MPVOptions) throws {
        guard let handle = mpv_create() else { throw MPVError.createFailed }
        self.handle = handle
        (events, continuation) = AsyncStream.makeStream(of: PlayerEvent.self, bufferingPolicy: .unbounded)

        for row in options.table {
            let status = mpv_set_option_string(handle, row.key, row.value)
            if status < 0 {
                // Unknown options are not fatal; log and carry on like mpv's CLI does.
                logger.warning("option \(row.key)=\(row.value) rejected: \(MPVPlayer.message(for: status))")
            }
        }
        try Self.check(mpv_initialize(handle))
        mpv_request_log_messages(handle, options.logLevel)
        for (index, property) in Self.observedProperties.enumerated() {
            mpv_observe_property(handle, UInt64(index), property.name, property.format)
        }
        mpv_set_wakeup_callback(handle, { context in
            guard let context else { return }
            Unmanaged<MPVPlayer>.fromOpaque(context).takeUnretainedValue().wakeup()
        }, Unmanaged.passUnretained(self).toOpaque())
    }

    deinit {
        destroy()
    }

    /// The raw handle, for the render layer only.
    var rawHandle: OpaquePointer { handle }

    // MARK: - Lifecycle

    /// Registered by the render layer so `destroy()` can free the render
    /// context *before* `mpv_terminate_destroy`, as libmpv requires.
    func setRenderTeardown(_ teardown: (@Sendable () -> Void)?) {
        renderTeardown.withLock { $0 = teardown }
    }

    public var isDestroyed: Bool { state.withLock { $0.destroyed } }

    /// Stop playback but keep the instance warm for the next file.
    public func stop() {
        try? command(["stop"])
    }

    /// Tear everything down. Safe to call more than once.
    public func destroy() {
        let first: Bool = state.withLock { state in
            guard !state.destroyed else { return false }
            state.destroyed = true
            return true
        }
        guard first else { return }
        mpv_set_wakeup_callback(handle, nil, nil)
        let teardown = renderTeardown.withLock { hook -> (@Sendable () -> Void)? in
            defer { hook = nil }
            return hook
        }
        teardown?()
        // Drain anything queued, then destroy on the queue that reads events.
        eventQueue.sync {
            mpv_terminate_destroy(handle)
        }
        continuation.finish()
    }

    // MARK: - Commands

    /// Runs `body` with the handle while holding the state lock, so
    /// `destroy()` cannot tear the core down under an in-flight call.
    /// Returns nil once destroyed.
    @discardableResult
    private func withLiveHandle<R>(_ body: (OpaquePointer) throws -> R) rethrows -> R? {
        try state.withLock { state -> R? in
            guard !state.destroyed else { return nil }
            return try body(handle)
        }
    }

    public func command(_ args: [String]) throws {
        let status: Int32? = try Self.withCStringArray(args) { argv in
            try withLiveHandle { handle in mpv_command(handle, argv) }
        }
        guard let status else { throw MPVError.destroyed }
        try Self.check(status)
    }

    /// Fire-and-forget; the reply arrives as `PlayerEvent.commandReply`.
    @discardableResult
    public func commandAsync(_ args: [String]) -> UInt64 {
        Self.withCStringArray(args) { argv in
            withLiveHandle { handle -> UInt64 in
                let id = nextCommandID.add(1, ordering: .relaxed).oldValue
                _ = mpv_command_async(handle, id, argv)
                return id
            } ?? 0
        }
    }

    /// `loadfile <url> replace -1 <options>`: the 4th argument is a
    /// comma-separated list, so callers must keep option *values* free of
    /// commas (titles go through the `force-media-title` property instead).
    /// Asynchronous: synchronous `mpv_command` can block for as long as the
    /// core is busy (slow network); failures arrive as `endFile(.error)`.
    public func loadFile(_ url: String, options: [String: String] = [:]) {
        var args = ["loadfile", url, "replace"]
        if !options.isEmpty {
            args.append("-1")
            args.append(options.map { "\($0.key)=\($0.value)" }.joined(separator: ","))
        }
        commandAsync(args)
    }

    public func seek(to seconds: Double, exact: Bool = true) {
        commandAsync(["seek", String(seconds), exact ? "absolute+exact" : "absolute"])
    }

    public func seek(by seconds: Double, exact: Bool = false) {
        commandAsync(["seek", String(seconds), exact ? "relative+exact" : "relative"])
    }

    public func frameStep(backward: Bool = false) {
        commandAsync([backward ? "frame-back-step" : "frame-step"])
    }

    public func addSubtitle(_ url: String, title: String? = nil, language: String? = nil, select: Bool = true) {
        var args = ["sub-add", url, select ? "select" : "auto"]
        if let title { args.append(title) }
        if let language { args.append(language) }
        commandAsync(args)
    }

    // MARK: - Properties

    public func set(_ name: String, _ value: Bool) {
        var flag: Int32 = value ? 1 : 0
        withLiveHandle { mpv_set_property($0, name, MPV_FORMAT_FLAG, &flag) }
    }

    public func set(_ name: String, _ value: Double) {
        var double = value
        withLiveHandle { mpv_set_property($0, name, MPV_FORMAT_DOUBLE, &double) }
    }

    public func set(_ name: String, _ value: Int64) {
        var int = value
        withLiveHandle { mpv_set_property($0, name, MPV_FORMAT_INT64, &int) }
    }

    public func set(_ name: String, _ value: String) {
        withLiveHandle { mpv_set_property_string($0, name, value) }
    }

    public func setOption(_ name: String, _ value: String) {
        withLiveHandle { mpv_set_option_string($0, name, value) }
    }

    public func getString(_ name: String) -> String? {
        withLiveHandle { handle -> String? in
            guard let cString = mpv_get_property_string(handle, name) else { return nil }
            defer { mpv_free(cString) }
            return String(cString: cString)
        } ?? nil
    }

    public func getDouble(_ name: String) -> Double? {
        var value: Double = 0
        guard withLiveHandle({ mpv_get_property($0, name, MPV_FORMAT_DOUBLE, &value) }) ?? -1 >= 0 else { return nil }
        return value
    }

    public func getInt(_ name: String) -> Int64? {
        var value: Int64 = 0
        guard withLiveHandle({ mpv_get_property($0, name, MPV_FORMAT_INT64, &value) }) ?? -1 >= 0 else { return nil }
        return value
    }

    public func getBool(_ name: String) -> Bool? {
        var value: Int32 = 0
        guard withLiveHandle({ mpv_get_property($0, name, MPV_FORMAT_FLAG, &value) }) ?? -1 >= 0 else { return nil }
        return value != 0
    }

    public func getNode(_ name: String) -> MPVNode? {
        withLiveHandle { handle -> MPVNode? in
            var node = mpv_node()
            guard mpv_get_property(handle, name, MPV_FORMAT_NODE, &node) >= 0 else { return nil }
            defer { mpv_free_node_contents(&node) }
            return MPVNode(node)
        } ?? nil
    }

    // MARK: - Event loop

    private func wakeup() {
        // Coalesce bursts: one drain per wakeup storm.
        let (exchanged, _) = wakeupPending.compareExchange(expected: false, desired: true, ordering: .acquiringAndReleasing)
        guard exchanged else { return }
        // Weak: a wakeup racing `deinit` must not resurrect the player.
        eventQueue.async { [weak self] in
            guard let self else { return }
            wakeupPending.store(false, ordering: .releasing)
            drainEvents()
        }
    }

    private func drainEvents() {
        while !isDestroyed {
            guard let event = mpv_wait_event(handle, 0) else { return }
            if event.pointee.event_id == MPV_EVENT_NONE { return }
            if let translated = translate(event.pointee) {
                continuation.yield(translated)
            }
            if event.pointee.event_id == MPV_EVENT_SHUTDOWN { return }
        }
    }

    private func translate(_ event: mpv_event) -> PlayerEvent? {
        switch event.event_id {
        case MPV_EVENT_START_FILE: return .startFile
        case MPV_EVENT_FILE_LOADED: return .fileLoaded
        case MPV_EVENT_SEEK: return .seek
        case MPV_EVENT_PLAYBACK_RESTART: return .playbackRestart
        case MPV_EVENT_VIDEO_RECONFIG: return .videoReconfig
        case MPV_EVENT_QUEUE_OVERFLOW:
            logger.error("mpv event queue overflow — events were dropped")
            return .queueOverflow
        case MPV_EVENT_SHUTDOWN: return .shutdown
        case MPV_EVENT_COMMAND_REPLY:
            return .commandReply(id: event.reply_userdata, error: event.error)
        case MPV_EVENT_END_FILE:
            guard let data = event.data?.assumingMemoryBound(to: mpv_event_end_file.self) else { return .endFile(.unknown(-1)) }
            return .endFile(Self.reason(from: data.pointee))
        case MPV_EVENT_LOG_MESSAGE:
            guard let data = event.data?.assumingMemoryBound(to: mpv_event_log_message.self) else { return nil }
            let message = data.pointee
            let text = String(cString: message.text).trimmingCharacters(in: .newlines)
            let prefix = String(cString: message.prefix)
            let level = String(cString: message.level)
            switch message.log_level {
            case MPV_LOG_LEVEL_FATAL, MPV_LOG_LEVEL_ERROR: logger.error("[\(prefix)] \(text)")
            case MPV_LOG_LEVEL_WARN: logger.warning("[\(prefix)] \(text)")
            default: logger.debug("[\(prefix)] \(text)")
            }
            return .log(prefix: prefix, level: level, text: text)
        case MPV_EVENT_PROPERTY_CHANGE:
            guard let data = event.data?.assumingMemoryBound(to: mpv_event_property.self) else { return nil }
            let property = data.pointee
            let name = String(cString: property.name)
            return .propertyChange(name: name, value: Self.value(from: property))
        default:
            return nil
        }
    }

    private static func value(from property: mpv_event_property) -> MPVValue? {
        guard let data = property.data else { return nil }
        switch property.format {
        case MPV_FORMAT_FLAG:
            return .flag(data.load(as: Int32.self) != 0)
        case MPV_FORMAT_INT64:
            return .int(data.load(as: Int64.self))
        case MPV_FORMAT_DOUBLE:
            return .double(data.load(as: Double.self))
        case MPV_FORMAT_STRING, MPV_FORMAT_OSD_STRING:
            guard let cString = data.load(as: UnsafeMutablePointer<CChar>?.self) else { return nil }
            return .string(String(cString: cString))
        case MPV_FORMAT_NODE:
            return .node(MPVNode(data.load(as: mpv_node.self)))
        default:
            return nil
        }
    }

    private static func reason(from data: mpv_event_end_file) -> EndFileReason {
        switch data.reason {
        case MPV_END_FILE_REASON_EOF: .eof
        case MPV_END_FILE_REASON_STOP: .stop
        case MPV_END_FILE_REASON_QUIT: .quit
        case MPV_END_FILE_REASON_ERROR: .error(code: data.error, message: message(for: data.error))
        case MPV_END_FILE_REASON_REDIRECT: .redirect
        default: .unknown(Int32(data.reason.rawValue))
        }
    }

    // MARK: - Helpers

    static func message(for status: Int32) -> String {
        String(cString: mpv_error_string(status))
    }

    static func check(_ status: Int32) throws {
        if status < 0 { throw MPVError.status(code: status, message: message(for: status)) }
    }

    private static func withCStringArray<R>(_ strings: [String], _ body: (UnsafeMutablePointer<UnsafePointer<CChar>?>) throws -> R) rethrows -> R {
        var pointers: [UnsafePointer<CChar>?] = strings.map { UnsafePointer(strdup($0)) }
        pointers.append(nil)
        defer { pointers.forEach { free(UnsafeMutablePointer(mutating: $0)) } }
        return try pointers.withUnsafeMutableBufferPointer { buffer in
            try body(buffer.baseAddress!)
        }
    }
}
