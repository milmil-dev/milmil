import AppKit
import SwiftUI

/// Owns the NSStatusItem + popover for the 選單列 extra. Managed by hand:
/// SwiftUI's `MenuBarExtra(isInserted:)` spins its KVO update loop at 100%
/// CPU on macOS 26, and `@SceneBuilder` cannot express a conditional scene.
@Observable
final class MenuBarController {
    private var statusItem: NSStatusItem?
    private var popover: NSPopover?
    private weak var player: PlayerCoordinator?

    var isEnabled: Bool {
        get { UserDefaults.standard.object(forKey: DesktopDefaults.menuBarExtra) as? Bool ?? true }
        set {
            UserDefaults.standard.set(newValue, forKey: DesktopDefaults.menuBarExtra)
            if newValue { install() } else { remove() }
        }
    }

    func attach(player: PlayerCoordinator) {
        self.player = player
        if isEnabled { install() }
    }

    private func install() {
        guard statusItem == nil, let player else { return }
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = NSImage(systemSymbolName: "sparkles.tv", accessibilityDescription: "milmil")
        item.button?.target = self
        item.button?.action = #selector(togglePopover(_:))
        statusItem = item

        let popover = NSPopover()
        popover.behavior = .transient
        popover.contentViewController = NSHostingController(rootView: MenuBarExtraView().environment(player))
        self.popover = popover
    }

    private func remove() {
        popover?.performClose(nil)
        popover = nil
        if let statusItem { NSStatusBar.system.removeStatusItem(statusItem) }
        statusItem = nil
    }

    @objc private func togglePopover(_ sender: NSStatusBarButton) {
        guard let popover else { return }
        if popover.isShown {
            popover.performClose(sender)
        } else {
            popover.show(relativeTo: sender.bounds, of: sender, preferredEdge: .minY)
            popover.contentViewController?.view.window?.makeKey()
        }
    }
}
