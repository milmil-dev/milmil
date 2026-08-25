import SwiftUI

/// Capsule chip (genre, tag, meta). `.on` = accent-tinted.
struct Chip: View {
    let text: String
    var isOn = false
    var small = false

    var body: some View {
        Text(text)
            .font(.system(size: small ? 11 : 12, weight: .medium))
            .lineLimit(1)
            .padding(.horizontal, small ? 8 : 10)
            .padding(.vertical, small ? 3 : 4)
            .background(isOn ? Theme.accent.opacity(0.22) : Theme.ink(0.1), in: Capsule())
            .foregroundStyle(isOn ? Color(hex: 0xD6CCFF) : Theme.Text.secondary)
    }
}

/// "★ 7.1" in the corner of a poster.
struct ScoreBadge: View {
    let score: Double

    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: "star.fill")
                .font(.system(size: 8, weight: .bold))
                .foregroundStyle(Color(hex: 0xFBBF24))
            Text(score, format: .number.precision(.fractionLength(1)))
                .font(.system(size: 10, weight: .bold))
                .monospacedDigit()
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 7)
        .padding(.vertical, 3)
        .background(.black.opacity(0.55), in: Capsule())
    }
}

/// Small pill badge ("EP 4", "13 集").
struct PillBadge: View {
    let text: String
    var tint: Color = .black.opacity(0.55)
    var foreground: Color = .white.opacity(0.9)

    var body: some View {
        Text(text)
            .font(.system(size: 10, weight: .bold))
            .foregroundStyle(foreground)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(tint, in: Capsule())
    }
}

/// Section title row with an optional trailing "See all" link.
struct SectionHeader: View {
    let title: String
    var count: String?
    var moreTitle: String?
    var more: (() -> Void)?

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(Theme.ink())
            if let count {
                Text(count)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.Text.tertiary)
            }
            Spacer()
            if let more, let moreTitle {
                Button(action: more) {
                    HStack(spacing: 2) {
                        Text(moreTitle)
                        Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold))
                    }
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Theme.Text.tertiary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.bottom, 14)
    }
}

/// Centered empty-state block with an SF Symbol and a call to action.
struct EmptyState: View {
    let symbol: String
    let title: String
    let message: String
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: symbol)
                .font(.system(size: 26))
                .foregroundStyle(Theme.accent)
                .frame(width: 56, height: 56)
                .background(Theme.accent.opacity(0.1), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            Text(title)
                .font(.system(size: 15, weight: .bold))
            Text(message)
                .font(.system(size: 12))
                .foregroundStyle(Theme.Text.tertiary)
                .multilineTextAlignment(.center)
                .lineSpacing(3)
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .glassButtonStyle()
                    .padding(.top, 4)
            }
        }
        .padding(24)
        .frame(maxWidth: 360)
    }
}

struct ErrorBanner: View {
    let message: String
    var retry: (() -> Void)?

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.yellow)
            Text(message).font(.system(size: 12, weight: .medium)).lineLimit(2)
            Spacer()
            if let retry {
                Button("重試", action: retry).glassButtonStyle().controlSize(.small)
            }
        }
        .padding(10)
        .background(.yellow.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
    }
}
