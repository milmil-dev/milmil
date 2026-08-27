import Foundation
import MilmilAPI
import Synchronization

/// Replays canned responses keyed by `"METHOD /path"` and records every
/// request so tests can assert on headers and bodies.
final class FakeTransport: HTTPTransport {
    struct Stub: Sendable {
        var status: Int
        var body: Data
        var headers: [String: String] = [:]
    }

    private let stubs: Mutex<[String: Stub]>
    private let recorded = Mutex<[URLRequest]>([])

    init(_ stubs: [String: Stub] = [:]) {
        self.stubs = Mutex(stubs)
    }

    var requests: [URLRequest] { recorded.withLock { $0 } }

    func stub(_ key: String, status: Int = 200, json: String, headers: [String: String] = [:]) {
        stubs.withLock { $0[key] = Stub(status: status, body: Data(json.utf8), headers: headers) }
    }

    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        recorded.withLock { $0.append(request) }
        let key = "\(request.httpMethod ?? "GET") \(request.url?.path() ?? "")"
        guard let stub = stubs.withLock({ $0[key] }) else {
            throw APIError.transport("no stub for \(key)")
        }
        let response = HTTPURLResponse(url: request.url!, statusCode: stub.status, httpVersion: "HTTP/1.1", headerFields: stub.headers)!
        return (stub.body, response)
    }
}

enum Fixtures {
    static func data(_ name: String) throws -> Data {
        guard let url = Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures") else {
            throw NSError(domain: "Fixtures", code: 404, userInfo: [NSLocalizedDescriptionKey: "missing fixture \(name).json"])
        }
        return try Data(contentsOf: url)
    }

    static func string(_ name: String) throws -> String {
        guard let text = String(bytes: try data(name), encoding: .utf8) else {
            throw NSError(domain: "Fixtures", code: 400, userInfo: [NSLocalizedDescriptionKey: "fixture \(name).json is not UTF-8"])
        }
        return text
    }
}
