import Foundation

/// 睡眠計時器: stop after this episode, or after a number of minutes.
enum SleepTimerMode: Hashable, CaseIterable {
    case off
    case endOfEpisode
    case minutes(Int)

    static let allCases: [SleepTimerMode] = [.off, .endOfEpisode, .minutes(15), .minutes(30), .minutes(45), .minutes(60)]

    var label: String {
        switch self {
        case .off: String(localized: "關閉")
        case .endOfEpisode: String(localized: "播完這集停止")
        case let .minutes(minutes): String(localized: "\(minutes) 分鐘後停")
        }
    }

    /// The next mode when cycling from the keyboard.
    var next: SleepTimerMode {
        let all = Self.allCases
        guard let index = all.firstIndex(of: self) else { return .off }
        return all[(index + 1) % all.count]
    }
}
