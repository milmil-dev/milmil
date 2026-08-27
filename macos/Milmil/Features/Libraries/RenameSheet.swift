import MilmilAPI
import SwiftUI

/// 重新命名: Go-template rename config, dry-run preview, apply, and the
/// batch history with undo — the desktop version of the web's rename pages.
struct RenameSheet: View {
    let library: Library
    let client: APIClient
    var onChanged: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var template: String
    @State private var auto: Bool
    @State private var savingConfig = false
    @State private var plans: Loadable<[RenamePlan]> = .idle
    @State private var applying = false
    @State private var history: Loadable<[RenameBatch]> = .idle
    @State private var confirmApply = false
    @State private var confirmUndo: RenameBatch?
    @State private var toast: String?
    @ObserveInjection private var inject

    static let placeholderTemplate = "{{.Title}} ({{.Year}})/S{{pad .Season 2}}E{{pad .EpisodeNumber 2}}.{{.Ext}}"

    init(library: Library, client: APIClient, onChanged: @escaping () async -> Void) {
        self.library = library
        self.client = client
        self.onChanged = onChanged
        _template = State(initialValue: library.renameTemplate)
        _auto = State(initialValue: library.renameAuto)
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("重新命名").font(.system(size: 16, weight: .bold))
                Spacer()
                Button("完成") { dismiss() }.keyboardShortcut(.cancelAction)
            }
            .padding(.horizontal, 20).padding(.vertical, 14)
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    configSection
                    previewSection
                    historySection
                }
                .padding(20)
            }
        }
        .frame(width: 680, height: 620)
        .task { await loadHistory() }
        .overlay(alignment: .bottom) { ToastLabel(text: $toast) }
        .confirmationDialog(
            String(localized: "套用 \(applicablePlans.count) 個重新命名？"),
            isPresented: $confirmApply, titleVisibility: .visible
        ) {
            Button("重新命名檔案") { Task { await apply() } }
        } message: {
            Text("檔案會在磁碟上改名；之後可從歷史一鍵復原。")
        }
        .confirmationDialog(
            String(localized: "復原這批重新命名（\(confirmUndo?.rowCount ?? 0) 個檔案）？"),
            isPresented: Binding(get: { confirmUndo != nil }, set: { if !$0 { confirmUndo = nil } }),
            titleVisibility: .visible
        ) {
            Button("復原") {
                if let batch = confirmUndo { Task { await undo(batch) } }
                confirmUndo = nil
            }
        }
    }

    // MARK: - Config

    private var configSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("命名範本").font(.system(size: 13, weight: .semibold))
            TextEditor(text: $template)
                .font(.system(size: 12, design: .monospaced))
                .frame(height: 56)
                .scrollContentBackground(.hidden)
                .padding(8)
                .background(Theme.ink(0.05), in: RoundedRectangle(cornerRadius: 8))
                .overlay(alignment: .topLeading) {
                    if template.isEmpty {
                        Text(verbatim: Self.placeholderTemplate)
                            .font(.system(size: 12, design: .monospaced))
                            .foregroundStyle(Theme.Text.tertiary)
                            .padding(.top, 8).padding(.leading, 13)
                            .allowsHitTesting(false)
                    }
                }
            Text("可用欄位：{{.Title}}、{{.Year}}、{{.Season}}、{{.EpisodeNumber}}、{{.EpisodeTitle}}、{{.Subgroup}}、{{.Resolution}}、{{.Ext}}；{{pad … 2}} 補零。")
                .font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
            HStack {
                Toggle("匹配後自動重新命名", isOn: $auto)
                Spacer()
                Button(savingConfig ? String(localized: "儲存中…") : String(localized: "儲存設定")) { Task { await saveConfig() } }
                    .disabled(savingConfig)
                Button("預覽") { Task { await preview() } }
                    .glassProminentButtonStyle()
                    .disabled(template.trimmingCharacters(in: .whitespaces).isEmpty || plans.isLoading)
            }
        }
    }

    // MARK: - Preview

    private var applicablePlans: [RenamePlan] { plans.value?.filter(\.isApplicable) ?? [] }

    @ViewBuilder
    private var previewSection: some View {
        switch plans {
        case .idle:
            EmptyView()
        case .loading:
            ProgressView().frame(maxWidth: .infinity)
        case let .failed(message):
            ErrorBanner(message: message) { Task { await preview() } }
        case let .loaded(list) where list.isEmpty:
            Text("沒有需要重新命名的檔案。").font(.system(size: 12)).foregroundStyle(Theme.Text.tertiary)
        case let .loaded(list):
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("預覽").font(.system(size: 13, weight: .semibold))
                    Text("\(applicablePlans.count)/\(list.count) 可套用").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                    Spacer()
                    Button(applying ? String(localized: "套用中…") : String(localized: "套用 \(applicablePlans.count) 項")) { confirmApply = true }
                        .glassProminentButtonStyle()
                        .disabled(applicablePlans.isEmpty || applying)
                }
                VStack(spacing: 0) {
                    ForEach(list.prefix(200)) { plan in
                        planRow(plan)
                        if plan.id != list.prefix(200).last?.id { Divider() }
                    }
                }
                .background(Theme.ink(0.03), in: RoundedRectangle(cornerRadius: 8))
                if list.count > 200 {
                    Text("僅顯示前 200 項；套用時會包含全部。").font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                }
            }
        }
    }

    private func planRow(_ plan: RenamePlan) -> some View {
        HStack(alignment: .top, spacing: 10) {
            statusBadge(plan)
            VStack(alignment: .leading, spacing: 2) {
                Text(plan.oldPath).font(.system(size: 11, design: .monospaced)).foregroundStyle(Theme.Text.tertiary)
                    .lineLimit(1).truncationMode(.middle)
                if plan.isApplicable {
                    Text(plan.newPath).font(.system(size: 11, design: .monospaced))
                        .lineLimit(1).truncationMode(.middle)
                } else if let error = plan.error, !error.isEmpty {
                    Text(error).font(.system(size: 11)).foregroundStyle(Color(hex: 0xF87171)).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 10).padding(.vertical, 6)
    }

    private func statusBadge(_ plan: RenamePlan) -> some View {
        let (text, tint): (String, Color) = switch plan.status {
        case "ok": (String(localized: "可套用"), Color(hex: 0x4ADE80).opacity(0.25))
        case "skip_same_as_current": (String(localized: "已符合"), Theme.ink(0.1))
        case "skip_collision": (String(localized: "路徑衝突"), Color(hex: 0xFBBF24).opacity(0.3))
        default: (String(localized: "錯誤"), Color(hex: 0xF87171).opacity(0.3))
        }
        return PillBadge(text: text, tint: tint, foreground: Theme.ink(0.9))
    }

    // MARK: - History

    @ViewBuilder
    private var historySection: some View {
        if let batches = history.value, !batches.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("歷史").font(.system(size: 13, weight: .semibold))
                VStack(spacing: 0) {
                    ForEach(batches) { batch in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(batch.appliedAt.map(Formatters.relative) ?? batch.batchID)
                                    .font(.system(size: 12, weight: .medium))
                                Text("\(batch.rowCount) 個檔案 · 已復原 \(batch.revertedCount)")
                                    .font(.system(size: 11)).foregroundStyle(Theme.Text.tertiary)
                            }
                            Spacer()
                            if batch.revertedCount < batch.rowCount {
                                Button("復原…") { confirmUndo = batch }.controlSize(.small)
                            }
                        }
                        .padding(.horizontal, 10).padding(.vertical, 8)
                        if batch.id != batches.last?.id { Divider() }
                    }
                }
                .background(Theme.ink(0.03), in: RoundedRectangle(cornerRadius: 8))
            }
        }
    }

    // MARK: - Actions

    private func saveConfig() async {
        savingConfig = true
        defer { savingConfig = false }
        do {
            try await client.setRenameConfig(libraryID: library.id, template: template, auto: auto)
            toast = String(localized: "已儲存")
            await onChanged()
        } catch {
            toast = error.localizedDescription
        }
    }

    private func preview() async {
        // The preview renders with the *saved* template, so save first.
        await saveConfig()
        plans = plans.reloading
        plans = await plans.reloaded { try await client.renamePreview(libraryID: library.id) }
    }

    private func apply() async {
        applying = true
        defer { applying = false }
        do {
            let result = try await client.renameApply(libraryID: library.id, plans: applicablePlans)
            toast = result.errors.isEmpty
                ? String(localized: "重新命名 \(result.applied) 個檔案")
                : String(localized: "完成 \(result.applied) 個，\(result.errors.count) 個失敗")
            plans = .idle
            await loadHistory()
            await onChanged()
        } catch {
            toast = error.localizedDescription
        }
    }

    private func undo(_ batch: RenameBatch) async {
        do {
            let result = try await client.renameUndo(libraryID: library.id, batchID: batch.batchID)
            toast = String(localized: "復原 \(result.reverted) 個檔案")
            await loadHistory()
            await onChanged()
        } catch {
            toast = error.localizedDescription
        }
    }

    private func loadHistory() async {
        history = history.reloading
        history = await history.reloaded { try await client.renameHistory(libraryID: library.id) }
    }
}
