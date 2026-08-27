import AppKit
import MilmilAPI
import SwiftUI

/// Rebind player actions. Bindings are stored in the shared
/// `keyboardBindings` preference with the web's action ids and key names,
/// so a chord changed here applies in the browser too.
struct KeyboardSettingsTab: View {
    let session: ServerSession
    @Environment(PlayerCoordinator.self) private var coordinator
    @State private var recording: PlayerAction?
    @State private var conflict: (chord: KeyChord, other: PlayerAction, action: PlayerAction)?

    private var keymap: PlayerKeymap { PlayerKeymap(userBindings: session.preferences.keyboardBindings) }
    private var groups: [(String, [PlayerAction])] {
        let grouped = Dictionary(grouping: PlayerAction.allCases, by: \.group)
        return PlayerAction.groupOrder.compactMap { title in grouped[title].map { (title, $0) } }
    }

    var body: some View {
        VStack(spacing: 0) {
            List {
                ForEach(groups, id: \.0) { title, actions in
                    Section(title) {
                        ForEach(actions, id: \.self) { action in
                            row(action)
                        }
                    }
                }
            }
            .listStyle(.inset)
            Divider()
            HStack {
                Text(recording.map { String(localized: "按下要綁定到「\($0.label)」的按鍵，Esc 取消") } ?? String(localized: "點「變更」後按下新的按鍵組合。與 web 共用。"))
                    .font(.system(size: 11)).foregroundStyle(recording == nil ? Theme.Text.tertiary : Theme.accent)
                Spacer()
                Button("全部還原預設") {
                    session.updatePreferences { $0.keyboardBindings = [] }
                    coordinator.controller?.refreshKeymap()
                }
                .disabled(session.preferences.keyboardBindings.isEmpty)
            }
            .padding(10)
        }
        .background(KeyRecorder(active: recording != nil) { chord in handle(chord) })
        .alert("按鍵已被使用", isPresented: Binding(get: { conflict != nil }, set: { if !$0 { conflict = nil } })) {
            Button("改為綁定到「\(conflict?.action.label ?? "")」", role: .destructive) {
                if let conflict { assign(conflict.chord, to: conflict.action, unbinding: conflict.other) }
                conflict = nil
            }
            Button("取消", role: .cancel) { conflict = nil }
        } message: {
            Text("\(conflict?.chord.display ?? "") 目前綁定到「\(conflict?.other.label ?? "")」。")
        }
    }

    private func row(_ action: PlayerAction) -> some View {
        let chords = keymap.chords(for: action)
        let isUser = session.preferences.keyboardBindings.contains { $0.action == action.rawValue }
        return HStack {
            Text(action.label).font(.system(size: 13))
            Spacer()
            HStack(spacing: 4) {
                ForEach(chords.prefix(3), id: \.self) { chord in
                    Text(chord.display)
                        .font(.system(size: 11, weight: .semibold, design: .rounded))
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(isUser ? Theme.accent.opacity(0.14) : Theme.ink(0.14), in: RoundedRectangle(cornerRadius: 4))
                }
                if chords.isEmpty { Text("未綁定").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary) }
            }
            Button(recording == action ? String(localized: "按下按鍵…") : String(localized: "變更")) { recording = recording == action ? nil : action }
                .controlSize(.small)
                .tint(recording == action ? Theme.accent : nil)
            if isUser {
                Button { reset(action) } label: { Image(systemName: "arrow.uturn.backward") }
                    .controlSize(.small).help("還原預設")
            }
        }
    }

    private func handle(_ chord: KeyChord?) {
        guard let action = recording else { return }
        recording = nil
        guard let chord else { return }
        if let other = keymap.action(for: chord), other != action {
            conflict = (chord, other, action)
            return
        }
        assign(chord, to: action, unbinding: nil)
    }

    private func assign(_ chord: KeyChord, to action: PlayerAction, unbinding other: PlayerAction?) {
        session.updatePreferences { prefs in
            prefs.keyboardBindings.removeAll { $0.action == action.rawValue }
            if let other {
                // Give the other action an explicit empty rebind so the default chord no longer applies.
                prefs.keyboardBindings.removeAll { $0.action == other.rawValue }
                prefs.keyboardBindings.append(KeyBinding(action: other.rawValue, key: "", modifiers: nil))
            }
            prefs.keyboardBindings.append(chord.binding(for: action))
        }
        coordinator.controller?.refreshKeymap()
    }

    private func reset(_ action: PlayerAction) {
        session.updatePreferences { $0.keyboardBindings.removeAll { $0.action == action.rawValue } }
        coordinator.controller?.refreshKeymap()
    }
}

extension KeyChord {
    /// The web's storage form.
    func binding(for action: PlayerAction) -> KeyBinding {
        var modifiers: [String] = []
        if shift { modifiers.append("shift") }
        if control { modifiers.append("ctrl") }
        if option { modifiers.append("alt") }
        if command { modifiers.append("meta") }
        return KeyBinding(action: action.rawValue, key: key, modifiers: modifiers.isEmpty ? nil : modifiers)
    }
}

/// Captures the next key press while `active`, off the SwiftUI focus system.
private struct KeyRecorder: NSViewRepresentable {
    let active: Bool
    var onChord: (KeyChord?) -> Void

    func makeNSView(context: Context) -> NSView { NSView() }

    func updateNSView(_ nsView: NSView, context: Context) {
        context.coordinator.update(active: active, onChord: onChord)
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    static func dismantleNSView(_ nsView: NSView, coordinator: Coordinator) {
        coordinator.update(active: false, onChord: { _ in })
    }

    @MainActor
    final class Coordinator {
        private var monitor: Any?
        private var onChord: (KeyChord?) -> Void = { _ in }

        func update(active: Bool, onChord: @escaping (KeyChord?) -> Void) {
            self.onChord = onChord
            if active, monitor == nil {
                monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
                    guard let self else { return event }
                    if event.keyCode == 53 { self.onChord(nil); return nil }
                    guard let chord = KeyChord(event: event) else { return event }
                    self.onChord(chord)
                    return nil
                }
            } else if !active, let monitor {
                NSEvent.removeMonitor(monitor)
                self.monitor = nil
            }
        }
    }
}
