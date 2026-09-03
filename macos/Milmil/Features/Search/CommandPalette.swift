import MilmilAPI
import SwiftUI

/// ⌘K: instant search over the library and Bangumi/AniList, plus a few
/// actions. Arrow keys move, Return opens, Esc closes.
struct CommandPalette: View {
    @Environment(ServerSession.self) private var session
    @Environment(Router.self) private var router
    @State private var query = ""
    @State private var local: [LocalSearchHit] = []
    @State private var remote: [AnimeSummary] = []
    @State private var selection = 0
    @State private var searching = false
    @State private var searchTask: Task<Void, Never>?
    @FocusState private var focused: Bool
    @ObserveInjection private var inject

    private enum Row: Identifiable {
        case local(LocalSearchHit)
        case remote(AnimeSummary)
        case action(title: String, symbol: String, run: () -> Void)

        var id: String {
            switch self {
            case let .local(hit): "l-\(hit.id)"
            case let .remote(item): "r-\(item.id)"
            case let .action(title, _, _): "a-\(title)"
            }
        }
    }

    private var rows: [Row] {
        var result: [Row] = local.map(Row.local) + remote.prefix(6).map(Row.remote)
        if query.trimmingCharacters(in: .whitespaces).isEmpty {
            result += [
                .action(title: String(localized: "時刻表"), symbol: "calendar") { router.select(.schedule) },
                .action(title: String(localized: "首頁"), symbol: "house") { router.select(.home) },
                .action(title: String(localized: "收藏"), symbol: "bookmark") { router.select(.collection) },
                .action(title: String(localized: "歷史"), symbol: "clock") { router.select(.history) },
            ]
        } else {
            result.append(.action(title: String(localized: "在搜尋頁開啟「\(query)」"), symbol: "magnifyingglass") { router.openSearch(SearchPrefill(query: query)) })
        }
        return result
    }

    var body: some View {
        ZStack(alignment: .top) {
            Color.black.opacity(0.35).ignoresSafeArea().onTapGesture { router.paletteShown = false }
            VStack(spacing: 0) {
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass").font(.system(size: 16, weight: .semibold)).foregroundStyle(Theme.Text.secondary)
                    TextField("搜尋作品、集數，或輸入指令…", text: $query)
                        .textFieldStyle(.plain)
                        .font(.system(size: 17))
                        .focused($focused)
                        .onSubmit { activate(selection) }
                    Text("esc").font(.system(size: 10, weight: .semibold)).foregroundStyle(Theme.Text.tertiary)
                        .padding(.horizontal, 5).padding(.vertical, 2).background(Theme.ink(0.08), in: RoundedRectangle(cornerRadius: 4))
                }
                .padding(.horizontal, 16).padding(.vertical, 14)
                Divider()
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 2) {
                            ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                                rowView(row, selected: index == selection)
                                    .id(index)
                                    .onTapGesture { activate(index) }
                                    .onHover { if $0 { selection = index } }
                            }
                        }
                        .padding(8)
                    }
                    .frame(maxHeight: 420)
                    .onChange(of: selection) { proxy.scrollTo(selection) }
                }
                Divider()
                HStack(spacing: 14) {
                    hint("↑↓", String(localized: "移動"))
                    hint("↩", String(localized: "開啟"))
                    Spacer()
                    if searching { ProgressView().controlSize(.mini) }
                    Text("媒體庫 + Bangumi 即時搜尋").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
            }
            .frame(width: 640)
            .glassSurface(in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Theme.ink(0.12)))
            .shadow(color: .black.opacity(0.5), radius: 40, y: 20)
            .padding(.top, 80)
        }
        .onAppear { focused = true }
        .onChange(of: query) { schedule() }
        .onKeyPress(.downArrow) { selection = min(selection + 1, max(rows.count - 1, 0)); return .handled }
        .onKeyPress(.upArrow) { selection = max(selection - 1, 0); return .handled }
        .onKeyPress(.escape) { router.paletteShown = false; return .handled }
    }

    private func hint(_ key: String, _ label: String) -> some View {
        HStack(spacing: 4) {
            Text(key)
                .font(.system(size: 10, weight: .semibold))
                .padding(.horizontal, 5).padding(.vertical, 2)
                .background(Theme.ink(0.08), in: RoundedRectangle(cornerRadius: 4))
            Text(label).font(.system(size: 11))
        }
        .foregroundStyle(Theme.Text.tertiary)
    }

    @ViewBuilder
    private func rowView(_ row: Row, selected: Bool) -> some View {
        HStack(spacing: 12) {
            switch row {
            case let .local(hit):
                RoundedRectangle(cornerRadius: 4).fill(Theme.animeGradient(hit.title)).frame(width: 34, height: 48)
                VStack(alignment: .leading, spacing: 2) {
                    Text(hit.title).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                    Text(hit.altTitles.prefix(2).joined(separator: " · ")).font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary).lineLimit(1)
                }
                Spacer()
                Chip(text: String(localized: "媒體庫"), small: true).opacity(0.9)
            case let .remote(item):
                RemoteImage(url: item.coverImage, maxPixel: 120) { Rectangle().fill(Theme.animeGradient(item.title)) }
                    .frame(width: 34, height: 48).clipShape(RoundedRectangle(cornerRadius: 4))
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.title).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                    let meta = [Formatters.season(from: item.airDate), item.episodeCount > 0 ? String(localized: "\(item.episodeCount) 集") : nil]
                    Text(meta.compactMap { $0 }.joined(separator: " · "))
                        .font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                }
                Spacer()
                if item.score > 0 { ScoreBadge(score: item.score) }
            case let .action(title, symbol, _):
                Image(systemName: symbol)
                    .frame(width: 34, height: 34)
                    .background(Theme.ink(0.06), in: RoundedRectangle(cornerRadius: 8))
                    .foregroundStyle(Theme.Text.secondary)
                Text(title).font(.system(size: 13))
                Spacer()
            }
        }
        .padding(.horizontal, 10).padding(.vertical, 6)
        .background(selected ? Theme.ink(0.08) : .clear, in: RoundedRectangle(cornerRadius: 8))
        .contentShape(Rectangle())
    }

    private func schedule() {
        searchTask?.cancel()
        selection = 0
        let text = query.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { local = []; remote = []; return }
        searchTask = Task {
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            searching = true
            async let localHits = (try? session.client.searchLibrary(text, limit: 5)) ?? []
            async let remoteHits = (try? session.client.searchAnime(text)) ?? []
            let (l, r) = await (localHits, remoteHits)
            guard !Task.isCancelled else { return }
            local = l
            remote = r
            searching = false
        }
    }

    private func activate(_ index: Int) {
        guard rows.indices.contains(index) else { return }
        switch rows[index] {
        case let .local(hit):
            if let id = hit.bangumiID { router.openAnime(id) }
        case let .remote(item):
            router.open(item)
        case let .action(_, _, run):
            run()
        }
        router.paletteShown = false
    }
}
