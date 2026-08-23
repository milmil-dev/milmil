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
                HStack(spacing: 4) {
                    Circle().fill(Color(hex: UInt32(RGB(hex: colorHex).intValue))).frame(width: 10, height: 10)
                        .overlay(Circle().strokeBorder(.white.opacity(0.3), lineWidth: 0.5))
                    Image(systemName: modeSymbol).font(.system(size: 11))
                }
                .frame(width: 40, height: 24)
            }
            .menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize()
            .help("彈幕樣式")

            TextField(controller.danmakuEnabled ? String(localized: "發個彈幕…（⌘↩ 聚焦）") : String(localized: "開啟彈幕後即可發送"), text: $text)
                .textFieldStyle(.plain)
                .font(.system(size: 13))
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background(.white.opacity(0.06), in: Capsule())
                .focused($focused)
                .onSubmit(send)
                .disabled(store == nil)
            Button("發送", action: send)
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
                .disabled(text.trimmingCharacters(in: .whitespaces).isEmpty || store == nil || (store?.isSending ?? false))
            if let error = store?.sendError {
                Text(error).font(.system(size: 11)).foregroundStyle(Color(hex: 0xF87171)).lineLimit(1)
            }
        }
    }

    private var modeSymbol: String {
        switch mode {
        case .scroll: "arrow.left"
        case .top: "arrow.up.to.line"
        case .bottom: "arrow.down.to.line"
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
