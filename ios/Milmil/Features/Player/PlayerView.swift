import AVKit
import MilmilAPI
import MilmilDanmaku
import MilmilDanmakuAPI
import SwiftUI

/// What the user can change about danmaku, sharing the web's JSON keys.
struct DanmakuSettings: Equatable {
    var enabled = true
    var fontSize: Double = 20
    var opacity: Double = 0.9
    /// px/s — the web's `danmakuSpeed`.
    var speed: Double = 144
    /// Fraction of the height comments may use — the web's `danmakuArea`.
    var area: Double = 1
}

@Observable
@MainActor
final class PlayerModel {
    let engine: AVPlaybackEngine
    private(set) var comments: [DanmakuComment] = []

    /// Set when a write fails. Swallowing it is how a whole watch session can
    /// go unsaved with no sign on screen.
    private(set) var saveFailed = false

    private let client: APIClient
    private var episode: PlayableEpisode?
    private var lastWritten = 0
    private var reporter: Task<Void, Never>?

    init(client: APIClient) {
        self.client = client
        engine = AVPlaybackEngine(client: client)
    }

    func play(_ episode: PlayableEpisode) {
        self.episode = episode
        guard let file = episode.mediaFile else { return }
        let resume = episode.progress.map { $0.completed ? 0 : Double($0.positionSeconds) } ?? 0
        engine.open(fileID: file.id, startAt: resume)
        Task { await loadDanmaku(fileID: file.id) }
        startReporting()
    }

    /// A server with no DandanPlay credentials answers "file not matched",
    /// which is not an error worth showing: the episode still plays.
    private func loadDanmaku(fileID: String) async {
        guard let response = try? await client.danmaku(fileID: fileID) else { return }
        comments = DanmakuParser.comments(from: response).sorted { $0.time < $1.time }
    }

    private func startReporting() {
        reporter?.cancel()
        reporter = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(10))
                guard let self else { return }
                // An episode that reaches the end has to be recorded there and
                // then: the user may well swipe the app away rather than press
                // the close button, and the final write would never run.
                if engine.state.status == .ended {
                    await write(completed: true)
                    return
                }
                guard engine.state.status == .playing else { continue }
                await write(completed: false)
            }
        }
    }

    /// The final write, on the way out of the screen.
    func commit() async {
        reporter?.cancel()
        let state = engine.state
        guard state.position > 0 else { return }
        await write(completed: state.status == .ended || state.fraction >= 0.92)
        engine.stop()
    }

    private func write(completed: Bool) async {
        guard let episode, let file = episode.mediaFile else { return }
        let position = Int(engine.state.position)
        guard abs(position - lastWritten) >= 1 || completed else { return }
        do {
            try await client.saveProgress(
                ProgressSave(
                    mediaFileID: file.id,
                    episodeID: episode.episodeID,
                    positionSeconds: position,
                    durationSeconds: Int(engine.state.duration),
                    completed: completed
                )
            )
            lastWritten = position
            saveFailed = false
        } catch {
            #if DEBUG
            print("milmil.progress save failed: \(error)")
            #endif
            saveFailed = true
        }
    }
}

/// The watch screen. The OSC hides itself while playing and comes back on a
/// tap, and the video owns the whole screen rather than sitting in a card.
struct PlayerView: View {
    let client: APIClient
    let episode: PlayableEpisode
    let title: String
    let danmaku: DanmakuSettings
    let onClose: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var model: PlayerModel
    @State private var chromeVisible = true
    @State private var scrubbing: Double?
    @State private var danmakuOn: Bool
    @State private var hideTask: Task<Void, Never>?

    init(
        client: APIClient,
        episode: PlayableEpisode,
        title: String,
        danmaku: DanmakuSettings,
        onClose: @escaping () -> Void
    ) {
        self.client = client
        self.episode = episode
        self.title = title
        self.danmaku = danmaku
        self.onClose = onClose
        _model = State(initialValue: PlayerModel(client: client))
        _danmakuOn = State(initialValue: danmaku.enabled)
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            VideoPlayer(player: model.engine.player)
                .ignoresSafeArea()
                .allowsHitTesting(false)

            if danmakuOn {
                DanmakuLayer(
                    comments: model.comments,
                    engine: model.engine,
                    settings: danmaku
                )
                .ignoresSafeArea()
                .allowsHitTesting(false)
            }

            if model.engine.state.status == .buffering {
                ProgressView().controlSize(.large).tint(.white)
            }

            if model.engine.state.status == .failed {
                VStack(spacing: 6) {
                    Text("播唔到").font(.headline).foregroundStyle(.white)
                    Text(model.engine.state.message ?? "串流階梯行到底都開唔到")
                        .font(.caption).foregroundStyle(.white.opacity(0.7))
                }
            }

            if chromeVisible { chrome }
        }
        .statusBarHidden()
        .persistentSystemOverlays(.hidden)
        .contentShape(.rect)
        .onTapGesture { toggleChrome() }
        .task {
            Orientation.request(.landscape)
            model.play(episode)
            scheduleHide()
        }
    }

    private var chrome: some View {
        VStack {
            HStack(spacing: 10) {
                Button {
                    Task {
                        await model.commit()
                        Orientation.request(.portrait)
                        onClose()
                        dismiss()
                    }
                } label: {
                    Image(systemName: "chevron.down").font(.headline)
                }
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(.subheadline.weight(.semibold)).lineLimit(1)
                    Text("第 \(episode.number) 集 · \(episode.displayTitle ?? "")")
                        .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer()
            }
            .padding(12)
            .glassSurface(in: RoundedRectangle(cornerRadius: 22))
            .padding(.horizontal, 12)

            Spacer()

            VStack(spacing: 6) {
                Slider(
                    value: Binding(
                        get: { scrubbing ?? model.engine.state.fraction },
                        set: { scrubbing = $0 }
                    ),
                    in: 0...1,
                    onEditingChanged: { editing in
                        guard !editing, let target = scrubbing else { return }
                        model.engine.seek(to: target * model.engine.state.duration)
                        scrubbing = nil
                    }
                )
                .tint(Theme.accent)

                HStack(spacing: 14) {
                    Button { model.engine.seek(to: model.engine.positionNow() - 10) } label: {
                        Image(systemName: "gobackward.10")
                    }
                    Button {
                        if model.engine.state.status == .playing { model.engine.pause() }
                        else { model.engine.play() }
                    } label: {
                        Image(systemName: model.engine.state.status == .playing ? "pause.fill" : "play.fill")
                            .font(.title3)
                    }
                    Button { model.engine.seek(to: model.engine.positionNow() + 10) } label: {
                        Image(systemName: "goforward.10")
                    }
                    Text("\(clock(scrubbing.map { $0 * model.engine.state.duration } ?? model.engine.state.position)) / \(clock(model.engine.state.duration))")
                        .font(.caption.monospacedDigit())
                    Spacer()
                    if model.saveFailed {
                        Text("進度未儲存").font(.caption2).foregroundStyle(.red)
                    }
                    Button { danmakuOn.toggle() } label: {
                        Image(systemName: danmakuOn ? "captions.bubble.fill" : "captions.bubble")
                    }
                    .disabled(model.comments.isEmpty)
                    .tint(danmakuOn && !model.comments.isEmpty ? Theme.accent : .secondary)
                    // Which rung of the ladder the picture comes from, the same
                    // fact the macOS OSC shows.
                    Text(model.engine.state.stage.label)
                        .font(.caption2.weight(.medium))
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .glassSurface(in: Capsule())
                }
            }
            .padding(14)
            .glassSurface(in: RoundedRectangle(cornerRadius: 24))
            .padding(.horizontal, 12)
            .padding(.bottom, 8)
        }
        .foregroundStyle(.white)
    }

    private func toggleChrome() {
        chromeVisible.toggle()
        if chromeVisible { scheduleHide() }
    }

    /// Hide only while it is actually playing: a paused or failed player that
    /// hides its controls looks like a frozen app.
    private func scheduleHide() {
        hideTask?.cancel()
        hideTask = Task {
            try? await Task.sleep(for: .seconds(3.5))
            guard !Task.isCancelled, model.engine.state.status == .playing else { return }
            chromeVisible = false
        }
    }

    private func clock(_ seconds: Double) -> String {
        guard seconds.isFinite, seconds > 0 else { return "0:00" }
        let total = Int(seconds)
        let (h, m, s) = (total / 3600, (total % 3600) / 60, total % 60)
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
    }
}
