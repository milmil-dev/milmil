import MilmilDanmaku
import SwiftUI

/// Inspector「彈幕」: time-sorted list that follows the playhead, click to
/// seek, search, right-click to block a word.
struct DanmakuListTab: View {
    let controller: PlayerController
    @State private var query = ""
    @State private var follow = true

    var body: some View {
        let store = controller.danmakuStore
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                TextField("搜尋彈幕…", text: $query).textFieldStyle(.roundedBorder).controlSize(.small)
                Toggle("跟隨", isOn: $follow).toggleStyle(.checkbox).controlSize(.small)
            }
            .padding(10)
            if let store, !store.dandanplay.isEmpty {
                // Source credit the open network's terms ask for, in full.
                Text("彈幕來源：弹弹play开放弹幕网络")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.Text.tertiary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 10)
                    .padding(.bottom, 8)
            }
            if let hidden = store?.spoilerHidden, hidden > 0 {
                // 防雷模式 at work; quiet, so it reads as reassurance, not a warning.
                Label(String(localized: "已隱藏 \(hidden) 則疑似劇透"), systemImage: "eye.slash")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.Text.tertiary)
                    .padding(.horizontal, 10)
                    .padding(.bottom, 8)
            }
            if let store {
                if store.isLoading, store.timeline.isEmpty {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if store.timeline.isEmpty {
                    EmptyState(
                        symbol: "text.bubble",
                        title: String(localized: "這集還沒有彈幕"),
                        message: store.loadError ?? String(localized: "可以在「彈幕 › 來源」從 Bilibili 匯入，或直接發一條。")
                    )
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    list(store)
                }
            } else {
                EmptyState(symbol: "text.bubble", title: String(localized: "彈幕"), message: String(localized: "開始播放後載入。"))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        // The store only knows the episode ID; 防雷模式 needs the number.
        .onChange(of: controller.episode?.sort, initial: true) { _, sort in controller.danmakuStore?.episodeNumber = sort }
    }

    private func list(_ store: DanmakuStore) -> some View {
        let comments = filtered(store.timeline.comments)
        let currentIndex = store.timeline.index(atOrAfter: controller.state.timePos)
        let currentID = currentIndex > 0 ? store.timeline.comments[currentIndex - 1].id : nil
        return ScrollViewReader { proxy in
            List(comments) { comment in
                DanmakuRow(comment: comment, isCurrent: comment.id == currentID) {
                    controller.seek(to: comment.time)
                } block: {
                    blockKeyword(comment.text)
                }
                .listRowBackground(comment.id == currentID ? Theme.accent.opacity(0.12) : Color.clear)
                .id(comment.id)
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .onChange(of: currentID) { _, id in
                guard follow, query.isEmpty, let id else { return }
                proxy.scrollTo(id, anchor: .center)
            }
        }
    }

    private func filtered(_ comments: [DanmakuComment]) -> [DanmakuComment] {
        let needle = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !needle.isEmpty else { return comments }
        return comments.filter { $0.text.lowercased().contains(needle) }
    }

    private func blockKeyword(_ text: String) {
        controller.session.updatePreferences { prefs in
            let word = String(text.prefix(24))
            if !prefs.danmakuBlockKeywords.contains(word) { prefs.danmakuBlockKeywords.append(word) }
        }
        controller.danmakuStore?.apply(preferences: controller.session.preferences)
    }
}

private struct DanmakuRow: View {
    let comment: DanmakuComment
    let isCurrent: Bool
    var seek: () -> Void
    var block: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Text(Formatters.clock(comment.time))
                .font(.system(size: 11, weight: .medium)).monospacedDigit()
                .foregroundStyle(isCurrent ? Theme.accent : Theme.Text.tertiary)
                .frame(width: 44, alignment: .leading)
            Text(comment.text)
                .font(.system(size: 12))
                .foregroundStyle(Color(hex: UInt32(comment.color.intValue)).opacity(0.95))
                .lineLimit(3)
            Spacer(minLength: 0)
            if case .dandanplay = comment.source {} else {
                Text(comment.sourceLabel).font(.system(size: 9, weight: .bold))
                    .padding(.horizontal, 5).padding(.vertical, 2)
                    .background(.white.opacity(0.1), in: Capsule())
                    .foregroundStyle(Theme.Text.tertiary)
            }
        }
        .padding(.vertical, 2)
        .contentShape(Rectangle())
        .onTapGesture(perform: seek)
        .contextMenu {
            Button("跳到這裡", systemImage: "play", action: seek)
            Button("複製", systemImage: "doc.on.doc") {
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(comment.text, forType: .string)
            }
            Divider()
            Button("加入封鎖詞", systemImage: "hand.raised", action: block)
        }
    }
}

/// Inspector「彈幕來源」: search first (source menu + query, mirroring the
/// list tab's toolbar), then one scrolling area that holds what has been
/// imported and what the search found — or an empty state that says what
/// the pane is for, instead of a void under two headings.
struct DanmakuSourcesTab: View {
    let controller: PlayerController
    @State private var source = ""
    @State private var query = ""
    @State private var selected: DanmakuSearchResult?
    @State private var toast: String?

    var body: some View {
        let store = controller.danmakuStore
        VStack(spacing: 0) {
            if let store {
                searchRow(store)
                if let error = store.sourceError {
                    Label(error, systemImage: "exclamationmark.triangle")
                        .font(.system(size: 11))
                        .foregroundStyle(Color(hex: 0xF87171))
                        .lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                }
                if store.imported.isEmpty, store.searchResults.isEmpty {
                    if store.sourceBusy {
                        ProgressView().controlSize(.small).frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else {
                        EmptyState(
                            symbol: "square.and.arrow.down",
                            title: String(localized: "從外部來源匯入彈幕"),
                            message: String(localized: "選擇來源、搜尋標題並匯入；匯入的彈幕會與現有彈幕一起顯示。")
                        )
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                } else {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 6) {
                            if !store.imported.isEmpty {
                                sectionHeader(String(localized: "已匯入"))
                                importedRows(store)
                            }
                            if !store.searchResults.isEmpty {
                                sectionHeader(String(localized: "搜尋結果"))
                                    .padding(.top, store.imported.isEmpty ? 0 : 10)
                                resultRows(store)
                            }
                        }
                        .padding(12)
                    }
                }
            } else {
                EmptyState(symbol: "square.and.arrow.down", title: String(localized: "彈幕來源"), message: String(localized: "開始播放後可匯入。"))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .task(id: store?.episodeID) {
            guard let store else { return }
            if store.sources.isEmpty { await store.loadSources() }
            if source.isEmpty { source = store.sources.first?.name ?? "bilibili" }
            if query.isEmpty { query = defaultQuery }
        }
        .overlay(alignment: .bottom) {
            if let toast {
                Text(toast).font(.system(size: 12, weight: .medium))
                    .padding(.horizontal, 12).padding(.vertical, 7)
                    .background(.ultraThinMaterial, in: Capsule())
                    .padding(.bottom, 12)
                    .transition(.opacity)
            }
        }
    }

    private var defaultQuery: String {
        let title = controller.request?.title ?? ""
        if let number = controller.episode?.number { return String(localized: "\(title) 第\(number)話") }
        return title
    }

    private func searchRow(_ store: DanmakuStore) -> some View {
        HStack(spacing: 8) {
            Picker("", selection: $source) {
                ForEach(store.sources) { Text($0.label).tag($0.name) }
                if store.sources.isEmpty { Text("Bilibili").tag("bilibili") }
            }
            .labelsHidden()
            .fixedSize()
            TextField("標題 第N話", text: $query)
                .textFieldStyle(.roundedBorder)
                .onSubmit { Task { await store.search(source: source, query: query) } }
            if store.sourceBusy {
                ProgressView().controlSize(.small)
            } else {
                Button {
                    Task { await store.search(source: source, query: query) }
                } label: {
                    Image(systemName: "magnifyingglass")
                }
                .disabled(query.trimmingCharacters(in: .whitespaces).isEmpty)
                .help("搜尋")
            }
        }
        .controlSize(.small)
        .padding(10)
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(Theme.Text.tertiary)
            .padding(.bottom, 2)
    }

    private func importedRows(_ store: DanmakuStore) -> some View {
        ForEach(store.imported, id: \.source) { row in
            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(row.source.capitalized).font(.system(size: 12, weight: .semibold))
                    Text("\(row.count) 條").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                }
                Spacer()
                Toggle("保存", isOn: Binding(get: { row.saved }, set: { on in Task { await store.toggleSave(source: row.source, save: on) } }))
                    .toggleStyle(.switch).controlSize(.mini).help("保存到伺服器，下次自動載入")
                Button { Task { await store.removeImported(source: row.source) } } label: { Image(systemName: "trash") }
                    .buttonStyle(.plain).foregroundStyle(Theme.Text.tertiary).help("移除")
            }
            .padding(10)
            .background(Theme.ink(0.04), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
    }

    private func resultRows(_ store: DanmakuStore) -> some View {
        ForEach(store.searchResults) { result in
            let expanded = selected?.id == result.id
            VStack(alignment: .leading, spacing: 6) {
                Button {
                    selected = expanded ? nil : result
                    if !expanded { Task { await store.loadParts(source: source, videoID: result.videoId) } }
                } label: {
                    HStack(spacing: 8) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(result.title).font(.system(size: 12, weight: .medium)).lineLimit(2)
                            Text("\(result.danmakuCount ?? 0) 條 · \(result.duration ?? "")").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(Theme.Text.tertiary)
                            .rotationEffect(.degrees(expanded ? 90 : 0))
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                if expanded {
                    if store.parts.isEmpty {
                        importButton(store, videoID: result.videoId, part: 0, title: String(localized: "匯入"))
                    } else {
                        ForEach(store.parts) { part in
                            importButton(store, videoID: result.videoId, part: part.index, title: "P\(part.index + 1) \(part.title ?? "")")
                        }
                    }
                }
            }
            .padding(8)
            .background(Theme.ink(expanded ? 0.06 : 0.03), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .animation(.easeOut(duration: 0.15), value: expanded)
        }
    }

    private func importButton(_ store: DanmakuStore, videoID: String, part: Int, title: String) -> some View {
        Button {
            Task {
                if let count = await store.importExternal(source: source, videoID: videoID, partIndex: part) {
                    showToast(String(localized: "已匯入 \(count) 條"))
                }
            }
        } label: {
            Label(title, systemImage: "square.and.arrow.down").font(.system(size: 11)).lineLimit(1)
        }
        .glassButtonStyle().controlSize(.small)
        .disabled(store.sourceBusy)
    }

    private func showToast(_ text: String) {
        withAnimation { toast = text }
        Task {
            try? await Task.sleep(for: .seconds(2))
            withAnimation { toast = nil }
        }
    }
}
