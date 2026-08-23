import AppKit
import MilmilAPI

/// Player actions. Identifiers match the web's `KeyBinding.action` so the
/// shared `preferences.keyboardBindings` can rebind them.
enum PlayerAction: String, CaseIterable {
    case toggle = "playback:toggle"
    case seekBack5 = "playback:seek-backward-5"
    case seekForward5 = "playback:seek-forward-5"
    case seekBack30 = "playback:seek-backward-30"
    case seekForward30 = "playback:seek-forward-30"
    case frameForward = "playback:frame-forward"
    case frameBackward = "playback:frame-backward"
    case speedDown = "playback:speed-down"
    case speedUp = "playback:speed-up"
    case speedReset = "playback:speed-reset"
    case abLoop = "playback:ab-loop"
    case volumeUp = "volume:up"
    case volumeDown = "volume:down"
    case mute = "volume:mute"
    case subtitleToggle = "subtitle:toggle"
    case subtitleNext = "subtitle:next-track"
    case subtitleDelayDecrease = "subtitle:delay-decrease"
    case subtitleDelayIncrease = "subtitle:delay-increase"
    case audioNext = "audio:next-track"
    case fullscreen = "ui:fullscreen"
    case miniPlayer = "ui:pip"
    case help = "ui:help"
    case techInfo = "ui:tech-info"
    case nextEpisode = "ui:next-episode"
    case previousEpisode = "ui:previous-episode"
    case inspector = "ui:inspector"
    case danmakuToggle = "danmaku:toggle"
    case danmakuSettings = "danmaku:settings"
    case danmakuCompose = "danmaku:compose"
    case screenshot = "capture:screenshot"
    case screenshotWithSubs = "capture:screenshot-with-subs"
    case skipSegment = "playback:skip-segment"

    var label: String {
        switch self {
        case .toggle: "播放 / 暫停"
        case .seekBack5: "後退 5 秒"
        case .seekForward5: "前進 5 秒"
        case .seekBack30: "後退 30 秒"
        case .seekForward30: "前進 30 秒"
        case .frameForward: "下一格"
        case .frameBackward: "上一格"
        case .speedDown: "速度 −0.25×"
        case .speedUp: "速度 +0.25×"
        case .speedReset: "重設速度"
        case .abLoop: "A-B 循環"
        case .volumeUp: "音量 +"
        case .volumeDown: "音量 −"
        case .mute: "靜音"
        case .subtitleToggle: "字幕開關"
        case .subtitleNext: "下一個字幕軌"
        case .subtitleDelayDecrease: "字幕延遲 −0.1s"
        case .subtitleDelayIncrease: "字幕延遲 +0.1s"
        case .audioNext: "下一個音軌"
        case .fullscreen: "全螢幕"
        case .miniPlayer: "迷你播放器"
        case .help: "快捷鍵說明"
        case .techInfo: "技術資訊"
        case .nextEpisode: "下一集"
        case .previousEpisode: "上一集"
        case .inspector: "側欄"
        case .danmakuToggle: "彈幕開關"
        case .danmakuSettings: "彈幕設定"
        case .danmakuCompose: "發送彈幕"
        case .screenshot: "截圖"
        case .screenshotWithSubs: "截圖（含字幕）"
        case .skipSegment: "跳過 OP / ED"
        }
    }

    var group: String {
        switch self {
        case .toggle, .seekBack5, .seekForward5, .seekBack30, .seekForward30, .frameForward, .frameBackward,
             .speedDown, .speedUp, .speedReset, .abLoop, .skipSegment: "播放"
        case .volumeUp, .volumeDown, .mute: "音量"
        case .subtitleToggle, .subtitleNext, .subtitleDelayDecrease, .subtitleDelayIncrease, .audioNext: "字幕 / 音訊"
        case .fullscreen, .miniPlayer, .help, .techInfo, .nextEpisode, .previousEpisode, .inspector: "介面"
        case .danmakuToggle, .danmakuSettings, .danmakuCompose: "彈幕"
        case .screenshot, .screenshotWithSubs: "擷取"
        }
    }
}

/// A key chord in the web's representation (`key` is the DOM `KeyboardEvent.key`).
struct KeyChord: Hashable {
    let key: String
    let shift: Bool
    let control: Bool
    let option: Bool
    let command: Bool

    init(key: String, shift: Bool = false, control: Bool = false, option: Bool = false, command: Bool = false) {
        self.key = key
        self.shift = shift
        self.control = control
        self.option = option
        self.command = command
    }

    init(binding: KeyBinding) {
        let modifiers = Set(binding.modifiers ?? [])
        self.init(
            key: binding.key,
            shift: modifiers.contains("shift"),
            control: modifiers.contains("ctrl"),
            option: modifiers.contains("alt"),
            command: modifiers.contains("meta")
        )
    }

    /// Normalise an AppKit event to the DOM key names the web stores.
    init?(event: NSEvent) {
        let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
        let special: [UInt16: String] = [
            123: "ArrowLeft", 124: "ArrowRight", 126: "ArrowUp", 125: "ArrowDown",
            49: " ", 51: "Backspace", 53: "Escape", 36: "Enter", 48: "Tab",
        ]
        let key: String
        if let named = special[event.keyCode] {
            key = named
        } else if let characters = event.charactersIgnoringModifiers, !characters.isEmpty {
            key = characters
        } else {
            return nil
        }
        // "?" needs shift on most layouts; the web stores it without the modifier.
        let shiftIsPartOfKey = key.count == 1 && key != key.lowercased() || key == "?"
        self.init(
            key: key == " " ? " " : (shiftIsPartOfKey ? key : key.lowercased()),
            shift: flags.contains(.shift) && !shiftIsPartOfKey,
            control: flags.contains(.control),
            option: flags.contains(.option),
            command: flags.contains(.command)
        )
    }

    var display: String {
        var parts: [String] = []
        if control { parts.append("⌃") }
        if option { parts.append("⌥") }
        if shift { parts.append("⇧") }
        if command { parts.append("⌘") }
        let name: String = switch key {
        case " ": "Space"
        case "ArrowLeft": "←"
        case "ArrowRight": "→"
        case "ArrowUp": "↑"
        case "ArrowDown": "↓"
        case "Backspace": "⌫"
        case "Escape": "⎋"
        case "Enter": "↩"
        default: key.count == 1 ? key.uppercased() : key
        }
        parts.append(name)
        return parts.joined()
    }
}

/// Default table = web defaults + mpv/desktop extras, overridden by the
/// user's `keyboardBindings` (same action ids, so web rebinds apply here).
struct PlayerKeymap {
    private(set) var bindings: [KeyChord: PlayerAction]

    static let defaults: [(PlayerAction, KeyChord)] = [
        (.toggle, KeyChord(key: " ")),
        (.toggle, KeyChord(key: "k")),
        (.seekBack5, KeyChord(key: "ArrowLeft")),
        (.seekForward5, KeyChord(key: "ArrowRight")),
        (.seekBack30, KeyChord(key: "ArrowLeft", shift: true)),
        (.seekForward30, KeyChord(key: "ArrowRight", shift: true)),
        (.seekBack5, KeyChord(key: "j")),
        (.seekForward5, KeyChord(key: "l", shift: false)),
        (.frameForward, KeyChord(key: ".")),
        (.frameBackward, KeyChord(key: ",")),
        (.speedDown, KeyChord(key: "[")),
        (.speedUp, KeyChord(key: "]")),
        (.speedReset, KeyChord(key: "Backspace")),
        (.abLoop, KeyChord(key: "l", shift: true)),
        (.volumeUp, KeyChord(key: "ArrowUp")),
        (.volumeDown, KeyChord(key: "ArrowDown")),
        (.mute, KeyChord(key: "m")),
        (.subtitleToggle, KeyChord(key: "c")),
        (.subtitleNext, KeyChord(key: "v")),
        (.subtitleDelayDecrease, KeyChord(key: "z")),
        (.subtitleDelayIncrease, KeyChord(key: "x")),
        (.audioNext, KeyChord(key: "b")),
        (.fullscreen, KeyChord(key: "f")),
        (.fullscreen, KeyChord(key: "f", control: true, command: true)),
        (.miniPlayer, KeyChord(key: "p")),
        (.help, KeyChord(key: "?")),
        (.techInfo, KeyChord(key: "i")),
        (.nextEpisode, KeyChord(key: "n")),
        (.previousEpisode, KeyChord(key: "n", shift: true)),
        (.inspector, KeyChord(key: "e")),
        (.danmakuToggle, KeyChord(key: "d")),
        (.danmakuSettings, KeyChord(key: "d", shift: true)),
        (.danmakuCompose, KeyChord(key: "Enter", command: true)),
        (.screenshot, KeyChord(key: "s")),
        (.screenshotWithSubs, KeyChord(key: "s", shift: true)),
        (.skipSegment, KeyChord(key: "Tab")),
    ]

    init(userBindings: [KeyBinding] = []) {
        var table: [KeyChord: PlayerAction] = [:]
        for (action, chord) in Self.defaults { table[chord] = action }
        // A user rebind replaces every default chord of that action.
        let rebound = Set(userBindings.compactMap { PlayerAction(rawValue: $0.action) })
        table = table.filter { !rebound.contains($0.value) }
        for binding in userBindings {
            guard let action = PlayerAction(rawValue: binding.action) else { continue }
            table[KeyChord(binding: binding)] = action
        }
        bindings = table
    }

    func action(for chord: KeyChord) -> PlayerAction? {
        bindings[chord]
    }

    func chords(for action: PlayerAction) -> [KeyChord] {
        bindings.filter { $0.value == action }.map(\.key).sorted { $0.display < $1.display }
    }

    /// Chords bound to more than one action (cannot happen through the
    /// dictionary, but user tables can collide with *each other*).
    static func conflicts(in userBindings: [KeyBinding]) -> [KeyChord] {
        var seen: [KeyChord: Set<String>] = [:]
        for binding in userBindings {
            seen[KeyChord(binding: binding), default: []].insert(binding.action)
        }
        return seen.filter { $0.value.count > 1 }.map(\.key)
    }
}
