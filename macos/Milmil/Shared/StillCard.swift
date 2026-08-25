import MilmilAPI
import SwiftUI

/// 16:9 "Continue watching" card: still, progress stripe, hover Play + ⋯.
struct StillCard: View {
    let entry: ProgressEntry
    var width: CGFloat = 280
    var onPlay: () -> Void
    var onOpen: () -> Void
    var onRemove: () -> Void
    var onMarkWatched: () -> Void

    @State private var hovered = false

    private var height: CGFloat { width * 9 / 16 }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack {
                RemoteImage(url: entry.animeCoverImage, maxPixel: 800) {
                    Rectangle().fill(Theme.animeGradient(entry.displayTitle))
                }
                LinearGradient(colors: [.clear, Theme.background.opacity(0.8)], startPoint: .init(x: 0.5, y: 0.5), endPoint: .bottom)
                if hovered {
                    Button(action: onPlay) {
                        Image(systemName: "play.fill")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(.black)
                            .frame(width: 40, height: 40)
                            .background(.white.opacity(0.92), in: Circle())
                            .shadow(color: .black.opacity(0.4), radius: 10, y: 6)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("播放")
                    Menu {
                        Button("標記為已看", systemImage: "checkmark.circle", action: onMarkWatched)
                        Button("從繼續觀看移除", systemImage: "xmark.circle", role: .destructive, action: onRemove)
                    } label: {
                        Image(systemName: "ellipsis")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 26, height: 26)
                            .background(.black.opacity(0.55), in: Circle())
                    }
                    .menuStyle(.borderlessButton)
                    .menuIndicator(.hidden)
                    .frame(width: 26, height: 26)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                    .padding(8)
                }
                if let fraction = entry.fraction {
                    ProgressStripe(fraction: fraction)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                }
            }
            .frame(width: width, height: height)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(.white.opacity(hovered ? 0.16 : 0.08), lineWidth: 0.5))
            .animation(.easeOut(duration: 0.15), value: hovered)

            Text(entry.displayTitle)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.ink())
                .lineLimit(1)
                .padding(.top, 8)
            Text(label)
                .font(.system(size: 11))
                .foregroundStyle(Theme.Text.tertiary)
                .padding(.top, 2)
        }
        .frame(width: width)
        .contentShape(Rectangle())
        .onTapGesture(perform: onOpen)
        .onHover { hovered = $0 }
        .contextMenu {
            Button("播放", systemImage: "play.fill", action: onPlay)
            Button("詳情", systemImage: "info.circle", action: onOpen)
            Divider()
            Button("標記為已看", systemImage: "checkmark.circle", action: onMarkWatched)
            Button("從繼續觀看移除", systemImage: "xmark.circle", role: .destructive, action: onRemove)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(entry.displayTitle) \(label)")
    }

    private var label: String {
        let ep = Formatters.episode(entry.episodeNumber)
        if entry.completed { return String(localized: "\(ep) · 已看完") }
        if let remaining = entry.remainingSeconds { return "\(ep) · \(Formatters.remaining(remaining))" }
        return entry.positionSeconds > 0 ? String(localized: "\(ep) · 已開始") : ep
    }
}

/// 3 pt accent progress bar along a card's bottom edge (web: 3px `bg-mm-accent`).
struct ProgressStripe: View {
    let fraction: Double

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Rectangle().fill(.white.opacity(0.12))
                Rectangle().fill(Theme.accent).frame(width: proxy.size.width * fraction)
            }
        }
        .frame(height: 3)
        .accessibilityHidden(true)
    }
}
