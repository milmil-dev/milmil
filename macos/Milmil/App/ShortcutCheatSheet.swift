import AppKit
import SwiftUI

/// Hold ⌘ for a second and the shortcuts of the moment fade in, iPad-style;
/// let go and they leave. The table mirrors `AppCommands` (the menus are the
/// source of truth; this is the glanceable copy) — player rows only show
/// while something is loaded.
@MainActor
@Observable
final class ShortcutCheatSheet {
    static let shared = ShortcutCheatSheet()

    private(set) var shown = false
    private var monitor: Any?
    private var holdTask: Task<Void, Never>?

    static let holdSeconds = 1.0

    func install() {
        guard monitor == nil else { return }
        monitor = NSEvent.addLocalMonitorForEvents(matching: [.flagsChanged, .keyDown]) { [weak self] event in
            // NSEvent is not Sendable; only its scalars cross into the actor.
            let isKeyDown = event.type == .keyDown
            let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
            MainActor.assumeIsolated { self?.handle(isKeyDown: isKeyDown, flags: flags) }
            return event
        }
    }

    private func handle(isKeyDown: Bool, flags: NSEvent.ModifierFlags) {
        if isKeyDown {
            cancel()
            return
        }
        // ⌘ alone, freshly pressed: start the hold; anything else ends it.
        if flags == [.command] {
            holdTask?.cancel()
            holdTask = Task { [weak self] in
                try? await Task.sleep(for: .seconds(Self.holdSeconds))
                guard !Task.isCancelled else { return }
                self?.shown = true
            }
        } else {
            cancel()
        }
    }

    private func cancel() {
        holdTask?.cancel()
        holdTask = nil
        shown = false
    }

    struct Row: Identifiable {
        let keys: String
        let label: String
        var id: String { keys + label }
    }

    struct Group: Identifiable {
        let title: String
        let rows: [Row]
        var id: String { title }
    }

    static var globalGroups: [Group] {
        [
            Group(title: String(localized: "檔案"), rows: [
                Row(keys: "⌘N", label: String(localized: "新增下載…")),
                Row(keys: "⌘O", label: String(localized: "匯入種子檔案…")),
                Row(keys: "⇧⌘O", label: String(localized: "開啟 URL…")),
            ]),
            Group(title: String(localized: "顯示"), rows: [
                Row(keys: "⌘K", label: String(localized: "快速搜尋…")),
                Row(keys: "⌘[", label: String(localized: "返回")),
                Row(keys: "⇧⌘T", label: String(localized: "劇院模式")),
                Row(keys: "⌘1 – ⌘9", label: String(localized: "前往側欄分頁")),
                Row(keys: "⌘,", label: String(localized: "設定")),
            ]),
            Group(title: String(localized: "視窗"), rows: [
                Row(keys: "⌘0", label: String(localized: "主視窗")),
                Row(keys: "⇧⌘F", label: String(localized: "播放器全螢幕")),
                Row(keys: "⇧⌘M", label: String(localized: "迷你播放器")),
                Row(keys: "⇧⌘I", label: String(localized: "播放器側欄")),
            ]),
        ]
    }

    static var playerGroups: [Group] {
        [
            Group(title: String(localized: "播放"), rows: [
                Row(keys: "⌥⌘P", label: String(localized: "播放 / 暫停")),
                Row(keys: "⌥⌘← / →", label: String(localized: "後退 / 前進 5 秒")),
                Row(keys: "⌥⇧⌘← / →", label: String(localized: "後退 / 前進 30 秒")),
                Row(keys: "⌥⌘S", label: String(localized: "跳過 OP / ED")),
                Row(keys: "⌃⌘← / →", label: String(localized: "上一集 / 下一集")),
                Row(keys: "⌥⌘L", label: String(localized: "A-B 循環")),
            ]),
            Group(title: String(localized: "聲音與畫面"), rows: [
                Row(keys: "⌥⌘[ / ]", label: String(localized: "速度 −0.25× / +0.25×")),
                Row(keys: "⌥⌘0", label: String(localized: "重設速度")),
                Row(keys: "⌥⌘↑ / ↓", label: String(localized: "音量 + / −")),
                Row(keys: "⌥⌘M", label: String(localized: "靜音")),
                Row(keys: "⌥⌘V", label: String(localized: "顯示字幕")),
                Row(keys: "⌥⌘D", label: String(localized: "顯示彈幕")),
                Row(keys: "⌥⌘C", label: String(localized: "截圖到剪貼簿")),
            ]),
        ]
    }
}

/// The overlay: two or three columns of key caps and labels on a dimmed
/// glass sheet, centred over the window.
struct ShortcutCheatSheetView: View {
    let playerActive: Bool

    var body: some View {
        let groups = ShortcutCheatSheet.globalGroups + (playerActive ? ShortcutCheatSheet.playerGroups : [])
        VStack(spacing: 14) {
            Text("按住 ⌘ 顯示快捷鍵")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.Text.tertiary)
            HStack(alignment: .top, spacing: 28) {
                ForEach(groups) { group in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(group.title).font(.system(size: 12, weight: .bold)).foregroundStyle(Theme.Text.secondary)
                        ForEach(group.rows) { row in
                            HStack(spacing: 10) {
                                Text(row.keys)
                                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                                    .monospacedDigit()
                                    .padding(.horizontal, 7).padding(.vertical, 3)
                                    .background(Theme.ink(0.1), in: RoundedRectangle(cornerRadius: 5, style: .continuous))
                                    .frame(minWidth: 86, alignment: .leading)
                                Text(row.label).font(.system(size: 12)).foregroundStyle(Theme.Text.primary)
                            }
                        }
                    }
                }
            }
        }
        .padding(24)
        .glassSurface(in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(.white.opacity(0.1), lineWidth: 0.5))
        .shadow(color: .black.opacity(0.35), radius: 24, y: 10)
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.black.opacity(0.25))
        .allowsHitTesting(false)
        .transition(.opacity.combined(with: .scale(0.98)))
    }
}
