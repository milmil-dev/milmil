import AppKit
import MilmilAPI
import SwiftUI

/// 帳號: change password and manage two-factor auth (TOTP), as on the web.
struct AccountSettingsTab: View {
    let session: ServerSession
    @State private var current = ""
    @State private var new = ""
    @State private var confirm = ""
    @State private var passwordBusy = false
    @State private var twoFactor: Loadable<Bool> = .idle
    @State private var setup: TwoFactorSetup?
    @State private var code = ""
    @State private var twoFactorBusy = false
    @State private var confirmDisable = false
    @State private var toast: String?

    private var passwordValid: Bool {
        !current.isEmpty && new.count >= 8 && new == confirm && new != current
    }

    var body: some View {
        Form {
            Section {
                LabeledContent("使用者", value: session.user.username)
                LabeledContent("伺服器", value: session.profile.name)
            }
            Section("變更密碼") {
                SecureField("目前密碼", text: $current)
                SecureField("新密碼（至少 8 字元）", text: $new)
                SecureField("再輸入一次新密碼", text: $confirm)
                HStack {
                    if !confirm.isEmpty, new != confirm {
                        Text("兩次輸入的密碼不一致").font(.system(size: 11)).foregroundStyle(Color(hex: 0xF87171))
                    }
                    Spacer()
                    Button(passwordBusy ? String(localized: "更新中…") : String(localized: "更新密碼")) { Task { await changePassword() } }
                        .disabled(!passwordValid || passwordBusy)
                }
            }
            Section("兩步驟驗證") {
                twoFactorContent
            }
            Section("最近變更") {
                RecentChangesSection(session: session)
            }
        }
        .formStyle(.grouped)
        .task { await loadTwoFactor() }
        .overlay(alignment: .bottom) { ToastLabel(text: $toast) }
        .confirmationDialog("停用兩步驟驗證？", isPresented: $confirmDisable, titleVisibility: .visible) {
            Button("停用", role: .destructive) { Task { await disableTwoFactor() } }
        } message: {
            Text("之後登入只需要密碼。")
        }
    }

    @ViewBuilder private var twoFactorContent: some View {
        switch twoFactor {
        case let .loaded(enabled):
            if let setup {
                setupView(setup)
            } else if enabled {
                HStack {
                    Label("已啟用", systemImage: "checkmark.shield.fill").foregroundStyle(Color(hex: 0x4ADE80))
                    Spacer()
                    Button("停用", role: .destructive) { confirmDisable = true }.disabled(twoFactorBusy)
                }
            } else {
                HStack {
                    Text("登入時要求驗證 app 的 6 位數代碼，為帳號多一層保護。").font(.system(size: 12)).foregroundStyle(Theme.Text.tertiary)
                    Spacer()
                    Button("啟用…") { Task { await startSetup() } }.disabled(twoFactorBusy)
                }
            }
        case let .failed(message):
            ErrorBanner(message: message) { Task { await loadTwoFactor() } }
        default:
            ProgressView().controlSize(.small)
        }
    }

    private func setupView(_ setup: TwoFactorSetup) -> some View {
        HStack(alignment: .top, spacing: 16) {
            if let image = Self.image(fromDataURL: setup.qrCode) {
                Image(nsImage: image).resizable().interpolation(.none).frame(width: 140, height: 140)
                    .background(.white, in: RoundedRectangle(cornerRadius: 8))
            }
            VStack(alignment: .leading, spacing: 8) {
                Text("用驗證 app（1Password、Authy、Google Authenticator）掃描，或手動輸入金鑰：").font(.system(size: 12))
                HStack(spacing: 6) {
                    Text(setup.secret).font(.system(size: 12, design: .monospaced)).textSelection(.enabled)
                    Button { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(setup.secret, forType: .string) } label: {
                        Image(systemName: "doc.on.doc")
                    }
                    .buttonStyle(.borderless).help("複製金鑰")
                }
                HStack {
                    TextField("6 位數代碼", text: $code).frame(width: 120).onSubmit { Task { await verify() } }
                    Button(twoFactorBusy ? String(localized: "驗證中…") : String(localized: "驗證並啟用")) { Task { await verify() } }
                        .glassProminentButtonStyle().disabled(code.count != 6 || twoFactorBusy)
                    Button("取消") { self.setup = nil; code = "" }
                }
            }
        }
        .padding(.vertical, 4)
    }

    private static func image(fromDataURL string: String) -> NSImage? {
        guard let comma = string.firstIndex(of: ",") else { return nil }
        guard let data = Data(base64Encoded: String(string[string.index(after: comma)...])) else { return nil }
        return NSImage(data: data)
    }

    private func loadTwoFactor() async {
        twoFactor = await twoFactor.reloaded { try await session.client.twoFactorEnabled() }
    }

    private func changePassword() async {
        passwordBusy = true
        defer { passwordBusy = false }
        do {
            try await session.client.changePassword(current: current, new: new)
            current = ""; new = ""; confirm = ""
            toast = String(localized: "密碼已更新")
        } catch {
            toast = error.localizedDescription
        }
    }

    private func startSetup() async {
        twoFactorBusy = true
        defer { twoFactorBusy = false }
        do {
            setup = try await session.client.twoFactorSetup()
            code = ""
        } catch {
            toast = error.localizedDescription
        }
    }

    private func verify() async {
        twoFactorBusy = true
        defer { twoFactorBusy = false }
        do {
            try await session.client.twoFactorVerify(code: code)
            setup = nil
            code = ""
            toast = String(localized: "兩步驟驗證已啟用")
            await loadTwoFactor()
        } catch {
            toast = error.localizedDescription
        }
    }

    private func disableTwoFactor() async {
        twoFactorBusy = true
        defer { twoFactorBusy = false }
        do {
            try await session.client.twoFactorDisable()
            toast = String(localized: "兩步驟驗證已停用")
            await loadTwoFactor()
        } catch {
            toast = error.localizedDescription
        }
    }
}
