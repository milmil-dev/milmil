import MilmilAPI
import SwiftUI

/// The account's avatar: the uploaded image when there is one, else the
/// gradient monogram every screen used before. Sizes ≤ 64 pt ask the server
/// for the 128 px variant.
struct UserAvatarView: View {
    let user: User
    let client: APIClient
    var size: CGFloat = 32

    private var url: URL? { client.avatarURL(user.avatarURL, size: size <= 64 ? 128 : 512) }

    var body: some View {
        RemoteImage(url: url, maxPixel: Int(size * 3)) { monogram }
            .frame(width: size, height: size)
            .clipShape(Circle())
            .accessibilityLabel(user.username)
    }

    private var monogram: some View {
        Circle()
            .fill(LinearGradient(colors: [Color(hex: 0x6D28D9), Theme.accent], startPoint: .topLeading, endPoint: .bottomTrailing))
            .overlay(
                Text(String(user.username.prefix(1)).uppercased())
                    .font(.system(size: size * 0.44, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
            )
    }
}
