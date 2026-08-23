import Foundation

enum Formatters {
    /// "3:07" / "1:02:45" for player timelines.
    static func clock(_ seconds: Double) -> String {
        guard seconds.isFinite, seconds >= 0 else { return "0:00" }
        let total = Int(seconds.rounded(.down))
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let secs = total % 60
        return hours > 0 ? String(format: "%d:%02d:%02d", hours, minutes, secs) : String(format: "%d:%02d", minutes, secs)
    }

    /// "剩 7 分鐘" / "剩 1 小時 12 分鐘" / "剛開始".
    static func remaining(_ seconds: Int) -> String {
        let minutes = Int((Double(seconds) / 60).rounded(.up))
        if minutes <= 0 { return "即將看完" }
        if minutes < 60 { return "剩 \(minutes) 分鐘" }
        return "剩 \(minutes / 60) 小時 \(minutes % 60) 分鐘"
    }

    /// "EP 3" / "EP 12.5".
    static func episode(_ number: Double) -> String {
        number.rounded() == number ? "EP \(Int(number))" : "EP \(number)"
    }

    /// Air time is `HH:mm` in Asia/Tokyo; return "23:00 JST · 本地 22:00".
    static func airTime(_ jst: String) -> String {
        guard let local = localTime(fromJST: jst) else { return "\(jst) JST" }
        return local == jst ? "\(jst) JST" : "\(jst) JST · 本地 \(local)"
    }

    static func localTime(fromJST jst: String) -> String? {
        let parts = jst.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2, let tokyo = TimeZone(identifier: "Asia/Tokyo") else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = tokyo
        var components = calendar.dateComponents(in: tokyo, from: Date())
        components.hour = parts[0]
        components.minute = parts[1]
        components.second = 0
        guard let date = calendar.date(from: components) else { return nil }
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        formatter.timeZone = .current
        return formatter.string(from: date)
    }

    /// `Mon`…`Sun` for today in Asia/Tokyo (the calendar's frame of reference).
    static var todayWeekdayJST: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "Asia/Tokyo")
        formatter.dateFormat = "EEE"
        return formatter.string(from: Date())
    }

    /// "2026 春" from "2026-04-07".
    static func season(from airDate: String?) -> String? {
        guard let airDate, airDate.count >= 7, let year = Int(airDate.prefix(4)), let month = Int(airDate.dropFirst(5).prefix(2)) else { return nil }
        let season = switch month {
        case 1...3: "冬"
        case 4...6: "春"
        case 7...9: "夏"
        default: "秋"
        }
        return "\(year) \(season)"
    }

    static func relative(_ date: Date?) -> String {
        guard let date else { return "" }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}
