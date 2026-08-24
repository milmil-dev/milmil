import MilmilAPI
import SwiftUI

/// The source kinds the server's storage factory understands.
enum LibrarySourceType: String, CaseIterable, Identifiable {
    case local, smb, sftp, ftp, webdav, s3, http, gdrive, onedrive, dropbox

    var id: String { rawValue }

    var label: String {
        switch self {
        case .local: String(localized: "本機資料夾")
        case .smb: "SMB"
        case .sftp: "SFTP"
        case .ftp: "FTP"
        case .webdav: "WebDAV"
        case .s3: "S3"
        case .http: "HTTP"
        case .gdrive: "Google Drive"
        case .onedrive: "OneDrive"
        case .dropbox: "Dropbox"
        }
    }

    /// OAuth backends ride on a pre-configured rclone remote.
    var isRclone: Bool { self == .gdrive || self == .onedrive || self == .dropbox }
    var isRemote: Bool { self != .local }
}

/// Add / edit a library, remote sources included. On edit, credential fields
/// left empty keep the server's stored config (the API never returns it).
struct LibraryFormSheet: View {
    let client: APIClient
    /// nil = create.
    let editing: Library?
    var onSaved: (Library) async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var path = ""
    @State private var enabled = true
    @State private var scanInterval = 60
    @State private var sourceType: LibrarySourceType = .local
    // SMB
    @State private var smbHost = ""
    @State private var smbPort = 445
    @State private var smbShare = ""
    @State private var smbUsername = ""
    @State private var smbPassword = ""
    @State private var smbDomain = ""
    // SFTP / FTP
    @State private var host = ""
    @State private var port = 22
    @State private var username = ""
    @State private var password = ""
    // WebDAV / HTTP
    @State private var url = ""
    @State private var webdavVendor = "other"
    // S3
    @State private var s3Endpoint = ""
    @State private var s3Bucket = ""
    @State private var s3Region = ""
    @State private var s3AccessKey = ""
    @State private var s3SecretKey = ""
    // rclone OAuth backends
    @State private var remotes: Loadable<[RcloneRemote]> = .idle
    @State private var remoteName = ""

    @State private var testResult: TestConnectionResult?
    @State private var testing = false
    @State private var browsing = false
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(editing == nil ? String(localized: "新增媒體庫") : String(localized: "編輯媒體庫"))
                .font(.system(size: 16, weight: .bold))
                .padding(.horizontal, 20).padding(.vertical, 16)
            Divider()
            ScrollView {
                Form {
                    generalSection
                    sourceSection
                    pathSection
                }
                .formStyle(.grouped)
                .scrollContentBackground(.hidden)
            }
            Divider()
            footer
        }
        .frame(width: 520, height: sourceType.isRemote ? 620 : 460)
        .task { prefill() }
        .task(id: sourceType) {
            testResult = nil
            if sourceType.isRclone, remotes.value == nil {
                remotes = remotes.reloading
                remotes = await remotes.reloaded { try await client.rcloneRemotes() }
                if remoteName.isEmpty, let list = remotes.value {
                    let backend = sourceType.rawValue.replacingOccurrences(of: "gdrive", with: "drive")
                    remoteName = list.first { $0.type.contains(backend) }?.name ?? list.first?.name ?? ""
                }
            }
        }
        .sheet(isPresented: $browsing) {
            ServerFolderBrowser(client: client, sourceType: sourceType, sourceConfig: sourceConfig(), startPath: path) { picked in
                path = picked
                if name.isEmpty { name = (picked as NSString).lastPathComponent }
            }
        }
    }

    // MARK: - Sections

    private var generalSection: some View {
        Section {
            TextField("名稱", text: $name, prompt: Text(verbatim: "動畫"))
            Picker("來源類型", selection: $sourceType) {
                ForEach(LibrarySourceType.allCases) { type in
                    Text(type.label).tag(type)
                }
            }
            .disabled(editing != nil)
            Stepper(value: $scanInterval, in: 5...1440, step: 5) {
                LabeledContent("掃描間隔", value: String(localized: "\(scanInterval) 分鐘"))
            }
            if editing != nil {
                Toggle("啟用", isOn: $enabled)
            }
        }
    }

    @ViewBuilder
    private var sourceSection: some View {
        switch sourceType {
        case .local:
            EmptyView()
        case .smb:
            Section("SMB") {
                TextField("主機", text: $smbHost, prompt: Text(verbatim: "192.168.1.10"))
                TextField("連接埠", value: $smbPort, format: .number.grouping(.never))
                TextField("共享資料夾", text: $smbShare, prompt: Text(verbatim: "media"))
                TextField("使用者名稱", text: $smbUsername)
                SecureField("密碼", text: $smbPassword)
                TextField("網域（可留空）", text: $smbDomain)
                credentialHint
                testConnectionRow
            }
        case .sftp, .ftp:
            Section(sourceType == .sftp ? "SFTP" : "FTP") {
                TextField("主機", text: $host, prompt: Text(verbatim: "192.168.1.10"))
                TextField("連接埠", value: $port, format: .number.grouping(.never))
                TextField("使用者名稱", text: $username)
                SecureField("密碼", text: $password)
                credentialHint
                testConnectionRow
            }
        case .webdav:
            Section("WebDAV") {
                TextField("URL", text: $url, prompt: Text(verbatim: "https://dav.example.com/remote.php/dav"))
                Picker("伺服器類型", selection: $webdavVendor) {
                    Text(verbatim: "Nextcloud").tag("nextcloud")
                    Text(verbatim: "ownCloud").tag("owncloud")
                    Text("其他").tag("other")
                }
                TextField("使用者名稱", text: $username)
                SecureField("密碼", text: $password)
                credentialHint
                testConnectionRow
            }
        case .s3:
            Section("S3") {
                TextField("Endpoint", text: $s3Endpoint, prompt: Text(verbatim: "https://s3.example.com"))
                TextField("Bucket", text: $s3Bucket)
                TextField("Region（可留空）", text: $s3Region)
                TextField("Access Key", text: $s3AccessKey)
                SecureField("Secret Key", text: $s3SecretKey)
                credentialHint
                testConnectionRow
            }
        case .http:
            Section("HTTP") {
                TextField("URL", text: $url, prompt: Text(verbatim: "https://files.example.com/anime/"))
                testConnectionRow
            }
        case .gdrive, .onedrive, .dropbox:
            Section("rclone remote") {
                switch remotes {
                case let .loaded(list) where list.isEmpty:
                    Text("伺服器上沒有設定 rclone remote。先在伺服器執行 `rclone config` 建立一個。")
                        .font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                case let .loaded(list):
                    Picker("Remote", selection: $remoteName) {
                        ForEach(list) { remote in
                            Text(verbatim: "\(remote.name) (\(remote.type))").tag(remote.name)
                        }
                    }
                    testConnectionRow
                case let .failed(message):
                    Text(message).font(.system(size: 11)).foregroundStyle(Color(hex: 0xF87171))
                default:
                    ProgressView().controlSize(.small)
                }
            }
        }
    }

    private var pathSection: some View {
        Section {
            HStack {
                let label = sourceType.isRemote ? String(localized: "遠端路徑") : String(localized: "伺服器上的路徑")
                TextField(label, text: $path, prompt: Text(verbatim: sourceType.isRemote ? "/" : "/data/anime"))
                Button("瀏覽…") { browsing = true }
                    .disabled(sourceType.isRemote && !sourceReady)
            }
            if sourceType == .local {
                Text("路徑是伺服器看到的路徑，不是這台 Mac 的。").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
            }
        }
    }

    @ViewBuilder
    private var credentialHint: some View {
        if editing != nil {
            Text("留空表示沿用已儲存的連線設定。").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
        }
    }

    private var testConnectionRow: some View {
        HStack(spacing: 8) {
            Button(testing ? String(localized: "測試中…") : String(localized: "測試連線")) { Task { await testConnection() } }
                .disabled(!sourceReady || testing)
            if let testResult {
                if testResult.ok {
                    Label("連線成功", systemImage: "checkmark.circle.fill")
                        .font(.system(size: 12)).foregroundStyle(Color(hex: 0x4ADE80))
                } else {
                    Label(testResult.error ?? String(localized: "連線失敗"), systemImage: "xmark.circle.fill")
                        .font(.system(size: 12)).foregroundStyle(Color(hex: 0xF87171))
                        .lineLimit(2)
                }
            }
        }
    }

    private var footer: some View {
        HStack {
            if let error {
                Text(error).font(.system(size: 12)).foregroundStyle(Color(hex: 0xF87171)).lineLimit(2)
            }
            Spacer()
            Button("取消") { dismiss() }.keyboardShortcut(.cancelAction)
            Button(editing == nil ? String(localized: "新增並掃描") : String(localized: "儲存")) { Task { await save() } }
                .keyboardShortcut(.defaultAction)
                .disabled(!formValid || busy)
        }
        .padding(.horizontal, 20).padding(.vertical, 14)
    }

    // MARK: - Logic

    private func prefill() {
        guard let editing else { return }
        name = editing.name
        path = editing.path
        enabled = editing.enabled
        scanInterval = editing.scanIntervalMinutes
        sourceType = LibrarySourceType(rawValue: editing.sourceType) ?? .local
    }

    /// Enough fields to probe the source (edit mode may rely on stored config).
    private var sourceReady: Bool {
        if editing != nil { return true }
        switch sourceType {
        case .local: return true
        case .smb: return !smbHost.isEmpty && !smbShare.isEmpty
        case .sftp: return !host.isEmpty && !password.isEmpty
        case .ftp: return !host.isEmpty
        case .webdav, .http: return !url.isEmpty
        case .s3: return !s3Endpoint.isEmpty && !s3Bucket.isEmpty && !s3AccessKey.isEmpty && !s3SecretKey.isEmpty
        case .gdrive, .onedrive, .dropbox: return !remoteName.isEmpty
        }
    }

    private var formValid: Bool {
        let hasBasics = !name.trimmingCharacters(in: .whitespaces).isEmpty && !path.trimmingCharacters(in: .whitespaces).isEmpty
        return hasBasics && (editing != nil || !sourceType.isRemote || sourceReady)
    }

    /// nil when nothing was entered (edit mode: keep the server's config).
    private func sourceConfig() -> LibrarySourceConfig? {
        switch sourceType {
        case .local:
            return nil
        case .smb:
            guard !smbHost.isEmpty else { return nil }
            return LibrarySourceConfig(
                host: smbHost, port: smbPort, share: smbShare,
                username: smbUsername.isEmpty ? nil : smbUsername,
                password: smbPassword.isEmpty ? nil : smbPassword,
                domain: smbDomain.isEmpty ? nil : smbDomain
            )
        case .sftp, .ftp:
            guard !host.isEmpty else { return nil }
            return LibrarySourceConfig(
                host: host, port: port,
                username: username.isEmpty ? nil : username,
                password: password.isEmpty ? nil : password
            )
        case .webdav:
            guard !url.isEmpty else { return nil }
            return LibrarySourceConfig(
                username: username.isEmpty ? nil : username,
                password: password.isEmpty ? nil : password,
                url: url, vendor: webdavVendor
            )
        case .http:
            guard !url.isEmpty else { return nil }
            return LibrarySourceConfig(url: url)
        case .s3:
            guard !s3Endpoint.isEmpty else { return nil }
            return LibrarySourceConfig(
                endpoint: s3Endpoint, bucket: s3Bucket,
                region: s3Region.isEmpty ? nil : s3Region,
                accessKey: s3AccessKey, secretKey: s3SecretKey
            )
        case .gdrive, .onedrive, .dropbox:
            guard !remoteName.isEmpty else { return nil }
            return LibrarySourceConfig(remoteName: remoteName)
        }
    }

    private func testConnection() async {
        testing = true
        defer { testing = false }
        do {
            testResult = try await client.testLibraryConnection(
                sourceType: sourceType.rawValue,
                sourceConfig: sourceConfig() ?? LibrarySourceConfig(),
                path: path.isEmpty ? "/" : path
            )
        } catch {
            testResult = nil
            self.error = friendly(error)
        }
    }

    private func save() async {
        busy = true
        defer { busy = false }
        error = nil
        let name = name.trimmingCharacters(in: .whitespaces)
        let path = path.trimmingCharacters(in: .whitespaces)
        do {
            let saved: Library
            if let editing {
                saved = try await client.updateLibrary(
                    id: editing.id, name: name, path: path, enabled: enabled,
                    sourceType: sourceType.rawValue, sourceConfig: sourceConfig(), scanIntervalMinutes: scanInterval
                )
            } else {
                saved = try await client.createLibrary(
                    name: name, path: path, sourceType: sourceType.rawValue,
                    sourceConfig: sourceConfig(), scanIntervalMinutes: scanInterval
                )
                try? await client.scanLibrary(id: saved.id)
            }
            await onSaved(saved)
            dismiss()
        } catch {
            self.error = friendly(error)
        }
    }

    private func friendly(_ error: any Error) -> String {
        (error as? APIError)?.serverMessage.flatMap { $0.isEmpty ? nil : $0 } ?? error.localizedDescription
    }
}

/// Directory picker that walks the *server's* filesystem (or the remote
/// source) through `POST /libraries/browse`.
private struct ServerFolderBrowser: View {
    let client: APIClient
    let sourceType: LibrarySourceType
    let sourceConfig: LibrarySourceConfig?
    var onPick: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var current: String
    @State private var entries: Loadable<[BrowseEntry]> = .idle

    init(client: APIClient, sourceType: LibrarySourceType, sourceConfig: LibrarySourceConfig?, startPath: String, onPick: @escaping (String) -> Void) {
        self.client = client
        self.sourceType = sourceType
        self.sourceConfig = sourceConfig
        self.onPick = onPick
        _current = State(initialValue: startPath.isEmpty ? "/" : startPath)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Button {
                    current = parent(of: current)
                } label: { Image(systemName: "chevron.up") }
                    .disabled(current == "/" || current.isEmpty)
                    .help("上一層")
                Text(current).font(.system(size: 12, design: .monospaced)).lineLimit(1).truncationMode(.head)
                Spacer()
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
            Divider()
            list
            Divider()
            HStack {
                Spacer()
                Button("取消") { dismiss() }.keyboardShortcut(.cancelAction)
                Button("選擇此資料夾") {
                    onPick(current)
                    dismiss()
                }
                .keyboardShortcut(.defaultAction)
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
        }
        .frame(width: 440, height: 420)
        .task(id: current) { await load() }
    }

    @ViewBuilder
    private var list: some View {
        switch entries {
        case let .loaded(list) where list.isEmpty:
            EmptyState(symbol: "folder", title: String(localized: "沒有子資料夾"), message: "")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case let .loaded(list):
            List(list) { entry in
                Button {
                    current = entry.path
                } label: {
                    Label(entry.name, systemImage: "folder")
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .listStyle(.plain)
        case let .failed(message):
            ErrorBanner(message: message) { Task { await load() } }.padding(16)
            Spacer()
        default:
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func load() async {
        entries = entries.reloading
        let path = current
        entries = await entries.reloaded {
            try await client.browseLibrarySource(sourceType: sourceType.rawValue, sourceConfig: sourceConfig ?? LibrarySourceConfig(), path: path)
        }
    }

    private func parent(of path: String) -> String {
        let trimmed = (path as NSString).deletingLastPathComponent
        return trimmed.isEmpty ? "/" : trimmed
    }
}
