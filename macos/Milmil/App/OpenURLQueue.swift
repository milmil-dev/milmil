import SwiftUI

/// Links (`milmil://…`) and files (`.torrent`) handed to the app, queued
/// until the logged-in shell can act on them.
struct OpenURLQueue {
    var links: Binding<[URL]>
    var files: Binding<[URL]>

    static let empty = OpenURLQueue(links: .constant([]), files: .constant([]))

    func drainLinks() -> [URL] {
        let urls = links.wrappedValue
        links.wrappedValue = []
        return urls
    }

    func drainFiles() -> [URL] {
        let urls = files.wrappedValue
        files.wrappedValue = []
        return urls
    }
}

extension EnvironmentValues {
    @Entry var pendingOpenURLs: OpenURLQueue = .empty
}
