import AVKit
import Foundation
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
        #if DEBUG
        // A dev server has no credentials, so the renderer cannot be verified
        // against one at all. The twin of the Android client's
        // `danmaku-sample.json` and the macOS `MILMIL_SNAPSHOT_DANMAKU`.
        if let path = ProcessInfo.processInfo.environment["MILMIL_DANMAKU_SAMPLE"],
           let data = FileManager.default.contents(atPath: path),
           let sample = try? MilmilJSON.makeDecoder().decode(DandanPlayResponse.self, from: data) {
            comments = DanmakuParser.comments(from: sample).sorted { $0.time < $1.time }
            return
        }
        #endif
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
    let episodes: [PlayableEpisode]
    let title: String
    let danmaku: DanmakuSettings
    let onClose: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var model: PlayerModel
    @State private var chromeVisible = true
    @State private var scrubbing: Double?
    @State private var danmakuOn: Bool
    @State private var hideTask: Task<Void, Never>?
    @State private var playing: PlayableEpisode
    @State private var sheet: PlayerSheet?

    init(
        client: APIClient,
        episode: PlayableEpisode,
        episodes: [PlayableEpisode],
        title: String,
        danmaku: DanmakuSettings,
        onClose: @escaping () -> Void
    ) {
        self.client = client
        self.episode = episode
        self.episodes = episodes
        self.title = title
        self.danmaku = danmaku
        self.onClose = onClose
        _model = State(initialValue: PlayerModel(client: client))
        _danmakuOn = State(initialValue: danmaku.enabled)
        _playing = State(initialValue: episode)
    }

    /// The next episode with a file on the server, not simply the next row: an
    /// episode that is only listed cannot be played into.
    private var next: PlayableEpisode? {
        guard let index = episodes.firstIndex(where: { $0.id == playing.id }) else { return nil }
        return episodes[(index + 1)...].first(where: \.hasFile)
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            // AVPlayerViewController rather than SwiftUI's VideoPlayer: PiP
            // and Now Playing come from it, and its own controls are turned
            // off so the app's OSC is the only one on screen.
            PlayerSurface(player: model.engine.player)
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
        .task(id: playing.id) {
            Orientation.request(.landscape)
            model.play(playing)
            scheduleHide()
        }
        .overlay(alignment: .bottomLeading) {
            if let sheet { optionSheet(sheet) }
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
                    Text("第 \(playing.number) 集 · \(playing.displayTitle ?? "")")
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
                    if let next {
                        Button {
                            Task {
                                // Write where we got to before the position
                                // becomes the next episode's.
                                await model.commit()
                                playing = next
                            }
                        } label: {
                            Image(systemName: "forward.end.fill")
                        }
                    }
                    Text("\(clock(scrubbing.map { $0 * model.engine.state.duration } ?? model.engine.state.position)) / \(clock(model.engine.state.duration))")
                        .font(.caption.monospacedDigit())
                    Spacer()
                    if model.saveFailed {
                        Text("進度未儲存").font(.caption2).foregroundStyle(.red)
                    }
                    Button { sheet = .subtitles } label: { Image(systemName: "captions.bubble") }
                    Button { sheet = .audio } label: { Image(systemName: "speaker.wave.2") }
                    Button { sheet = .speed } label: {
                        Text("\(model.engine.state.speed.formatted(.number.precision(.fractionLength(0...2))))×")
                            .font(.caption.weight(.medium))
                    }
                    Button { danmakuOn.toggle() } label: {
                        Image(systemName: danmakuOn ? "text.bubble.fill" : "text.bubble")
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

    /// One list of choices over the video. A sheet would cover the picture
    /// edge to edge in landscape; this sits in the corner its control came from.
    @ViewBuilder
    private func optionSheet(_ open: PlayerSheet) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            switch open {
            case .speed:
                ForEach(SPEEDS, id: \.self) { option in
                    sheetRow("\(option.formatted(.number.precision(.fractionLength(0...2))))×",
                             selected: model.engine.state.speed == option) {
                        model.engine.setSpeed(option)
                    }
                }
            case .subtitles:
                let subtitles = model.engine.tracks.filter { $0.kind == .subtitle }
                sheetRow("關閉", selected: !subtitles.contains(where: \.selected)) {
                    model.engine.select(track: nil, kind: .subtitle)
                }
                ForEach(subtitles) { track in
                    sheetRow(track.label, selected: track.selected) {
                        model.engine.select(track: track.id, kind: .subtitle)
                    }
                }
                if subtitles.isEmpty { sheetRow("冇字幕軌", selected: false, enabled: false) {} }
            case .audio:
                let audio = model.engine.tracks.filter { $0.kind == .audio }
                ForEach(audio) { track in
                    sheetRow(track.label, selected: track.selected) {
                        model.engine.select(track: track.id, kind: .audio)
                    }
                }
                if audio.isEmpty { sheetRow("冇音軌", selected: false, enabled: false) {} }
            }
        }
        .padding(.vertical, 6)
        .frame(minWidth: 180)
        .glassSurface(in: RoundedRectangle(cornerRadius: 16))
        .padding(.leading, 16)
        .padding(.bottom, 120)
    }

    private func sheetRow(
        _ label: String,
        selected: Bool,
        enabled: Bool = true,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            action()
            sheet = nil
        } label: {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(enabled ? (selected ? Theme.accent : Color.primary) : .secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 18)
                .padding(.vertical, 10)
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }

    private func toggleChrome() {
        if sheet != nil {
            sheet = nil
            return
        }
        chromeVisible.toggle()
        if chromeVisible { scheduleHide() }
    }

    /// Hide only while it is actually playing, and never out from under an
    /// open picker: a paused or failed player that hides its controls looks
    /// like a frozen app, and choices floating on the video explain nothing.
    private func scheduleHide() {
        hideTask?.cancel()
        hideTask = Task {
            try? await Task.sleep(for: .seconds(3.5))
            guard !Task.isCancelled, sheet == nil, model.engine.state.status == .playing else { return }
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

/// Which picker is open. Nil is the common case: nothing over the picture.
private enum PlayerSheet: Identifiable {
    case subtitles, audio, speed
    var id: Self { self }
}

private let SPEEDS: [Float] = [0.75, 1, 1.25, 1.5, 2]

/// The video surface. `AVPlayerViewController` with its controls off: it is
/// what makes picture-in-picture and the lock-screen controls work, neither of
/// which SwiftUI's `VideoPlayer` offers on its own.
private struct PlayerSurface: UIViewControllerRepresentable {
    let player: AVPlayer

    func makeUIViewController(context: Context) -> AVPlayerViewController {
        let controller = AVPlayerViewController()
        controller.player = player
        controller.showsPlaybackControls = false
        controller.allowsPictureInPicturePlayback = true
        controller.canStartPictureInPictureAutomaticallyFromInline = true
        controller.videoGravity = .resizeAspect
        return controller
    }

    func updateUIViewController(_ controller: AVPlayerViewController, context: Context) {
        if controller.player !== player { controller.player = player }
    }
}
