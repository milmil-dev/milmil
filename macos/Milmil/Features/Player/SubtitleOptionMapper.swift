import Foundation
import MilmilAPI

/// Web `SubtitleStyle` (shared preferences) → mpv `sub-*` properties.
enum SubtitleOptionMapper {
    static func options(for style: SubtitleStyle) -> [(String, String)] {
        var rows: [(String, String)] = [
            ("sub-font", style.fontFamily.isEmpty ? "sans-serif" : style.fontFamily),
            ("sub-font-size", String(max(12, min(96, style.fontSize * 2)))),
            ("sub-color", mpvColor(style.color, alpha: 1)),
            ("sub-border-size", String(style.strokeWidth)),
            ("sub-border-color", mpvColor(style.strokeColor, alpha: 1)),
            ("sub-ass-override", style.respectAssStyle ? "no" : "force"),
            ("sub-margin-y", String(Int(Double(style.positionOffset) * 0.5 + Double(style.safeMargin)))),
        ]
        switch style.shadowType {
        case "drop-shadow":
            rows.append(("sub-shadow-offset", "2"))
            rows.append(("sub-shadow-color", mpvColor(style.strokeColor, alpha: 0.8)))
        case "none":
            rows.append(("sub-border-size", "0"))
            rows.append(("sub-shadow-offset", "0"))
        default:
            rows.append(("sub-shadow-offset", "0"))
        }
        if style.backgroundOpacity > 0, style.shadowType == "box" {
            rows.append(("sub-back-color", mpvColor(style.backgroundColor, alpha: style.backgroundOpacity)))
        } else {
            rows.append(("sub-back-color", "#00000000"))
        }
        // sub-pos: 0 = top, 100 = bottom.
        let pos = switch style.position {
        case "top": 5
        case "center": 50
        default: 100 - min(90, style.positionOffset)
        }
        rows.append(("sub-pos", String(pos)))
        return rows
    }

    /// `#RRGGBB` → mpv `#AARRGGBB`.
    static func mpvColor(_ hex: String, alpha: Double) -> String {
        var digits = hex.trimmingCharacters(in: .whitespaces)
        if digits.hasPrefix("#") { digits.removeFirst() }
        guard digits.count == 6, UInt32(digits, radix: 16) != nil else { return "#FFFFFFFF" }
        let alphaByte = UInt8(max(0, min(255, (alpha * 255).rounded())))
        return String(format: "#%02X%@", alphaByte, digits.uppercased())
    }
}
