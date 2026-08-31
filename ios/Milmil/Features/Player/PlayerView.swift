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
    /// Portrait is the default: you watch with the episode list under the
    /// picture. Full screen is a choice, not the only way in.
    @State private var fullscreen = false

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
        Group {
            if fullscreen { fullscreenPlayer } else { portraitPlayer }
        }
        .task(id: playing.id) {
            model.play(playing)
            scheduleHide()
        }
    }

    /// 豎屏播放: the picture keeps its 16:9 box at the top and the episode list
    /// sits under it, so picking the next episode does not mean leaving.
    private var portraitPlayer: some View {
        VStack(spacing: 0) {
            ZStack {
                Color.black
                surface
                if danmakuOn { danmakuLayer }
                if model.engine.state.status == .buffering {
                    ProgressView().controlSize(.large).tint(.white)
                }
                if chromeVisible { chrome }
                if let sheet { optionSheet(sheet) }
            }
            .aspectRatio(16 / 9, contentMode: .fit)
            .frame(maxWidth: .infinity)
            .contentShape(.rect)
            .onTapGesture { toggleChrome() }

            Text(title)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Theme.ink(0.95))
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Theme.Space.margin)
                .padding(.vertical, 12)

            ScrollView {
                LazyVStack(spacing: 8) {
                    ForEach(episodes) { episode in
                        Button {
                            Task {
                                // Same commit-then-switch as the next button:
                                // the position must be written before it
                                // becomes another episode's.
                                await model.commit()
                                playing = episode
                            }
                        } label: {
                            PlaylistRow(episode: episode, playing: episode.id == playing.id)
                        }
                        .buttonStyle(PressableCard())
                        .disabled(!episode.hasFile)
                    }
                }
                .padding(.horizontal, Theme.Space.margin)
                .padding(.bottom, 24)
            }
        }
        .background(Theme.background)
        .navigationBarBackButtonHidden()
    }

    private var fullscreenPlayer: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            surface.ignoresSafeArea()

            if danmakuOn { danmakuLayer.ignoresSafeArea() }

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

    /// AVPlayerViewController rather than SwiftUI's VideoPlayer: PiP and Now
    /// Playing come from it, and its own controls are off so the app's OSC is
    /// the only one on screen.
    private var surface: some View {
        PlayerSurface(player: model.engine.player)
            .allowsHitTesting(false)
    }

    private var danmakuLayer: some View {
        DanmakuLayer(comments: model.comments, engine: model.engine, settings: danmaku)
            .allowsHitTesting(false)
    }

    /// The OSC.
    ///
    /// Transport in the middle of the picture where a thumb reaches it, the
    /// scrub line and its two timestamps on one row, and the secondary
    /// controls on their own row underneath. The first cut crammed all eleven
    /// controls into a single line, which wrapped "13:00 / 23:50" and "直接
    /// 串流" onto two lines each and put two near-identical speech bubbles
    /// next to each other.
    private var chrome: some View {
        VStack(spacing: 0) {
            topBar
            Spacer(minLength: 0)
            transport
            Spacer(minLength: 0)
            bottomBar
        }
        .foregroundStyle(.white)
    }

    private var topBar: some View {
        HStack(spacing: 10) {
            Button {
                Task {
                    await model.commit()
                    Orientation.request(.portrait)
                    onClose()
                    dismiss()
                }
            } label: {
                Image(systemName: "chevron.down").font(.system(size: 15, weight: .semibold))
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                Text("第 \(playing.number) 集 · \(playing.displayTitle ?? "")")
                    .font(.system(size: 11))
                    .foregroundStyle(.white.opacity(0.65))
                    .lineLimit(1)
            }
            Spacer()
            Text(model.engine.state.stage.label)
                .font(.system(size: 10, weight: .medium))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(.white.opacity(0.16), in: Capsule())
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(scrimGradient(from: .top))
    }

    /// Big, centred, thumb-reachable. 44pt targets with room between them.
    private var transport: some View {
        HStack(spacing: 34) {
            Button { model.engine.seek(to: model.engine.positionNow() - 10) } label: {
                Image(systemName: "gobackward.10").font(.system(size: 26, weight: .regular))
            }
            Button {
                if model.engine.state.status == .playing { model.engine.pause() }
                else { model.engine.play() }
            } label: {
                Image(systemName: model.engine.state.status == .playing ? "pause.fill" : "play.fill")
                    .font(.system(size: 30, weight: .semibold))
                    .frame(width: 62, height: 62)
                    .background(.black.opacity(0.35), in: Circle())
            }
            Button { model.engine.seek(to: model.engine.positionNow() + 10) } label: {
                Image(systemName: "goforward.10").font(.system(size: 26, weight: .regular))
            }
        }
        .shadow(color: .black.opacity(0.5), radius: 8)
    }

    private var bottomBar: some View {
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                Text(clock(scrubbing.map { $0 * model.engine.state.duration } ?? model.engine.state.position))
                    .font(.system(size: 11, weight: .medium).monospacedDigit())
                Scrubber(
                    fraction: scrubbing ?? model.engine.state.fraction,
                    onScrub: { scrubbing = $0 },
                    onCommit: { target in
                        model.engine.seek(to: target * model.engine.state.duration)
                        scrubbing = nil
                    }
                )
                Text(clock(model.engine.state.duration))
                    .font(.system(size: 11, weight: .medium).monospacedDigit())
                    .foregroundStyle(.white.opacity(0.7))
            }

            HStack(spacing: 0) {
                oscButton("captions.bubble", "字幕") { sheet = .subtitles }
                oscButton("waveform", "音軌") { sheet = .audio }
                Button { sheet = .speed } label: {
                    Text("\(model.engine.state.speed.formatted(.number.precision(.fractionLength(0...2))))×")
                        .font(.system(size: 13, weight: .semibold))
                        .frame(width: 44, height: 34)
                        .contentShape(.rect)
                }
                oscButton(
                    danmakuOn ? "ellipsis.bubble.fill" : "ellipsis.bubble",
                    danmakuOn ? "關閉彈幕" : "開啟彈幕",
                    tint: danmakuOn && !model.comments.isEmpty ? Theme.accent : .white
                ) { danmakuOn.toggle() }
                .disabled(model.comments.isEmpty)

                Spacer(minLength: 0)

                if model.saveFailed {
                    Text("進度未儲存")
                        .font(.system(size: 10))
                        .foregroundStyle(.red)
                        .padding(.trailing, 4)
                }
                if next != nil {
                    oscButton("forward.end.fill", "下一集") {
                        Task {
                            await model.commit()
                            next.map { playing = $0 }
                        }
                    }
                }
                oscButton(
                    fullscreen ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right",
                    fullscreen ? "退出全螢幕" : "全螢幕"
                ) { fullscreen.toggle() }
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 10)
        .padding(.bottom, fullscreen ? 14 : 8)
        .background(scrimGradient(from: .bottom))
    }

    private func oscButton(
        _ symbol: String,
        _ label: String,
        tint: Color = .white,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 16))
                .foregroundStyle(tint)
                .frame(width: 44, height: 34)
                .contentShape(.rect)
        }
        .accessibilityLabel(label)
    }

    /// A gradient, not a flat panel: a bar of solid black across a picture is
    /// exactly what makes an overlay look bolted on.
    private func scrimGradient(from edge: UnitPoint) -> some View {
        LinearGradient(
            colors: [.black.opacity(0.7), .clear],
            startPoint: edge,
            endPoint: edge == .top ? .bottom : .top
        )
    }

    /// One list of choices over the video. A sheet would cover the picture edge
    /// to edge in landscape; this sits in the corner its control came from.
    @ViewBuilder
    private func optionSheet(_ open: PlayerSheet) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            switch open {
            case .speed:
                ForEach(SPEEDS, id: \.self) { option in
                    sheetRow(
                        "\(option.formatted(.number.precision(.fractionLength(0...2))))×",
                        selected: model.engine.state.speed == option
                    ) {
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
        .padding(.leading, 14)
        .padding(.bottom, 96)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
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
                .font(.system(size: 14))
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

/// The scrub bar.
///
/// Drawn at 60% of the stock slider's metrics — its 4pt track and 27pt thumb
/// are a lot of furniture across the bottom of a video. The touch target stays
/// a full 44pt tall: a scrub bar you cannot grab is worse than one that looks
/// heavy, so only the drawing shrank.
private struct Scrubber: View {
    let fraction: Double
    let onScrub: (Double) -> Void
    let onCommit: (Double) -> Void

    private let trackHeight: CGFloat = 2.5
    private let thumbSize: CGFloat = 16

    var body: some View {
        GeometryReader { geometry in
            let width = geometry.size.width
            let filled = width * min(1, max(0, fraction))
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(.white.opacity(0.3))
                    .frame(height: trackHeight)
                Capsule()
                    .fill(Theme.accent)
                    .frame(width: filled, height: trackHeight)
                Circle()
                    .fill(Theme.accent)
                    .frame(width: thumbSize, height: thumbSize)
                    .shadow(color: .black.opacity(0.35), radius: 3, y: 1)
                    .offset(x: filled - thumbSize / 2)
            }
            .frame(maxHeight: .infinity)
            .contentShape(.rect)
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        onScrub(min(1, max(0, value.location.x / width)))
                    }
                    .onEnded { value in
                        onCommit(min(1, max(0, value.location.x / width)))
                    }
            )
        }
        .frame(height: 44)
    }
}

/// One episode in the under-the-player list, with the current one marked.
private struct PlaylistRow: View {
    let episode: PlayableEpisode
    let playing: Bool

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(playing ? Theme.accent : (episode.hasFile ? Theme.accent.opacity(0.16) : Theme.ink(0.06)))
                Text(episode.number)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(playing ? Theme.background : (episode.hasFile ? Theme.accent : Theme.ink(0.35)))
            }
            .frame(width: 40, height: 40)

            VStack(alignment: .leading, spacing: 2) {
                Text(episode.displayTitle ?? "第 \(episode.number) 集")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(episode.hasFile ? Theme.ink(0.92) : Theme.ink(0.4))
                    .lineLimit(1)
                Text(playing ? "播放緊" : (episode.hasFile ? (episode.airDate ?? "") : "未有檔案"))
                    .font(.system(size: 11))
                    .foregroundStyle(playing ? Theme.accent : Theme.ink(0.42))
            }
            Spacer(minLength: 0)
        }
        .padding(10)
        .cardBackground()
        .contentShape(.rect)
    }
}
