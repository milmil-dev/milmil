import MilmilDanmaku
import SwiftUI

/// Under the picture on the watch page (the web's `DanmakuBar`): toggle,
/// count, mode / colour pickers and the input. `⌘↩` focuses it.
struct DanmakuComposeBar: View {
    let controller: PlayerController
    @FocusState.Binding var focused: Bool
    @State private var text = ""
    @State private var mode: DanmakuComment.Mode = .scroll
    @State private var colorHex = "#FFFFFF"

    private static let palette = [
        "#FFFFFF", "#FE0302", "#FF7204", "#FFAA02", "#FFD302", "#A0EE00",
        "#00CD00", "#019899", "#4266BE", "#89D5FF", "#CC0273", "#222222",
    ]

    var body: some View {
        let store = controller.danmakuStore
        HStack(spacing: 10) {
            Button {
                controller.setDanmakuEnabled(!controller.danmakuEnabled)
            } label: {
                Image(systemName: controller.danmakuEnabled ? "text.bubble.fill" : "text.bubble")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(controller.danmakuEnabled ? Theme.accent : Theme.Text.tertiary)
            }
            .buttonStyle(.plain)
            .help(controller.danmakuEnabled ? String(localized: "關閉彈幕（D）") : String(localized: "開啟彈幕（D）"))
            Text(store.map { String(localized: "\($0.timeline.count) 條") } ?? "—")
                .font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary).monospacedDigit()
                .frame(minWidth: 44, alignment: .leading)

            Menu {
                Picker("位置", selection: $mode) {
                    Text("滾動").tag(DanmakuComment.Mode.scroll)
                    Text("頂部").tag(DanmakuComment.Mode.top)
                    Text("底部").tag(DanmakuComment.Mode.bottom)
                }
                .pickerStyle(.inline)
                Divider()
                ForEach(Self.palette, id: \.self) { hex in
                    Button {
                        colorHex = hex
                    } label: {
                        Label(hex == "#FFFFFF" ? String(localized: "白色（預設）") : hex, systemImage: colorHex == hex ? "checkmark.circle.fill" : "circle.fill")
                    }
                }
            } label: {
                // Reads as "style": a colour swatch plus the position glyph,
                // with the menu chevron visible so it is discoverable as a
                // menu (a bare ← looked like a back button).
                HStack(spacing: 5) {
                    Circle().fill(Color(hex: UInt32(RGB(hex: colorHex).intValue))).frame(width: 10, height: 10)
                        .overlay(Circle().strokeBorder(.white.opacity(0.3), lineWidth: 0.5))
                    Image(systemName: modeSymbol).font(.system(size: 11, weight: .semibold))
                }
                .padding(.horizontal, 6)
                .frame(height: 24)
            }
            .menuStyle(.borderlessButton).fixedSize()
            .help("彈幕樣式")
            .accessibilityLabel("彈幕樣式")

            TextField(controller.danmakuEnabled ? String(localized: "發個彈幕…（⌘↩ 聚焦）") : String(localized: "開啟彈幕後即可發送"), text: $text)
                .textFieldStyle(.plain)
                .font(.system(size: 12.5))
                .padding(.horizontal, 9).padding(.vertical, 5)
                .background(Theme.ink(0.05), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(Theme.ink(focused ? 0.16 : 0.08)))
                .focused($focused)
                .onSubmit(send)
                .disabled(store == nil)
            Button("發送", action: send)
                .glassButtonStyle()
                .controlSize(.small)
                .disabled(text.trimmingCharacters(in: .whitespaces).isEmpty || store == nil || (store?.isSending ?? false))
            if let error = store?.sendError {
                Text(error).font(.system(size: 11)).foregroundStyle(Color(hex: 0xF87171)).lineLimit(1)
            }
        }
        // 防雷模式 needs the episode number; the store only knows the ID, and
        // this bar is on screen whenever the watch page is.
        .onChange(of: controller.episode?.sort, initial: true) { _, sort in controller.danmakuStore?.episodeNumber = sort }
    }

    private var modeSymbol: String {
        switch mode {
        case .scroll: "text.line.first.and.arrowtriangle.forward"
        case .top: "arrow.up.to.line.compact"
        case .bottom: "arrow.down.to.line.compact"
        }
    }

    private func send() {
        guard let store = controller.danmakuStore, !store.isSending else { return }
        let payload = text
        text = ""
        let time = controller.state.timePos
        let color = RGB(hex: colorHex)
        let sendMode = mode
        Task { await store.send(text: payload, at: time, mode: sendMode, color: color) }
    }
}
