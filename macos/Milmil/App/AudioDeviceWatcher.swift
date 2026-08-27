import CoreAudio
import Foundation

/// Watches the system's default output device and its data source. When
/// playback was going to headphones or a Bluetooth / USB headset and that
/// route disappears (unplugged, powered off, walked out of range) the
/// player pauses — the way Music does — instead of carrying on through the
/// speakers.
@MainActor
final class AudioDeviceWatcher {
    /// Fired when the output moved away from a removable route.
    var onRouteLost: (() -> Void)?

    private var device = AudioDeviceID(kAudioObjectUnknown)
    private var wasRemovable = false
    private var deviceListener: AudioObjectPropertyListenerBlock?
    private var sourceListener: AudioObjectPropertyListenerBlock?

    private static var defaultDeviceAddress = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDefaultOutputDevice,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    private static var dataSourceAddress = AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyDataSource,
        mScope: kAudioDevicePropertyScopeOutput,
        mElement: kAudioObjectPropertyElementMain
    )

    func start() {
        guard deviceListener == nil else { return }
        device = Self.defaultOutputDevice()
        wasRemovable = Self.isRemovable(device)
        watchDataSource(of: device)
        let listener: AudioObjectPropertyListenerBlock = { [weak self] _, _ in
            Task { @MainActor in self?.routeChanged() }
        }
        deviceListener = listener
        AudioObjectAddPropertyListenerBlock(AudioObjectID(kAudioObjectSystemObject), &Self.defaultDeviceAddress, .main, listener)
    }

    func stop() {
        if let deviceListener {
            AudioObjectRemovePropertyListenerBlock(AudioObjectID(kAudioObjectSystemObject), &Self.defaultDeviceAddress, .main, deviceListener)
        }
        deviceListener = nil
        unwatchDataSource()
    }

    private func routeChanged() {
        let previousWasRemovable = wasRemovable
        unwatchDataSource()
        device = Self.defaultOutputDevice()
        wasRemovable = Self.isRemovable(device)
        watchDataSource(of: device)
        if previousWasRemovable, !wasRemovable { onRouteLost?() }
    }

    private func watchDataSource(of device: AudioDeviceID) {
        guard device != kAudioObjectUnknown else { return }
        let listener: AudioObjectPropertyListenerBlock = { [weak self] _, _ in
            Task { @MainActor in self?.routeChanged() }
        }
        sourceListener = listener
        AudioObjectAddPropertyListenerBlock(device, &Self.dataSourceAddress, .main, listener)
    }

    private func unwatchDataSource() {
        if let sourceListener, device != kAudioObjectUnknown {
            AudioObjectRemovePropertyListenerBlock(device, &Self.dataSourceAddress, .main, sourceListener)
        }
        sourceListener = nil
    }

    // MARK: CoreAudio queries

    private static func defaultOutputDevice() -> AudioDeviceID {
        var id = AudioDeviceID(kAudioObjectUnknown)
        var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &defaultDeviceAddress, 0, nil, &size, &id)
        return id
    }

    /// Bluetooth / USB transports, or the built-in output with its data
    /// source on the headphone jack.
    static func isRemovable(_ device: AudioDeviceID) -> Bool {
        guard device != kAudioObjectUnknown else { return false }
        switch transportType(device) {
        case kAudioDeviceTransportTypeBluetooth, kAudioDeviceTransportTypeBluetoothLE, kAudioDeviceTransportTypeUSB, kAudioDeviceTransportTypeAirPlay:
            return true
        case kAudioDeviceTransportTypeBuiltIn:
            return dataSource(device) == fourCC("hdpn")
        default:
            return false
        }
    }

    private static func transportType(_ device: AudioDeviceID) -> UInt32 {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyTransportType,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var value: UInt32 = 0
        var size = UInt32(MemoryLayout<UInt32>.size)
        AudioObjectGetPropertyData(device, &address, 0, nil, &size, &value)
        return value
    }

    private static func dataSource(_ device: AudioDeviceID) -> UInt32 {
        var value: UInt32 = 0
        var size = UInt32(MemoryLayout<UInt32>.size)
        AudioObjectGetPropertyData(device, &dataSourceAddress, 0, nil, &size, &value)
        return value
    }

    /// A four-character code (`'hdpn'`) as CoreAudio stores it.
    private static func fourCC(_ code: String) -> UInt32 {
        code.utf8.reduce(0) { ($0 << 8) | UInt32($1) }
    }
}
