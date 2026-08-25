import MilmilAPI
import SwiftUI

struct TwoFactorView: View {
    @Environment(SessionStore.self) private var session
    @ObserveInjection private var inject
    @State private var code = ""
    @State private var errorMessage: String?
    @State private var isSubmitting = false
    @FocusState private var focused: Bool

    var body: some View {
        OnboardingCard(title: String(localized: "兩步驟驗證"), subtitle: String(localized: "輸入驗證 app 顯示的 6 位數代碼")) {
            TextField("000000", text: $code)
                .textFieldStyle(.roundedBorder)
                .font(.system(size: 22, weight: .bold, design: .monospaced))
                .multilineTextAlignment(.center)
                .textContentType(.oneTimeCode)
                .focused($focused)
                .onChange(of: code) { _, newValue in
                    let digits = newValue.filter(\.isNumber).prefix(6)
                    if String(digits) != newValue { code = String(digits) }
                    if digits.count == 6 { submit() }
                }
                .onSubmit(submit)
            if let errorMessage {
                InlineError(message: errorMessage)
            }
            Button(action: submit) {
                HStack {
                    if isSubmitting { ProgressView().controlSize(.small) }
                    Text("驗證")
                }
                .frame(maxWidth: .infinity)
            }
            .glassProminentButtonStyle()
            .controlSize(.large)
            .tint(Theme.accent)
            .disabled(isSubmitting || code.count != 6)
            .keyboardShortcut(.defaultAction)
            Button("返回登入") { session.cancelTwoFactor() }
                .buttonStyle(.borderless)
                .font(.system(size: 12))
                .foregroundStyle(Theme.Text.tertiary)
                .frame(maxWidth: .infinity)
        }
        .onAppear { focused = true }
    }

    private func submit() {
        guard !isSubmitting, code.count == 6 else { return }
        isSubmitting = true
        errorMessage = nil
        Task {
            defer { isSubmitting = false }
            do {
                try await session.completeTwoFactor(code: code)
            } catch APIError.unauthorized {
                errorMessage = String(localized: "驗證碼錯誤或已過期")
                code = ""
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}

#if DEBUG
#Preview("Two-factor") {
    PreviewHost(phase: .twoFactor(Preview.profile, userID: "usr_preview")) { TwoFactorView() }
}

#Preview("Two-factor · English") {
    PreviewHost(phase: .twoFactor(Preview.profile, userID: "usr_preview"), locale: Locale(identifier: "en")) { TwoFactorView() }
}
#endif
