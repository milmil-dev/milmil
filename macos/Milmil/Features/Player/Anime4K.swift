import Metal
import SwiftUI

/// Anime4K GLSL upscaling (MIT, bloc97 v4.0.1). The shader files are bundled
/// under `Resources/Shaders/Anime4K`; presets follow the project's official
/// "mode A" chains at three sizes, applied through mpv's `glsl-shaders` list.
enum Anime4K {
    enum Preset: String, CaseIterable, Identifiable {
        case off, fast, balanced, quality, custom

        var id: String { rawValue }

        var label: String {
            switch self {
            case .off: String(localized: "關閉")
            case .fast: String(localized: "快速")
            case .balanced: String(localized: "平衡")
            case .quality: String(localized: "高品質")
            case .custom: String(localized: "自訂")
            }
        }
    }

    static let presetKey = "player.anime4k.preset"
    static let customKey = "player.anime4k.custom"

    /// Official upscale+restore (mode A) chains; only the CNN size differs.
    private static let chains: [Preset: [String]] = [
        .fast: [
            "Anime4K_Clamp_Highlights",
            "Anime4K_Restore_CNN_M",
            "Anime4K_Upscale_CNN_x2_M",
            "Anime4K_AutoDownscalePre_x2",
            "Anime4K_AutoDownscalePre_x4",
            "Anime4K_Upscale_CNN_x2_S",
        ],
        .balanced: [
            "Anime4K_Clamp_Highlights",
            "Anime4K_Restore_CNN_L",
            "Anime4K_Upscale_CNN_x2_L",
            "Anime4K_AutoDownscalePre_x2",
            "Anime4K_AutoDownscalePre_x4",
            "Anime4K_Upscale_CNN_x2_M",
        ],
        .quality: [
            "Anime4K_Clamp_Highlights",
            "Anime4K_Restore_CNN_VL",
            "Anime4K_Upscale_CNN_x2_VL",
            "Anime4K_AutoDownscalePre_x2",
            "Anime4K_AutoDownscalePre_x4",
            "Anime4K_Upscale_CNN_x2_M",
        ],
    ]

    static var currentPreset: Preset {
        UserDefaults.standard.string(forKey: presetKey).flatMap(Preset.init(rawValue:)) ?? .off
    }

    static var customPaths: [String] {
        UserDefaults.standard.stringArray(forKey: customKey) ?? []
    }

    /// Absolute shader paths for the active configuration, bundled or custom.
    /// Missing files are dropped so a stale custom entry cannot break playback.
    static func shaderPaths(preset: Preset = currentPreset, custom: [String] = customPaths) -> [String] {
        switch preset {
        case .off:
            return []
        case .custom:
            return custom.filter { FileManager.default.fileExists(atPath: $0) }
        case .fast, .balanced, .quality:
            return (chains[preset] ?? []).compactMap(bundledPath)
        }
    }

    /// Every bundled shader, for the custom-chain picker.
    static var bundledShaders: [String] {
        let urls = Bundle.main.urls(forResourcesWithExtension: "glsl", subdirectory: nil) ?? []
        return urls.map { $0.deletingPathExtension().lastPathComponent }.sorted()
    }

    static func bundledPath(_ name: String) -> String? {
        Bundle.main.path(forResource: name, ofType: "glsl")
    }

    /// A rough per-GPU default: base Apple Silicon handles the fast chain at
    /// 4K; Pro/Max/Ultra parts have headroom for the very-large CNNs.
    static let recommended: Preset = {
        guard let device = MTLCreateSystemDefaultDevice() else { return .fast }
        let name = device.name
        if name.contains("Pro") || name.contains("Max") || name.contains("Ultra") { return .quality }
        return .fast
    }()

    static var gpuName: String {
        MTLCreateSystemDefaultDevice()?.name ?? "GPU"
    }
}
