import Foundation

/// Property values as they arrive from `mpv_observe_property`.
public enum MPVValue: Sendable, Equatable {
    case flag(Bool)
    case int(Int64)
    case double(Double)
    case string(String)
    case node(MPVNode)

    public var boolValue: Bool? {
        switch self {
        case let .flag(value): value
        case let .int(value): value != 0
        case let .node(node): node.boolValue
        default: nil
        }
    }

    public var doubleValue: Double? {
        switch self {
        case let .double(value): value
        case let .int(value): Double(value)
        case let .node(node): node.doubleValue
        default: nil
        }
    }

    public var intValue: Int64? {
        switch self {
        case let .int(value): value
        case let .double(value): Int64(value)
        case let .node(node): node.intValue
        default: nil
        }
    }

    public var stringValue: String? {
        switch self {
        case let .string(value): value
        case let .node(node): node.stringValue
        default: nil
        }
    }

    public var nodeValue: MPVNode? {
        if case let .node(node) = self { return node }
        return nil
    }
}

/// Why playback of the current file ended (`mpv_end_file_reason`).
public enum EndFileReason: Sendable, Equatable {
    case eof
    case stop
    case quit
    case error(code: Int32, message: String)
    case redirect
    case unknown(Int32)
}

/// Flattened `mpv_event`s. The engine yields these on a dedicated queue;
/// the app folds them into `PlayerState` on the main actor.
public enum PlayerEvent: Sendable, Equatable {
    case startFile
    case fileLoaded
    case endFile(EndFileReason)
    case seek
    case playbackRestart
    case videoReconfig
    case propertyChange(name: String, value: MPVValue?)
    case log(prefix: String, level: String, text: String)
    case commandReply(id: UInt64, error: Int32)
    case queueOverflow
    case shutdown
}
