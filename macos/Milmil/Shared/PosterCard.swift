import MilmilAPI
import SwiftUI

/// 2:3 poster with the web card's badges; Apple-style restrained hover
/// (250 ms delay → slight lift + Play / Info). Click opens the series.
struct PosterCard: View {
    let title: String
    let cover: URL?
    var score: Double?
    var badge: String?
    var cornerBadge: String?
    var subtitle: String?
    var watchStatus: WatchStatus?
    var width: CGFloat = 150
    var onOpen: (() -> Void)?
    var onPlay: (() -> Void)?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var hovered = false
    @State private var lifted = false
    @State private var hoverTask: Task<Void, Never>?

    private var height: CGFloat { width * 1.5 }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            poster
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.white)
                .lineLimit(1)
                .padding(.top, 8)
            if let subtitle {
                Text(subtitle)
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.Text.tertiary)
                    .lineLimit(1)
                    .padding(.top, 2)
            }
        }
        .frame(width: width)
        .contentShape(Rectangle())
        .onTapGesture { onOpen?() }
        .onHover { inside in
            hovered = inside
            hoverTask?.cancel()
            if inside {
                hoverTask = Task {
                    try? await Task.sleep(for: .milliseconds(250))
                    if !Task.isCancelled { lifted = true }
                }
            } else {
                lifted = false
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(title)
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { onOpen?() }
    }

    private var poster: some View {
        ZStack {
            RemoteImage(url: cover, maxPixel: 600) {
                Rectangle().fill(Theme.animeGradient(title))
                    .overlay(
                        Text(title)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(.white.opacity(0.55))
                            .multilineTextAlignment(.center)
                            .lineLimit(3)
                            .padding(12)
                    )
            }
            .overlay(alignment: .bottom) {
                LinearGradient(colors: [.clear, Color(hex: 0x141416).opacity(0.9)], startPoint: .top, endPoint: .bottom)
                    .frame(height: height * 0.5)
            }
            if let score, score > 0 {
                ScoreBadge(score: score)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                    .padding(6)
            }
            if let badge {
                PillBadge(text: badge, tint: Theme.accent.opacity(0.9))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .padding(6)
            }
            if let watchStatus, watchStatus.isInCollection, watchStatus != .watching {
                PillBadge(text: watchStatus.label, tint: watchStatus.color.opacity(0.85))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .padding(6)
            }
            if let cornerBadge {
                PillBadge(text: cornerBadge)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                    .padding(6)
            }
            if lifted {
                hoverActions
                    .transition(.opacity)
            }
        }
        .frame(width: width, height: height)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(.white.opacity(lifted ? 0.18 : 0.08), lineWidth: 0.5))
        .shadow(color: .black.opacity(lifted ? 0.55 : 0), radius: lifted ? 18 : 0, y: lifted ? 12 : 0)
        .scaleEffect(lifted && !reduceMotion ? 1.04 : 1)
        .offset(y: lifted && !reduceMotion ? -6 : 0)
        .animation(.spring(duration: 0.3, bounce: 0), value: lifted)
        .zIndex(lifted ? 1 : 0)
    }

    private var hoverActions: some View {
        HStack(spacing: 6) {
            if let onPlay {
                Button(action: onPlay) {
                    Image(systemName: "play.fill").font(.system(size: 12, weight: .bold)).foregroundStyle(.black)
                        .frame(width: 32, height: 32).background(.white, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("播放")
            }
            Button {
                onOpen?()
            } label: {
                Image(systemName: "info").font(.system(size: 12, weight: .bold)).foregroundStyle(.white)
                    .frame(width: 32, height: 32).background(.black.opacity(0.55), in: Circle())
                    .overlay(Circle().strokeBorder(.white.opacity(0.15)))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("詳情")
            Spacer()
        }
        .padding(10)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
    }
}

extension PosterCard {
    init(summary: AnimeSummary, width: CGFloat = 150, subtitle: String? = nil, watchStatus: WatchStatus? = nil, onOpen: (() -> Void)? = nil) {
        self.init(
            title: summary.title,
            cover: summary.coverImage,
            score: summary.score,
            badge: nil,
            cornerBadge: summary.episodeCount > 0 ? "\(summary.episodeCount) 集" : nil,
            subtitle: subtitle,
            watchStatus: watchStatus,
            width: width,
            onOpen: onOpen
        )
    }
}

extension WatchStatus {
    var label: String {
        switch self {
        case .none: "無"
        case .watching: "在看"
        case .planning: "想看"
        case .completed: "看過"
        case .paused: "擱置"
        case .dropped: "抛棄"
        }
    }

    var color: Color {
        switch self {
        case .none: .gray
        case .watching: Color(hex: 0x3B82F6)
        case .planning: Color(hex: 0xF59E0B)
        case .completed: Color(hex: 0x22C55E)
        case .paused: Color(hex: 0x71717A)
        case .dropped: Color(hex: 0xEF4444)
        }
    }

    var symbol: String {
        switch self {
        case .none: "bookmark"
        case .watching: "play.circle"
        case .planning: "clock"
        case .completed: "checkmark.circle"
        case .paused: "pause.circle"
        case .dropped: "xmark.circle"
        }
    }
}
