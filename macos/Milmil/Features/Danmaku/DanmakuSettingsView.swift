import MilmilAPI
import SwiftUI

/// All the web's danmaku keys, live-previewed, saved through the shared
/// preferences (2 s debounce to the server).
struct DanmakuSettingsView: View {
    let session: ServerSession
    /// The open player, if any — gets the new pipeline immediately.
    var controller: PlayerController?
    @State private var keywordsText = ""
    @State private var spoilerGuard = DanmakuSpoilerGuard.shared
    @State private var spoilerKeywordsText = ""

    init(session: ServerSession, controller: PlayerController?) {
        self.session = session
        self.controller = controller
    }

    init(controller: PlayerController) {
        self.init(session: controller.session, controller: controller)
    }

    private var prefs: GlobalPreferences { session.preferences }

    var body: some View {
        Form {
            Section("顯示") {
                Toggle("顯示彈幕", isOn: bind(\.danmakuEnabled))
                LabeledContent("透明度") { slider(bind(\.danmakuOpacity), in: 0.1...1, step: 0.05, label: String(format: "%.0f%%", prefs.danmakuOpacity * 100)) }
                LabeledContent("字體大小") { slider(bindInt(\.danmakuFontSize), in: 12...48, step: 1, label: "\(prefs.danmakuFontSize) px") }
                LabeledContent("速度") { slider(bindInt(\.danmakuSpeed), in: 48...400, step: 8, label: "\(prefs.danmakuSpeed) px/s") }
                Picker("密度", selection: bind(\.danmakuDensity)) {
                    Text("低").tag(DanmakuDensity.low)
                    Text("中").tag(DanmakuDensity.medium)
                    Text("高").tag(DanmakuDensity.high)
                }
                Picker("顯示區域", selection: bind(\.danmakuArea)) {
                    Text("1/4").tag(0.25)
                    Text("1/2").tag(0.5)
                    Text("3/4").tag(0.75)
                    Text("全畫面").tag(1.0)
                }
                Toggle("避開字幕區", isOn: bind(\.danmakuAntiSubtitle))
            }
            Section("樣式") {
                Toggle("粗體", isOn: bind(\.danmakuBold))
                Picker("描邊", selection: bind(\.danmakuStroke)) {
                    Text("無").tag(DanmakuStroke.none)
                    Text("陰影").tag(DanmakuStroke.shadow)
                    Text("描邊").tag(DanmakuStroke.stroke)
                }
                TextField("字型（留空用系統字型）", text: Binding(
                    get: { prefs.danmakuFontFamily == "sans-serif" ? "" : prefs.danmakuFontFamily },
                    set: { value in update { $0.danmakuFontFamily = value.isEmpty ? "sans-serif" : value } }
                ))
                ColorPicker(String(localized: "統一顏色"), selection: Binding(
                    get: { Color(hex: UInt32(Int(prefs.danmakuColor.dropFirst(), radix: 16) ?? 0xFFFFFF)) },
                    set: { color in update { $0.danmakuColor = color.hexString } }
                ), supportsOpacity: false)
                Button("還原各自顏色") { update { $0.danmakuColor = "#FFFFFF" } }.disabled(prefs.danmakuColor.uppercased() == "#FFFFFF")
            }
            Section("過濾") {
                Toggle("滾動", isOn: bind(\.danmakuFilterScroll))
                Toggle("頂部", isOn: bind(\.danmakuFilterTop))
                Toggle("底部", isOn: bind(\.danmakuFilterBottom))
                Picker("簡繁轉換", selection: bind(\.danmakuChineseConvert)) {
                    Text("不轉換").tag(ChineseConvert.none)
                    Text("簡 → 繁").tag(ChineseConvert.s2t)
                    Text("繁 → 簡").tag(ChineseConvert.t2s)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text("封鎖關鍵字（每行一個，/regex/ 支援正則）").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                    TextEditor(text: $keywordsText)
                        .font(.system(size: 12))
                        .frame(minHeight: 60, maxHeight: 120)
                        .onChange(of: keywordsText) { _, text in
                            let words = text.split(whereSeparator: \.isNewline).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
                            if words != prefs.danmakuBlockKeywords { update { $0.danmakuBlockKeywords = words } }
                        }
                }
            }
            Section {
                Toggle("防雷模式", isOn: Binding(get: { spoilerGuard.enabled }, set: { spoilerGuard.enabled = $0; controller?.refreshDanmakuPreferences() }))
                if spoilerGuard.enabled {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("劇透關鍵字（每行一個，/regex/ 支援正則）").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                        TextEditor(text: $spoilerKeywordsText)
                            .font(.system(size: 12))
                            .frame(minHeight: 60, maxHeight: 120)
                            .onChange(of: spoilerKeywordsText) { _, text in
                                let words = text.split(whereSeparator: \.isNewline).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
                                if words != spoilerGuard.keywords {
                                    spoilerGuard.keywords = words
                                    controller?.refreshDanmakuPreferences()
                                }
                            }
                        Button("還原預設關鍵字") {
                            spoilerGuard.resetKeywords()
                            spoilerKeywordsText = spoilerGuard.keywords.joined(separator: "\n")
                            controller?.refreshDanmakuPreferences()
                        }
                        .disabled(spoilerGuard.keywords == DanmakuSpoilerGuard.defaultKeywords)
                    }
                    if let hidden = controller?.danmakuStore?.spoilerHidden, hidden > 0 {
                        Text("這集已隱藏 \(hidden) 則疑似劇透").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                    }
                }
            } header: {
                Text("防雷")
            } footer: {
                Text("隱藏提到後面集數（第 N 集 / EPN）或劇透關鍵字的彈幕；只在這部 Mac 生效。").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
            }
        }
        .formStyle(.grouped)
        .onAppear {
            keywordsText = prefs.danmakuBlockKeywords.joined(separator: "\n")
            spoilerKeywordsText = spoilerGuard.keywords.joined(separator: "\n")
            controller?.danmakuStore?.episodeNumber = controller?.episode?.sort
        }
    }

    private func update(_ change: @escaping (inout GlobalPreferences) -> Void) {
        session.updatePreferences(change)
        controller?.refreshDanmakuPreferences()
    }

    private func bind<T: Equatable>(_ keyPath: WritableKeyPath<GlobalPreferences, T>) -> Binding<T> {
        Binding(get: { prefs[keyPath: keyPath] }, set: { value in update { $0[keyPath: keyPath] = value } })
    }

    private func bindInt(_ keyPath: WritableKeyPath<GlobalPreferences, Int>) -> Binding<Double> {
        Binding(get: { Double(prefs[keyPath: keyPath]) }, set: { value in update { $0[keyPath: keyPath] = Int(value.rounded()) } })
    }

    private func slider(_ binding: Binding<Double>, in range: ClosedRange<Double>, step: Double, label: String) -> some View {
        HStack(spacing: 8) {
            Slider(value: binding, in: range, step: step).frame(width: 150)
            Text(label).font(.system(size: 11)).monospacedDigit().foregroundStyle(Theme.Text.tertiary).frame(width: 56, alignment: .trailing)
        }
    }
}

extension Color {
    /// `#RRGGBB` of the sRGB resolution (good enough for a danmaku colour key).
    var hexString: String {
        let resolved = resolve(in: EnvironmentValues())
        let r = Int((resolved.red * 255).rounded()), g = Int((resolved.green * 255).rounded()), b = Int((resolved.blue * 255).rounded())
        return String(format: "#%02X%02X%02X", max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)))
    }
}
