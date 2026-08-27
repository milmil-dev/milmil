import Foundation
import MilmilAPI

/// A `milmil://pair?url=<server>&token=<mlml_…>&name=<label>` link: everything
/// a client needs to reach a server without anyone typing a URL or a password.
///
/// Handled by `RootView`, not `Router` — a pairing link arrives while the app
/// is still on the server picker or the login screen, where no shell (and so
/// no router) exists yet.
struct PairRequest: Equatable, Identifiable {
    let name: String
    let url: URL
    let token: String

    var id: String { url.absoluteString + token }

    init?(link: URL) {
        guard link.scheme == "milmil", link.host() == "pair",
              let items = URLComponents(url: link, resolvingAgainstBaseURL: false)?.queryItems,
              let server = items.first(where: { $0.name == "url" })?.value.flatMap(URL.init(string:)),
              let token = items.first(where: { $0.name == "token" })?.value, !token.isEmpty
        else { return nil }
        url = ServerProfile.normalize(server)
        self.token = token
        name = items.first { $0.name == "name" }?.value ?? server.host() ?? "milmil"
    }
}
