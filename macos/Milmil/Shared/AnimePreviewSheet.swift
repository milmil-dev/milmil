import MilmilAPI
import SwiftUI

/// Quick look for entries without a detail route (AniList-only, no Bangumi
/// entry): cover, metadata and synopsis, plus the torrent finder as the one
/// useful action. The web's PreviewModal fills the same role.
struct AnimePreviewSheet: View {
    @Environment(ServerSession.self) private var session
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss
    let anime: AnimeSummary

    /// `al-<anilistID>` detail, fetched for the full synopsis.
    @State private var synopsis: String?
    /// Like the web's PreviewModal, ask the server to match the AniList entry
    /// to a Bangumi subject in the background; a hit unlocks the real detail
    /// page that a plain click couldn't reach.
    @State private var resolvedBangumiID: Int?
    @State private var resolving = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 20) {
                PosterCard(title: anime.title, cover: anime.coverImage, score: anime.score > 0 ? anime.score : nil, width: 150)
                    .allowsHitTesting(false)
                VStack(alignment: .leading, spacing: 10) {
                    Text(anime.title)
                        .font(.system(size: 22, weight: .heavy))
                        .tracking(-0.3)
                        .lineLimit(2)
                    if let original = anime.titleOriginal ?? anime.titleEN, original != anime.title {
                        Text(original)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(Theme.Text.tertiary)
                            .lineLimit(1)
                    }
                    HStack(spacing: 8) {
                        if let year = anime.airDate?.prefix(4) { Chip(text: String(year), small: true) }
                        if anime.episodeCount > 0 { Chip(text: String(localized: "\(anime.episodeCount) 集"), small: true) }
                        if let type = anime.mediaType { Chip(text: type, small: true) }
                    }
                    FlowLayout(spacing: 6) {
                        ForEach(anime.genres.prefix(6), id: \.self) { Chip(text: Genre.label(for: $0), small: true) }
                    }
                    ScrollView {
                        Text(description)
                            .font(.system(size: 12.5))
                            .foregroundStyle(Theme.Text.secondary)
                            .lineSpacing(4)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .frame(maxHeight: 150)
                }
            }
            .padding(24)

            Divider().overlay(Theme.ink(0.08))

            HStack {
                statusNote
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.Text.tertiary)
                Spacer()
                if let resolvedBangumiID {
                    Button("詳情") {
                        dismiss()
                        router.openAnime(resolvedBangumiID)
                    }
                    .keyboardShortcut(.defaultAction)
                    .glassProminentButtonStyle()
                }
                Button("找種子") {
                    dismiss()
                    router.findTorrents(for: anime)
                }
                .glassButtonStyle()
                Button("關閉") { dismiss() }
                    .keyboardShortcut(.cancelAction)
                    .glassButtonStyle()
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 14)
        }
        .frame(width: 560)
        .background(Theme.background)
        .task {
            guard anime.description == nil, let anilistID = anime.anilistID else { return }
            let detail = try? await session.client.animeDetail("al-\(anilistID)")
            synopsis = detail?.synopsis ?? detail?.summary.description
        }
        .task {
            guard anime.bangumiID <= 0, let anilistID = anime.anilistID, anilistID > 0 else { return }
            resolving = true
            defer { resolving = false }
            resolvedBangumiID = (try? await session.client.resolveAnilist(anilistID: anilistID)).flatMap { $0 > 0 ? $0 : nil }
        }
    }

    @ViewBuilder
    private var statusNote: some View {
        if resolvedBangumiID != nil {
            Label("已配對 Bangumi 條目", systemImage: "checkmark.circle")
        } else if resolving {
            HStack(spacing: 6) {
                ProgressView().controlSize(.small)
                Text("正在配對 Bangumi 條目…")
            }
        } else {
            Label("此作品尚未有 Bangumi 條目", systemImage: "info.circle")
        }
    }

    private var description: String {
        (anime.description ?? synopsis)?.strippingHTML ?? String(localized: "沒有簡介。")
    }
}

/// Hover popover for `PosterCard`, mirroring the web's HoverDetailCard:
/// blurred banner background, cover thumbnail, title, meta chips, next
/// episode, tags and the synopsis. Detail is fetched on open (like the web)
/// for the tags, vote count, banner and full synopsis.
struct AnimeHoverPreview: View {
    @Environment(ServerSession.self) private var session
    let anime: AnimeSummary

    @State private var detail: AnimeDetail?

    var body: some View {
        HStack(alignment: .top, spacing: 18) {
            RemoteImage(url: anime.coverImage, maxPixel: 400) {
                Rectangle().fill(Theme.animeGradient(anime.title))
            }
            .frame(width: 160, height: 240)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(.white.opacity(0.12)))
            .shadow(color: .black.opacity(0.4), radius: 8, y: 4)

            VStack(alignment: .leading, spacing: 9) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(anime.title)
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(.white)
                        .lineLimit(2)
                    if let original = anime.titleOriginal ?? anime.titleEN, original != anime.title {
                        Text(original)
                            .font(.system(size: 12))
                            .foregroundStyle(.white.opacity(0.4))
                            .lineLimit(1)
                    }
                }

                FlowLayout(spacing: 5) {
                    if let type = anime.mediaType { metaChip(type, emphasized: true) }
                    if let season = seasonLabel { metaChip(season) }
                    if anime.episodeCount > 0 { metaChip(String(localized: "\(anime.episodeCount) 集")) }
                    if anime.score > 0 { scoreChip }
                }

                if let next = anime.nextEpisode, next > 0 {
                    Text("下一集 \(next)")
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.45))
                        .monospacedDigit()
                }

                if !displayTags.isEmpty {
                    FlowLayout(spacing: 4) {
                        ForEach(displayTags.prefix(4), id: \.self) { tag in
                            Text(Genre.label(for: tag))
                                .font(.system(size: 11, weight: .semibold))
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 3))
                                .foregroundStyle(.white.opacity(0.55))
                        }
                        if displayTags.count > 4 {
                            Text("+\(displayTags.count - 4)")
                                .font(.system(size: 11))
                                .foregroundStyle(.white.opacity(0.3))
                        }
                    }
                }

                if let synopsis {
                    Text(synopsis)
                        .font(.system(size: 13.5))
                        .foregroundStyle(.white.opacity(0.45))
                        .lineSpacing(4)
                        .lineLimit(6)
                }
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(18)
        .frame(width: 610, alignment: .leading)
        .background { backgroundArt }
        .task {
            let id = anime.bangumiID > 0 ? String(anime.bangumiID) : anime.anilistID.map { "al-\($0)" }
            guard let id else { return }
            detail = try? await session.client.animeDetail(id)
        }
    }

    /// Banner lightly blurred; cover (no banner) heavily blurred as ambience —
    /// same recipe as the web card. Text over artwork stays literal white.
    private var backgroundArt: some View {
        ZStack {
            let banner = detail?.bannerImage ?? anime.bannerImage
            RemoteImage(url: banner ?? anime.coverImage, maxPixel: 800) {
                Rectangle().fill(Theme.animeGradient(anime.title))
            }
            .scaleEffect(banner == nil ? 1.4 : 1.05)
            .blur(radius: banner == nil ? 24 : 2)
            LinearGradient(
                colors: [.black.opacity(0.5), .black.opacity(0.65), .black.opacity(0.85)],
                startPoint: .top, endPoint: .bottom
            )
        }
        .compositingGroup()
        .clipped()
    }

    private func metaChip(_ text: String, emphasized: Bool = false) -> some View {
        Text(text)
            .font(.system(size: 12, weight: emphasized ? .bold : .medium))
            .monospacedDigit()
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(.white.opacity(emphasized ? 0.1 : 0.07), in: RoundedRectangle(cornerRadius: 3))
            .foregroundStyle(.white.opacity(emphasized ? 0.75 : 0.55))
    }

    private var scoreChip: some View {
        HStack(spacing: 3) {
            Image(systemName: "star.fill").font(.system(size: 10, weight: .bold))
            Text(anime.score, format: .number.precision(.fractionLength(1))).monospacedDigit()
            if let total = detail?.rating.total, total > 0 {
                Text("(\(total))").foregroundStyle(.white.opacity(0.35)).monospacedDigit()
            }
        }
        .font(.system(size: 12, weight: .bold))
        .padding(.horizontal, 7)
        .padding(.vertical, 2)
        .background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 3))
        .foregroundStyle(Color(hex: 0xFBBF24).opacity(0.9))
    }

    /// Bangumi tags once the detail lands; genres as the instant fallback.
    private var displayTags: [String] {
        if let tags = detail?.tags, !tags.isEmpty { return tags }
        return anime.genres
    }

    /// "夏季 2026" from the air date, matching the web's formatSeason.
    private var seasonLabel: String? {
        guard let airDate = anime.airDate, airDate.count >= 7,
              let year = Int(airDate.prefix(4)), let month = Int(airDate.dropFirst(5).prefix(2)) else { return nil }
        let season: Season = switch month {
        case 1...3: .winter
        case 4...6: .spring
        case 7...9: .summer
        default: .fall
        }
        return "\(season.label) \(year)"
    }

    private var synopsis: String? {
        (detail?.synopsis ?? anime.description ?? detail?.summary.description)?.strippingHTML
    }
}
