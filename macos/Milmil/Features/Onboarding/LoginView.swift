import MilmilAPI
import SwiftUI

struct LoginView: View {
    @Environment(SessionStore.self) private var session
    @ObserveInjection private var inject
    @State private var username = ""
    @State private var password = ""
    @State private var errorMessage: String?
    @State private var isSubmitting = false
    @FocusState private var focus: Field?

    private enum Field { case username, password }

    var body: some View {
        let profile = session.phase.profile
        OnboardingCard(title: profile?.name ?? "milmil", subtitle: "登入你的 milmil 伺服器") {
            if let profile {
                HStack(spacing: 8) {
                    Image(systemName: "server.rack")
                        .foregroundStyle(Theme.accent)
                    Text(profile.baseURL.absoluteString)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Text.secondary)
                        .lineLimit(1)
                    Spacer()
                    if let version = profile.lastKnownVersion {
                        Label("v\(version)", systemImage: "circle.fill")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(.green)
                            .labelStyle(.titleAndIcon)
                            .imageScale(.small)
                    }
                    Button("切換") { session.switchToNoServer() }
                        .buttonStyle(.borderless)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Theme.accent)
                }
                .padding(10)
                .background(.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 8))
            }

            FormField(label: "使用者名稱") {
                TextField("admin", text: $username)
                    .textFieldStyle(.roundedBorder)
                    .textContentType(.username)
                    .focused($focus, equals: .username)
                    .onSubmit { focus = .password }
            }
            FormField(label: "密碼") {
                SecureField("••••••••", text: $password)
                    .textFieldStyle(.roundedBorder)
                    .textContentType(.password)
                    .focused($focus, equals: .password)
                    .onSubmit(submit)
            }
            if let errorMessage {
                InlineError(message: errorMessage)
            }
            Button(action: submit) {
                HStack {
                    if isSubmitting { ProgressView().controlSize(.small) }
                    Text("登入")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .tint(Theme.accent)
            .disabled(isSubmitting || username.isEmpty || password.isEmpty)
            .keyboardShortcut(.defaultAction)

            Text("此裝置會以「\(DeviceName.current())」登記為一組 API token，可在 設定 › 伺服器 隨時撤銷。")
                .font(.system(size: 11))
                .foregroundStyle(Theme.Text.tertiary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
        }
        .onAppear { focus = .username }
    }

    private func submit() {
        guard !isSubmitting, !username.isEmpty, !password.isEmpty else { return }
        isSubmitting = true
        errorMessage = nil
        Task {
            defer { isSubmitting = false }
            do {
                try await session.login(username: username, password: password)
            } catch APIError.unauthorized {
                errorMessage = "使用者名稱或密碼錯誤"
                password = ""
                focus = .password
            } catch APIError.rateLimited(let retry) {
                errorMessage = retry.map { "嘗試次數過多，請 \(Int($0)) 秒後再試" } ?? "嘗試次數過多，請稍後再試"
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}

#if DEBUG
#Preview("Login") {
    PreviewHost(phase: .login(Preview.profile, version: "0.1.17")) { LoginView() }
}

#Preview("Login · gradient fallback") {
    PreviewHost(phase: .login(Preview.profile, version: "0.1.17"), covers: []) { LoginView() }
}
#endif
