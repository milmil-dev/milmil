import Foundation

/// AniList genre ids (what `/discover/browse?genre=` expects) with the
/// Traditional Chinese labels the web client shows.
enum Genre: String, CaseIterable, Identifiable {
    case action = "Action", adventure = "Adventure", comedy = "Comedy", drama = "Drama", fantasy = "Fantasy"
    case mystery = "Mystery", psychological = "Psychological", romance = "Romance", sciFi = "Sci-Fi", sliceOfLife = "Slice of Life"
    case supernatural = "Supernatural", thriller = "Thriller", horror = "Horror", sports = "Sports", music = "Music"
    case mecha = "Mecha", mahouShoujo = "Mahou Shoujo", ecchi = "Ecchi"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .action: "動作"
        case .adventure: "冒險"
        case .comedy: "喜劇"
        case .drama: "劇情"
        case .fantasy: "奇幻"
        case .mystery: "懸疑"
        case .psychological: "心理"
        case .romance: "戀愛"
        case .sciFi: "科幻"
        case .sliceOfLife: "日常"
        case .supernatural: "超自然"
        case .thriller: "驚悚"
        case .horror: "恐怖"
        case .sports: "運動"
        case .music: "音樂"
        case .mecha: "機戰"
        case .mahouShoujo: "魔法少女"
        case .ecchi: "福利"
        }
    }

    /// Translate a genre coming back from the API (AniList English or already Chinese).
    static func label(for raw: String) -> String {
        Genre(rawValue: raw)?.label ?? raw
    }
}

enum Season: String, CaseIterable, Identifiable {
    case winter = "WINTER", spring = "SPRING", summer = "SUMMER", fall = "FALL"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .winter: "冬季"
        case .spring: "春季"
        case .summer: "夏季"
        case .fall: "秋季"
        }
    }

    static func current(for date: Date = Date()) -> (year: Int, season: Season) {
        let components = Calendar(identifier: .gregorian).dateComponents([.year, .month], from: date)
        let season: Season = switch components.month ?? 1 {
        case 1...3: .winter
        case 4...6: .spring
        case 7...9: .summer
        default: .fall
        }
        return (components.year ?? 2026, season)
    }

    var previous: (delta: Int, season: Season) {
        switch self {
        case .winter: (-1, .fall)
        case .spring: (0, .winter)
        case .summer: (0, .spring)
        case .fall: (0, .summer)
        }
    }
}

enum AiringStatus: String, CaseIterable, Identifiable {
    case releasing = "RELEASING", finished = "FINISHED", notYetReleased = "NOT_YET_RELEASED"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .releasing: "放送中"
        case .finished: "已完結"
        case .notYetReleased: "即將播出"
        }
    }
}
