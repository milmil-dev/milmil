import AppKit
import SwiftUI

/// Anime4K 設定: preset picker with a per-GPU suggestion, plus an ordered
/// custom shader chain built from the bundled files or external .glsl files.
/// Changes re-apply to the live player immediately.
struct Anime4KSettingsSection: View {
    @Environment(PlayerCoordinator.self) private var coordinator
    @AppStorage(Anime4K.presetKey) private var presetRaw = Anime4K.Preset.off.rawValue
    @State private var custom: [String] = Anime4K.customPaths
    @ObserveInjection private var inject

    private var preset: Anime4K.Preset { Anime4K.Preset(rawValue: presetRaw) ?? .off }

    var body: some View {
        Picker("升頻預設", selection: $presetRaw) {
            ForEach(Anime4K.Preset.allCases) { preset in
                Text(preset.label).tag(preset.rawValue)
            }
        }
        .onChange(of: presetRaw) { apply() }
        Text("建議：\(Anime4K.recommended.label)（\(Anime4K.gpuName)）；即時生效，只影響這台 Mac。")
            .font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
        if preset == .custom {
            customEditor
        }
    }

    @ViewBuilder
    private var customEditor: some View {
        if custom.isEmpty {
            Text("加入 shader 後由上到下依序套用。").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
        }
        ForEach(Array(custom.enumerated()), id: \.offset) { index, path in
            HStack(spacing: 8) {
                Text("\(index + 1).").font(.system(size: 11)).monospacedDigit().foregroundStyle(Theme.Text.tertiary)
                Text((path as NSString).lastPathComponent)
                    .font(.system(size: 12, design: .monospaced)).lineLimit(1).truncationMode(.middle)
                    .help(path)
                if !FileManager.default.fileExists(atPath: path) {
                    Image(systemName: "exclamationmark.triangle").foregroundStyle(Color(hex: 0xFBBF24))
                        .help("找不到檔案，播放時會略過")
                }
                Spacer()
                Button { move(index, by: -1) } label: { Image(systemName: "chevron.up") }
                    .buttonStyle(.borderless).disabled(index == 0)
                Button { move(index, by: 1) } label: { Image(systemName: "chevron.down") }
                    .buttonStyle(.borderless).disabled(index == custom.count - 1)
                Button { remove(index) } label: { Image(systemName: "minus.circle") }
                    .buttonStyle(.borderless)
            }
        }
        HStack {
            Menu("加入內建 shader") {
                ForEach(Anime4K.bundledShaders, id: \.self) { name in
                    Button(name) {
                        if let path = Anime4K.bundledPath(name) { append(path) }
                    }
                }
            }
            .fixedSize()
            Button("加入檔案…") { pickExternal() }
        }
        .controlSize(.small)
    }

    private func move(_ index: Int, by offset: Int) {
        let target = index + offset
        guard custom.indices.contains(index), custom.indices.contains(target) else { return }
        custom.swapAt(index, target)
        save()
    }

    private func remove(_ index: Int) {
        guard custom.indices.contains(index) else { return }
        custom.remove(at: index)
        save()
    }

    private func append(_ path: String) {
        guard !custom.contains(path) else { return }
        custom.append(path)
        save()
    }

    private func pickExternal() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = true
        panel.allowedContentTypes = [.item]
        panel.message = String(localized: "選擇 mpv GLSL shader（.glsl / .hook）")
        guard panel.runModal() == .OK else { return }
        for url in panel.urls where ["glsl", "hook"].contains(url.pathExtension.lowercased()) {
            if !custom.contains(url.path) { custom.append(url.path) }
        }
        save()
    }

    private func save() {
        UserDefaults.standard.set(custom, forKey: Anime4K.customKey)
        apply()
    }

    private func apply() {
        coordinator.controller?.applyAnime4K()
    }
}
