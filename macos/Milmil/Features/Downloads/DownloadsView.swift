import AppKit
import MilmilAPI
import MilmilRealtime
import SwiftUI
import UniformTypeIdentifiers

@Observable
final class DownloadsStore {
    private(set) var downloads: Loadable<[Download]> = .idle
    private(set) var error: String?
    private let client: APIClient

    init(client: APIClient) {
        self.client = client
    }

    var active: [Download] { (downloads.value ?? []).filter { $0.isActive || $0.isPaused || $0.isError } }
    var finished: [Download] { (downloads.value ?? []).filter(\.isDone) }
    var hasActive: Bool { (downloads.value ?? []).contains(where: \.isActive) }
    var totalSpeed: Int64 { (downloads.value ?? []).reduce(0) { $0 + $1.speedBytes } }

    func load(quiet: Bool = false) async {
        if !quiet { downloads = downloads.reloading }
        if let rows = try? await client.downloads() {
            downloads = .loaded(rows.sorted { ($0.createdAt ?? .distantPast) > ($1.createdAt ?? .distantPast) })
        } else if !quiet {
            downloads = await downloads.reloaded { try await client.downloads() }
        }
    }

    func add(url: String, name: String?) async throws {
        _ = try await client.addDownload(url: url, name: name)
        await load(quiet: true)
    }

    func pause(_ download: Download) async {
        try? await client.pauseDownload(gid: download.gid)
        await load(quiet: true)
    }

    func resume(_ download: Download) async {
        try? await client.resumeDownload(gid: download.gid)
        await load(quiet: true)
    }

    func remove(_ download: Download, deleteFiles: Bool) async {
        try? await client.deleteDownload(gid: download.gid, deleteFiles: deleteFiles)
        await load(quiet: true)
    }

    func removeAll(deleteFiles: Bool) async {
        try? await client.deleteAllDownloads(deleteFiles: deleteFiles)
        await load(quiet: true)
    }
}

/// 下載: active transfers with live progress, finished ones below, add by
/// URL / magnet or by dropping a `.torrent` / magnet link onto the page.
struct DownloadsView: View {
    @Environment(ServerSession.self) private var session
    @Environment(BackdropStore.self) private var backdrop
    @State private var store: DownloadsStore?
    @State private var showAdd = false
    @State private var confirmClear = false
    @State private var dropTargeted = false
    @ObserveInjection private var inject

    var body: some View {
        Group {
            if let store { content(store) } else { Color.clear }
        }
        .navigationTitle("下載")
        .task {
            if store == nil { store = DownloadsStore(client: session.client) }
            backdrop.set(nil, seed: "downloads", dim: 0.6, owner: "downloads")
            await store?.load()
        }
        .task(id: session.eventGeneration) {
            guard session.eventGeneration > 0, session.lastEvent?.type.hasPrefix("download") == true else { return }
            await store?.load(quiet: true)
        }
        .task(id: store?.hasActive) {
            // aria2 progress is batched into WS events every few seconds; poll
            // as a fallback while something is transferring.
            guard store?.hasActive == true else { return }
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(4))
                await store?.load(quiet: true)
            }
        }
        .onDisappear { backdrop.clear(owner: "downloads") }
    }

    private func content(_ store: DownloadsStore) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                let speed = ByteCountFormatter.string(fromByteCount: store.totalSpeed, countStyle: .file)
                PageHeader(title: "下載", subtitle: store.hasActive ? "↓ \(speed)/s" : nil) {
                    HStack(spacing: 8) {
                        Button("新增", systemImage: "plus") { showAdd = true }.buttonStyle(.borderedProminent)
                        Button("清空", systemImage: "trash", role: .destructive) { confirmClear = true }
                            .buttonStyle(.bordered)
                            .disabled((store.downloads.value ?? []).isEmpty)
                    }
                }
                switch store.downloads {
                case .loaded where (store.downloads.value ?? []).isEmpty:
                    EmptyState(
                        symbol: "arrow.down.circle", title: "沒有下載",
                        message: "貼上 magnet / torrent / HTTP 連結，或把 .torrent 拖進這裡。", actionTitle: "新增下載"
                    ) { showAdd = true }
                        .frame(maxWidth: .infinity).padding(.top, 40)
                case .loaded:
                    if !store.active.isEmpty {
                        section("進行中", store.active, store)
                    }
                    if !store.finished.isEmpty {
                        section("已完成", store.finished, store)
                    }
                case let .failed(message):
                    ErrorBanner(message: message) { Task { await store.load() } }
                default:
                    ProgressView().frame(maxWidth: .infinity).padding(40)
                }
            }
            .padding(.horizontal, 40)
            .padding(.top, 20)
            .padding(.bottom, 40)
        }
        .overlay {
            if dropTargeted {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(Theme.accent, style: StrokeStyle(lineWidth: 2, dash: [8, 6]))
                    .background(Theme.accent.opacity(0.08), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(Label("放開以加入下載", systemImage: "arrow.down.doc").font(.system(size: 16, weight: .semibold)))
                    .padding(24)
                    .allowsHitTesting(false)
            }
        }
        .onDrop(of: [.fileURL, .url, .plainText], isTargeted: $dropTargeted) { providers in
            handleDrop(providers, store)
        }
        .sheet(isPresented: $showAdd) { AddDownloadSheet(store: store) }
        .confirmationDialog("清空所有下載？", isPresented: $confirmClear, titleVisibility: .visible) {
            Button("只移除記錄") { Task { await store.removeAll(deleteFiles: false) } }
            Button("連檔案一起刪除", role: .destructive) { Task { await store.removeAll(deleteFiles: true) } }
        }
    }

    private func section(_ title: String, _ rows: [Download], _ store: DownloadsStore) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.system(size: 12, weight: .bold)).foregroundStyle(Theme.Text.tertiary).padding(.horizontal, 4)
            VStack(spacing: 6) {
                ForEach(rows) { download in
                    DownloadRow(download: download, store: store)
                }
            }
        }
    }

    private func handleDrop(_ providers: [NSItemProvider], _ store: DownloadsStore) -> Bool {
        var handled = false
        for provider in providers {
            if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
                handled = true
                provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier) { item, _ in
                    guard let data = item as? Data, let url = URL(dataRepresentation: data, relativeTo: nil),
                          url.pathExtension.lowercased() == "torrent" else { return }
                    Task { @MainActor in try? await store.add(url: url.absoluteString, name: url.deletingPathExtension().lastPathComponent) }
                }
            } else if provider.canLoadObject(ofClass: NSString.self) {
                handled = true
                _ = provider.loadObject(ofClass: NSString.self) { text, _ in
                    guard let text = text as? String, text.hasPrefix("magnet:") || text.hasPrefix("http") else { return }
                    Task { @MainActor in try? await store.add(url: text.trimmingCharacters(in: .whitespacesAndNewlines), name: nil) }
                }
            }
        }
        return handled
    }
}

private struct DownloadRow: View {
    let download: Download
    let store: DownloadsStore
    @State private var confirmDelete = false

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: symbol)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 34, height: 34)
                .background(tint.opacity(0.14), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            VStack(alignment: .leading, spacing: 5) {
                Text(download.displayName).font(.system(size: 13, weight: .semibold)).lineLimit(1).truncationMode(.middle)
                if !download.isDone {
                    ProgressView(value: download.fraction).progressViewStyle(.linear).tint(tint).controlSize(.small)
                }
                Text(detail).font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary).monospacedDigit().lineLimit(1)
            }
            Spacer()
            HStack(spacing: 4) {
                if download.isActive {
                    action("暫停", "pause.fill") { Task { await store.pause(download) } }
                } else if download.isPaused || download.isError {
                    action("繼續", "play.fill") { Task { await store.resume(download) } }
                }
                if download.isDone, !download.saveDir.isEmpty {
                    action("複製路徑", "doc.on.doc") {
                        NSPasteboard.general.clearContents()
                        NSPasteboard.general.setString(download.saveDir, forType: .string)
                    }
                }
                action("移除", "xmark") { confirmDelete = true }
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .confirmationDialog("移除「\(download.displayName)」？", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("只移除記錄") { Task { await store.remove(download, deleteFiles: false) } }
            Button("連檔案一起刪除", role: .destructive) { Task { await store.remove(download, deleteFiles: true) } }
        }
    }

    private func action(_ label: String, _ symbol: String, _ run: @escaping () -> Void) -> some View {
        Button(action: run) {
            Image(systemName: symbol).font(.system(size: 12, weight: .semibold)).frame(width: 26, height: 26)
        }
        .buttonStyle(.plain)
        .foregroundStyle(Theme.Text.secondary)
        .help(label)
        .accessibilityLabel(label)
    }

    private var symbol: String {
        switch download.status {
        case "active": "arrow.down"
        case "paused": "pause"
        case "complete": "checkmark"
        case "error": "exclamationmark.triangle"
        default: "clock"
        }
    }

    private var tint: Color {
        switch download.status {
        case "active": Theme.accent
        case "complete": Color(hex: 0x4ADE80)
        case "error": Color(hex: 0xF87171)
        default: Color(hex: 0xFBBF24)
        }
    }

    private var detail: String {
        let done = ByteCountFormatter.string(fromByteCount: download.completedBytes, countStyle: .file)
        let total = download.totalBytes > 0 ? ByteCountFormatter.string(fromByteCount: download.totalBytes, countStyle: .file) : "—"
        switch download.status {
        case "active":
            let speed = ByteCountFormatter.string(fromByteCount: download.speedBytes, countStyle: .file)
            var text = "\(done) / \(total) · \(speed)/s"
            if download.speedBytes > 0, download.totalBytes > download.completedBytes {
                let eta = Double(download.totalBytes - download.completedBytes) / Double(download.speedBytes)
                text += " · 剩 \(Formatters.clock(eta))"
            }
            return text
        case "complete": return "\(total) · \(Formatters.relative(download.updatedAt ?? download.createdAt))"
        case "error": return "下載失敗 · \(done) / \(total)"
        case "paused": return "已暫停 · \(done) / \(total)"
        default: return "等待中 · \(total)"
        }
    }
}

private struct AddDownloadSheet: View {
    let store: DownloadsStore
    @Environment(\.dismiss) private var dismiss
    @State private var url = ""
    @State private var name = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("新增下載").font(.system(size: 16, weight: .bold))
            Form {
                TextField("連結", text: $url, prompt: Text("magnet:?xt=… 或 https://…/file.torrent"))
                TextField("名稱（選填）", text: $name)
            }
            .formStyle(.columns)
            if let error { Text(error).font(.system(size: 12)).foregroundStyle(Color(hex: 0xF87171)) }
            HStack {
                Button("從剪貼簿貼上") {
                    if let text = NSPasteboard.general.string(forType: .string) { url = text.trimmingCharacters(in: .whitespacesAndNewlines) }
                }
                Spacer()
                Button("取消") { dismiss() }.keyboardShortcut(.cancelAction)
                Button("新增") {
                    busy = true
                    Task {
                        do {
                            try await store.add(url: url.trimmingCharacters(in: .whitespacesAndNewlines), name: name.isEmpty ? nil : name)
                            dismiss()
                        } catch {
                            self.error = (error as? APIError)?.serverMessage.flatMap { $0.isEmpty ? nil : $0 } ?? error.localizedDescription
                        }
                        busy = false
                    }
                }
                .keyboardShortcut(.defaultAction)
                .disabled(url.trimmingCharacters(in: .whitespaces).isEmpty || busy)
            }
        }
        .padding(20)
        .frame(width: 480)
        .onAppear {
            if let text = NSPasteboard.general.string(forType: .string)?.trimmingCharacters(in: .whitespacesAndNewlines),
               text.hasPrefix("magnet:") || text.hasSuffix(".torrent") {
                url = text
            }
        }
    }
}
