import Foundation
import SwiftUI

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
        case .action: String(localized: "動作")
        case .adventure: String(localized: "冒險")
        case .comedy: String(localized: "喜劇")
        case .drama: String(localized: "劇情")
        case .fantasy: String(localized: "奇幻")
        case .mystery: String(localized: "懸疑")
        case .psychological: String(localized: "心理")
        case .romance: String(localized: "戀愛")
        case .sciFi: String(localized: "科幻")
        case .sliceOfLife: String(localized: "日常")
        case .supernatural: String(localized: "超自然")
        case .thriller: String(localized: "驚悚")
        case .horror: String(localized: "恐怖")
        case .sports: String(localized: "運動")
        case .music: String(localized: "音樂")
        case .mecha: String(localized: "機戰")
        case .mahouShoujo: String(localized: "魔法少女")
        case .ecchi: String(localized: "福利")
        }
    }

    /// Translate a genre coming back from the API (AniList English or already Chinese).
    static func label(for raw: String) -> String {
        Genre(rawValue: raw)?.label ?? raw
    }

    var symbol: String {
        switch self {
        case .action: "flame"
        case .adventure: "map"
        case .comedy: "face.smiling"
        case .drama: "theatermasks"
        case .fantasy: "wand.and.stars"
        case .mystery: "magnifyingglass"
        case .psychological: "brain.head.profile"
        case .romance: "heart.fill"
        case .sciFi: "atom"
        case .sliceOfLife: "cup.and.saucer.fill"
        case .supernatural: "sparkles"
        case .thriller: "bolt.fill"
        case .horror: "moon.fill"
        case .sports: "figure.run"
        case .music: "music.note"
        case .mecha: "gearshape.2.fill"
        case .mahouShoujo: "wand.and.rays"
        case .ecchi: "18.circle"
        }
    }

    var tint: Color {
        switch self {
        case .action: Color(hex: 0xEF4444)
        case .adventure: Color(hex: 0xF97316)
        case .comedy: Color(hex: 0xF59E0B)
        case .drama: Color(hex: 0xA855F7)
        case .fantasy: Color(hex: 0x6366F1)
        case .mystery: Color(hex: 0x3B82F6)
        case .psychological: Color(hex: 0x14B8A6)
        case .romance: Color(hex: 0xEC4899)
        case .sciFi: Color(hex: 0x06B6D4)
        case .sliceOfLife: Color(hex: 0x22C55E)
        case .supernatural: Color(hex: 0x8B5CF6)
        case .thriller: Color(hex: 0xF43F5E)
        case .horror: Color(hex: 0x64748B)
        case .sports: Color(hex: 0x10B981)
        case .music: Color(hex: 0x0EA5E9)
        case .mecha: Color(hex: 0x6B7280)
        case .mahouShoujo: Color(hex: 0xD946EF)
        case .ecchi: Color(hex: 0xFB7185)
        }
    }
}

enum Season: String, CaseIterable, Identifiable {
    case winter = "WINTER", spring = "SPRING", summer = "SUMMER", fall = "FALL"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .winter: String(localized: "冬季")
        case .spring: String(localized: "春季")
        case .summer: String(localized: "夏季")
        case .fall: String(localized: "秋季")
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

    /// 5 / 10 / 15 / 20 — the nostalgia offsets on Home (mirrors web).
    static let memoryOffsets = [5, 10, 15, 20]

    /// Same season, `years` years back — "this season, ten years ago".
    static func yearsAgo(_ years: Int, for date: Date = Date()) -> (year: Int, season: Season) {
        let now = current(for: date)
        return (now.year - years, now.season)
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
        case .releasing: String(localized: "放送中")
        case .finished: String(localized: "已完結")
        case .notYetReleased: String(localized: "即將播出")
        }
    }
}
