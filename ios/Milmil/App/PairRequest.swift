import Foundation
import MilmilAPI

/// A `milmil://pair?url=<server>&token=<mlml_…>&name=<label>` link.
///
/// The same parse the macOS client does, and the same one `PairLink.kt` does
/// on Android — one QR has to work on all three, so a link one accepts and
/// another rejects is a bug rather than a difference.
struct PairRequest: Equatable, Identifiable {
    let name: String
    let url: URL
    let token: String

    var id: String { url.absoluteString + token }

    init(name: String, url: URL, token: String) {
        self.name = name
        self.url = ServerProfile.normalize(url)
        self.token = token
    }

    init?(link: URL) {
        guard link.scheme == "milmil", link.host() == "pair",
              let items = URLComponents(url: link, resolvingAgainstBaseURL: false)?.queryItems,
              let server = items.first(where: { $0.name == "url" })?.value.flatMap(URL.init(string:)),
              let token = items.first(where: { $0.name == "token" })?.value, !token.isEmpty
        else { return nil }
        self.init(
            name: items.first { $0.name == "name" }?.value ?? server.host() ?? "milmil",
            url: server,
            token: token
        )
    }
}
