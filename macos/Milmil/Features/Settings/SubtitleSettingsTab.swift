import MilmilAPI
import SwiftUI

/// Shared `SubtitleStyle` (same keys as the web) with a live preview;
/// applied to the open player immediately through mpv `sub-*` options.
struct SubtitleSettingsTab: View {
    let session: ServerSession
    @Environment(PlayerCoordinator.self) private var coordinator

    private var style: SubtitleStyle { session.preferences.subtitleStyle }

    var body: some View {
        Form {
            Section {
                preview
            }
            Section("字體") {
                TextField("字型", text: bind(\.fontFamily))
                LabeledContent("大小") {
                    HStack {
                        Slider(value: Binding(get: { Double(style.fontSize) }, set: { value in update { $0.fontSize = Int(value) } }), in: 12...48, step: 1)
                            .frame(width: 180)
                        Text("\(style.fontSize)").monospacedDigit().frame(width: 30, alignment: .trailing)
                    }
                }
                ColorPicker(String(localized: "顏色"), selection: colorBind(\.color), supportsOpacity: false)
            }
            Section("描邊與陰影") {
                Picker("樣式", selection: bind(\.shadowType)) {
                    Text("無").tag("none")
                    Text("描邊").tag("outline")
                    Text("陰影").tag("drop-shadow")
                    Text("浮起").tag("raised")
                    Text("凹陷").tag("depressed")
                }
                LabeledContent("描邊寬度") {
                    Stepper("\(style.strokeWidth)", value: Binding(get: { style.strokeWidth }, set: { value in update { $0.strokeWidth = value } }), in: 0...4)
                }
                ColorPicker(String(localized: "描邊顏色"), selection: colorBind(\.strokeColor), supportsOpacity: false)
            }
            Section("位置") {
                Picker("位置", selection: bind(\.position)) {
                    Text("底部").tag("bottom")
                    Text("置中").tag("center")
                    Text("頂部").tag("top")
                }
                LabeledContent("邊距") {
                    HStack {
                        Slider(
                            value: Binding(get: { Double(style.positionOffset) }, set: { value in update { $0.positionOffset = Int(value) } }),
                            in: 0...40, step: 1
                        )
                        .frame(width: 180)
                        Text("\(style.positionOffset)%").monospacedDigit().frame(width: 40, alignment: .trailing)
                    }
                }
                Toggle("ASS 字幕保留原始樣式", isOn: bind(\.respectAssStyle))
            }
            Section {
                Button("還原預設") { update { $0 = SubtitleStyle() } }
            }
        }
        .formStyle(.grouped)
    }

    private var preview: some View {
        ZStack(alignment: previewAlignment) {
            LinearGradient(colors: [Color(hex: 0x2B2A55), Color(hex: 0x0E0E12)], startPoint: .top, endPoint: .bottom)
            Text("這是字幕預覽 · Subtitle preview")
                .font(.custom(style.fontFamily, size: CGFloat(style.fontSize) * 0.6).weight(.medium))
                .foregroundStyle(Color(hex: hexValue(style.color)))
                .shadow(color: Color(hex: hexValue(style.strokeColor)), radius: style.shadowType == "none" ? 0 : CGFloat(style.strokeWidth) * 0.6)
                .shadow(color: Color(hex: hexValue(style.strokeColor)), radius: style.shadowType == "drop-shadow" ? 3 : 0, x: 1, y: 1)
                .padding(.vertical, CGFloat(style.positionOffset) * 0.3 + 8)
        }
        .frame(height: 120)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private var previewAlignment: Alignment {
        switch style.position {
        case "top": .top
        case "center": .center
        default: .bottom
        }
    }

    private func update(_ change: @escaping (inout SubtitleStyle) -> Void) {
        session.updatePreferences { change(&$0.subtitleStyle) }
        coordinator.controller?.applySubtitleStyle(session.preferences.subtitleStyle)
    }

    private func bind<T: Equatable>(_ keyPath: WritableKeyPath<SubtitleStyle, T>) -> Binding<T> {
        Binding(get: { style[keyPath: keyPath] }, set: { value in update { $0[keyPath: keyPath] = value } })
    }

    private func colorBind(_ keyPath: WritableKeyPath<SubtitleStyle, String>) -> Binding<Color> {
        Binding(get: { Color(hex: hexValue(style[keyPath: keyPath])) }, set: { color in update { $0[keyPath: keyPath] = color.hexString } })
    }

    private func hexValue(_ hex: String) -> UInt32 {
        UInt32(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0xFFFFFF
    }
}
