import Foundation
import MilmilAPI

/// Keeps a WebSocket to `/ws` alive and exposes its frames as an
/// `AsyncStream<ServerEvent>`.
///
/// Handshake: `GET /api/v1/ws/ticket` (bearer) → `ws(s)://host/ws?ticket=…`.
/// Tickets are single-use and live 60 s, so a fresh one is fetched before
/// every (re)connect. Servers older than 0.1.17 have no ticket endpoint and
/// accept the bare upgrade; a 404 on the ticket call falls back to that.
public actor RealtimeClient {
    public typealias TicketProvider = @Sendable () async throws -> String?

    private let baseURL: URL
    private let session: URLSession
    private let ticketProvider: TicketProvider
    private var loop: Task<Void, Never>?
    private var continuation: AsyncStream<ServerEvent>.Continuation?

    /// Backoff schedule in seconds; repeats the last value.
    public static let backoff: [Double] = [1, 2, 4, 8, 15, 30]

    public init(baseURL: URL, session: URLSession = .milmil, ticketProvider: @escaping TicketProvider) {
        self.baseURL = ServerProfile.normalize(baseURL)
        self.session = session
        self.ticketProvider = ticketProvider
    }

    /// Convenience: fetch tickets through an `APIClient`, treating 404 as
    /// "old server, connect without a ticket".
    public init(baseURL: URL, client: APIClient, session: URLSession = .milmil) {
        self.init(baseURL: baseURL, session: session) {
            do {
                return try await client.webSocketTicket().ticket
            } catch APIError.http(status: 404, _) {
                return nil
            }
        }
    }

    /// Starts (or restarts) the connection loop. Finishing the stream's
    /// consumer does not stop the loop — call `stop()`.
    public func events() -> AsyncStream<ServerEvent> {
        loop?.cancel()
        continuation?.finish()
        let (stream, continuation) = AsyncStream<ServerEvent>.makeStream(bufferingPolicy: .bufferingNewest(256))
        self.continuation = continuation
        loop = Task { [weak self] in
            await self?.run(continuation)
        }
        return stream
    }

    public func stop() {
        loop?.cancel()
        loop = nil
        continuation?.finish()
        continuation = nil
    }

    // MARK: - Loop

    private func run(_ continuation: AsyncStream<ServerEvent>.Continuation) async {
        var attempt = 0
        while !Task.isCancelled {
            do {
                let ticket = try await ticketProvider()
                let url = Self.socketURL(for: baseURL, ticket: ticket)
                let task = session.webSocketTask(with: url)
                task.resume()
                continuation.yield(ServerEvent(type: ServerEvent.connectedType, data: nil))
                attempt = 0
                try await receiveLoop(task, continuation)
            } catch is CancellationError {
                break
            } catch {
                continuation.yield(ServerEvent(type: ServerEvent.disconnectedType, data: Data(error.localizedDescription.utf8)))
            }
            guard !Task.isCancelled else { break }
            let delay = Self.backoff[min(attempt, Self.backoff.count - 1)]
            attempt += 1
            try? await Task.sleep(for: .seconds(delay))
        }
        continuation.finish()
    }

    private func receiveLoop(_ task: URLSessionWebSocketTask, _ continuation: AsyncStream<ServerEvent>.Continuation) async throws {
        defer { task.cancel(with: .goingAway, reason: nil) }
        while !Task.isCancelled {
            let message = try await task.receive()
            switch message {
            case let .string(text):
                if let event = ServerEvent.parse(text) { continuation.yield(event) }
            case let .data(data):
                if let text = String(data: data, encoding: .utf8), let event = ServerEvent.parse(text) { continuation.yield(event) }
            @unknown default:
                continue
            }
        }
    }

    /// `http(s)://host[/prefix]` → `ws(s)://host[/prefix]/ws?ticket=…`.
    public static func socketURL(for baseURL: URL, ticket: String?) -> URL {
        var components = URLComponents(url: ServerProfile.normalize(baseURL), resolvingAgainstBaseURL: false) ?? URLComponents()
        components.scheme = components.scheme == "https" ? "wss" : "ws"
        components.path = (components.path.hasSuffix("/") ? String(components.path.dropLast()) : components.path) + "/ws"
        components.queryItems = ticket.map { [URLQueryItem(name: "ticket", value: $0)] }
        return components.url ?? baseURL
    }
}
