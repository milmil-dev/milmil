import Foundation
import Libmpv

/// A Swift copy of an `mpv_node` tree (track-list, chapter-list, …).
/// Built eagerly so the C memory can be released right after the event.
public indirect enum MPVNode: Sendable, Equatable {
    case none
    case string(String)
    case flag(Bool)
    case int(Int64)
    case double(Double)
    case array([MPVNode])
    case map([String: MPVNode])
    case bytes(Data)

    init(_ node: mpv_node) {
        switch node.format {
        case MPV_FORMAT_STRING, MPV_FORMAT_OSD_STRING:
            self = node.u.string.map { .string(String(cString: $0)) } ?? .none
        case MPV_FORMAT_FLAG:
            self = .flag(node.u.flag != 0)
        case MPV_FORMAT_INT64:
            self = .int(node.u.int64)
        case MPV_FORMAT_DOUBLE:
            self = .double(node.u.double_)
        case MPV_FORMAT_NODE_ARRAY:
            guard let list = node.u.list else { self = .array([]); return }
            let count = Int(list.pointee.num)
            var items: [MPVNode] = []
            items.reserveCapacity(count)
            for index in 0..<count {
                items.append(MPVNode(list.pointee.values[index]))
            }
            self = .array(items)
        case MPV_FORMAT_NODE_MAP:
            guard let list = node.u.list else { self = .map([:]); return }
            let count = Int(list.pointee.num)
            var map: [String: MPVNode] = [:]
            for index in 0..<count {
                guard let key = list.pointee.keys[index] else { continue }
                map[String(cString: key)] = MPVNode(list.pointee.values[index])
            }
            self = .map(map)
        case MPV_FORMAT_BYTE_ARRAY:
            guard let bytes = node.u.ba, let data = bytes.pointee.data else { self = .bytes(Data()); return }
            self = .bytes(Data(bytes: data, count: bytes.pointee.size))
        default:
            self = .none
        }
    }

    // MARK: Accessors

    public subscript(key: String) -> MPVNode? {
        if case let .map(map) = self { return map[key] }
        return nil
    }

    public var stringValue: String? {
        if case let .string(value) = self { return value }
        return nil
    }

    public var boolValue: Bool? {
        switch self {
        case let .flag(value): value
        case let .int(value): value != 0
        default: nil
        }
    }

    public var intValue: Int64? {
        switch self {
        case let .int(value): value
        case let .double(value): Int64(value)
        default: nil
        }
    }

    public var doubleValue: Double? {
        switch self {
        case let .double(value): value
        case let .int(value): Double(value)
        default: nil
        }
    }

    public var arrayValue: [MPVNode]? {
        if case let .array(items) = self { return items }
        return nil
    }
}
