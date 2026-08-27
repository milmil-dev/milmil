import SwiftUI

/// Pairing, in the Liquid Glass language: the card floats over the artwork
/// rather than sitting in an opaque tray, and the prominent button fills with
/// ink — never the accent, which is reserved for state and emphasis.
struct PairView: View {
    @Environment(SessionStore.self) private var session
    @State private var scanning = false

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()
            VStack(spacing: 14) {
                switch session.phase {
                case .waiting:
                    Text("配對裝置").font(.largeTitle.weight(.bold))
                    Text("喺 Web 版打開設定 › 配對裝置，掃描畫面上嘅 QR 碼。")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                    Button { scanning = true } label: {
                        Label("開啟相機掃碼", systemImage: "qrcode.viewfinder")
                            .frame(height: 24)
                            .padding(.horizontal, 20)
                    }
                    .buttonStyle(.glassProminent)
                    .tint(Theme.ink(0.92))
                    .foregroundStyle(Theme.background)
                    .padding(.top, 6)

                case let .connecting(name):
                    ProgressView().controlSize(.large).tint(Theme.accent)
                    Text("連線緊 \(name)…").font(.body)

                case let .ready(name, username, version):
                    Text("已配對").font(.largeTitle.weight(.bold))
                    Text("\(name) · \(username) · v\(version)")
                        .font(.subheadline).foregroundStyle(.secondary)

                case let .failed(message):
                    Text("配對失敗").font(.largeTitle.weight(.bold))
                    Text(message)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
            }
            .padding(32)
        }
        .sheet(isPresented: $scanning) {
            QRScannerView { link in
                scanning = false
                guard let request = PairRequest(link: link) else { return }
                Task { await session.pair(request) }
            }
        }
    }
}
