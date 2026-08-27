import AppKit
import MilmilAPI
import SwiftUI
import UniformTypeIdentifiers

/// Uploads, replaces and removes the account avatar. Images are downscaled
/// to ≤ 1024² JPEG on this side so a camera photo never trips the server's
/// 2 MB limit; character portraits are copied server-side from their URL.
@Observable
@MainActor
final class AvatarStore {
    private(set) var busy = false
    var toast: String?
    private let session: ServerSession

    init(session: ServerSession) {
        self.session = session
    }

    /// The largest edge sent to the server.
    static let maxEdge: CGFloat = 1024
    static let imageTypes: [UTType] = [.png, .jpeg, .webP, .heic, .tiff, .gif, .bmp]

    func choose() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = Self.imageTypes
        panel.allowsMultipleSelection = false
        panel.message = String(localized: "選擇頭像圖片")
        panel.begin { [weak self] response in
            guard response == .OK, let url = panel.url else { return }
            Task { @MainActor in await self?.upload(fileURL: url) }
        }
    }

    func upload(fileURL: URL) async {
        guard let image = NSImage(contentsOf: fileURL) else {
            toast = String(localized: "無法讀取這個圖片")
            return
        }
        await upload(image: image)
    }

    func upload(image: NSImage) async {
        guard let data = Self.jpegData(image, maxEdge: Self.maxEdge) else {
            toast = String(localized: "無法讀取這個圖片")
            return
        }
        await perform { try await $0.uploadAvatar(data, filename: "avatar.jpg", mimeType: "image/jpeg") }
    }

    func useCharacter(_ url: URL) async {
        await perform { try await $0.setAvatar(sourceURL: url) }
    }

    func remove() async {
        await perform { client in
            try await client.deleteAvatar()
            return nil
        }
    }

    /// Runs one avatar call, then re-reads the account so every avatar
    /// view (sidebar, settings) picks up the new `?v=`.
    private func perform(_ work: (APIClient) async throws -> AvatarResponse?) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let result = try await work(session.client)
            await session.refreshUser()
            toast = result?.avatarURL == nil ? String(localized: "頭像已移除") : String(localized: "頭像已更新")
        } catch {
            toast = error.localizedDescription
        }
    }

    /// Dropped file URLs / images from any pasteboard; the first image wins.
    func handleDrop(_ providers: [NSItemProvider]) -> Bool {
        let accepted = [UTType.fileURL.identifier, UTType.image.identifier]
        guard let provider = providers.first(where: { item in accepted.contains { item.hasItemConformingToTypeIdentifier($0) } }) else { return false }
        if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
            provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier) { [weak self] item, _ in
                guard let data = item as? Data, let url = URL(dataRepresentation: data, relativeTo: nil) else { return }
                Task { @MainActor in await self?.upload(fileURL: url) }
            }
        } else {
            provider.loadDataRepresentation(forTypeIdentifier: UTType.image.identifier) { [weak self] data, _ in
                guard let data, let image = NSImage(data: data) else { return }
                Task { @MainActor in await self?.upload(image: image) }
            }
        }
        return true
    }

    /// Resample to at most `maxEdge` on the long side, JPEG at 0.88.
    nonisolated static func jpegData(_ image: NSImage, maxEdge: CGFloat) -> Data? {
        guard let source = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return nil }
        let width = CGFloat(source.width)
        let height = CGFloat(source.height)
        let scale = min(1, maxEdge / max(width, height))
        let target = CGSize(width: (width * scale).rounded(), height: (height * scale).rounded())
        guard let context = CGContext(
            data: nil, width: Int(target.width), height: Int(target.height), bitsPerComponent: 8, bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
        ) else { return nil }
        context.interpolationQuality = .high
        context.draw(source, in: CGRect(origin: .zero, size: target))
        guard let scaled = context.makeImage() else { return nil }
        return NSBitmapImageRep(cgImage: scaled).representation(using: .jpeg, properties: [.compressionFactor: 0.88])
    }
}

/// The three avatar actions, for the sidebar submenu and the account card.
struct AvatarActions: View {
    let store: AvatarStore
    let hasAvatar: Bool
    @Binding var pickingCharacter: Bool

    var body: some View {
        Button("更換頭像…", systemImage: "photo") { store.choose() }
        Button("用番劇角色…", systemImage: "person.crop.square") { pickingCharacter = true }
        if hasAvatar {
            Button("移除頭像", systemImage: "trash", role: .destructive) { Task { await store.remove() } }
        }
    }
}

/// Pick a character portrait from a series in your collection: series on
/// the left, that series' cast on the right.
struct CharacterPickerSheet: View {
    let session: ServerSession
    let store: AvatarStore
    @Environment(\.dismiss) private var dismiss
    @State private var series: Loadable<[CollectionItem]> = .idle
    @State private var selected: CollectionItem?
    @State private var characters: Loadable<[AnimeCharacter]> = .idle

    private let columns = [GridItem(.adaptive(minimum: 84, maximum: 110), spacing: 12)]

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("用番劇角色做頭像").font(.system(size: 15, weight: .semibold))
                Spacer()
                Button("取消") { dismiss() }.keyboardShortcut(.cancelAction)
            }
            .padding(16)
            Divider()
            HStack(spacing: 0) {
                seriesList.frame(width: 240)
                Divider()
                characterGrid.frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .frame(width: 720, height: 480)
        .task { await loadSeries() }
    }

    @ViewBuilder private var seriesList: some View {
        switch series {
        case let .loaded(items):
            if items.isEmpty {
                EmptyState(symbol: "bookmark", title: String(localized: "收藏是空的"), message: String(localized: "先追幾套番，角色會出現在這裡。"))
            } else {
                List(items, selection: Binding(get: { selected?.id }, set: { id in
                    selected = items.first { $0.id == id }
                    Task { await loadCharacters() }
                })) { item in
                    HStack(spacing: 10) {
                        RemoteImage(url: item.coverImage, maxPixel: 120) { Rectangle().fill(Theme.animeGradient(item.title)) }
                            .frame(width: 28, height: 40)
                            .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                        Text(item.titleZh ?? item.title).font(.system(size: 12)).lineLimit(2)
                    }
                    .tag(item.id)
                }
                .listStyle(.sidebar)
            }
        case let .failed(message):
            ErrorBanner(message: message) { Task { await loadSeries() } }.padding()
        default:
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    @ViewBuilder private var characterGrid: some View {
        if selected == nil {
            Text("先揀一套番").font(.system(size: 13)).foregroundStyle(Theme.Text.tertiary)
        } else {
            switch characters {
            case let .loaded(cast):
                let portraits = cast.filter { $0.character.image != nil }
                if portraits.isEmpty {
                    Text("這套番沒有角色圖片").font(.system(size: 13)).foregroundStyle(Theme.Text.tertiary)
                } else {
                    ScrollView {
                        LazyVGrid(columns: columns, spacing: 12) {
                            ForEach(portraits) { entry in
                                Button {
                                    guard let url = entry.character.image else { return }
                                    Task {
                                        await store.useCharacter(url)
                                        dismiss()
                                    }
                                } label: {
                                    VStack(spacing: 6) {
                                        RemoteImage(url: entry.character.image, maxPixel: 300) { Rectangle().fill(Theme.ink(0.08)) }
                                            .frame(width: 84, height: 84)
                                            .clipShape(Circle())
                                        Text(entry.character.name).font(.system(size: 11)).lineLimit(1)
                                    }
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .disabled(store.busy)
                            }
                        }
                        .padding(16)
                    }
                }
            case let .failed(message):
                ErrorBanner(message: message) { Task { await loadCharacters() } }.padding()
            default:
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }

    private func loadSeries() async {
        series = series.reloading
        series = await series.reloaded { try await session.client.collection() }
    }

    private func loadCharacters() async {
        guard let id = selected?.bangumiID else { return }
        characters = .loading
        characters = await characters.reloaded { try await session.client.animeDetail(bangumiID: id).characters }
    }
}
