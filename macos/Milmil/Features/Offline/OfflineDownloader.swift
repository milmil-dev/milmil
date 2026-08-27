import Foundation
import os

/// Moves queued `OfflineEntry` files onto disk: `URLSessionDownloadTask`s
/// (two at a time) with resume data kept in the index across pauses,
/// failures and relaunches, then the sidecar subtitles and the danmaku
/// snapshot once the video has landed. Download tasks cannot be rate-limited,
/// so there is no throttle knob — the concurrency cap is the ceiling.
@MainActor
final class OfflineDownloader: NSObject {
    private unowned let store: OfflineStore
    private var session: URLSession?
    private var bridge: Bridge?
    private var tasks: [String: URLSessionDownloadTask] = [:]
    private var pausing: Set<String> = []
    private var lastProgressPush: [String: TimeInterval] = [:]
    private let maxConcurrent = 2

    init(store: OfflineStore) {
        self.store = store
        super.init()
    }

    /// One session per signed-in profile: the bearer rides on every request.
    func configure(token: String?) {
        session?.invalidateAndCancel()
        tasks = [:]
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 60
        config.timeoutIntervalForResource = 24 * 3600
        config.waitsForConnectivity = true
        if let token { config.httpAdditionalHeaders = ["Authorization": "Bearer \(token)"] }
        let bridge = Bridge(owner: self)
        self.bridge = bridge
        session = URLSession(configuration: config, delegate: bridge, delegateQueue: nil)
    }

    /// Starts queued entries up to the concurrency cap.
    func kick() {
        guard let session else { return }
        let running = tasks.count
        guard running < maxConcurrent else { return }
        let queued = store.entries.filter { $0.state == .queued && tasks[$0.fileID] == nil }.sorted { $0.queuedAt < $1.queuedAt }
        for entry in queued.prefix(maxConcurrent - running) {
            let task: URLSessionDownloadTask
            if let data = entry.resumeData {
                task = session.downloadTask(withResumeData: data)
            } else {
                task = session.downloadTask(with: entry.sourceURL)
            }
            task.taskDescription = entry.fileID
            if let target = store.fileURL(entry) { bridge?.register(fileID: entry.fileID, destination: target) }
            tasks[entry.fileID] = task
            store.update(entry.fileID) { $0.state = .downloading; $0.error = nil; $0.resumeData = nil }
            task.resume()
        }
    }

    func pause(fileID: String) {
        guard let task = tasks[fileID] else {
            store.update(fileID) { if $0.state == .queued { $0.state = .paused } }
            return
        }
        pausing.insert(fileID)
        task.cancel { [weak self] data in
            Task { @MainActor in
                guard let self else { return }
                self.tasks[fileID] = nil
                self.pausing.remove(fileID)
                self.store.update(fileID) { $0.state = .paused; $0.resumeData = data }
                self.kick()
            }
        }
    }

    func cancel(fileID: String) {
        tasks[fileID]?.cancel()
        tasks[fileID] = nil
    }

    func cancelAll() {
        for (fileID, task) in tasks {
            task.cancel { [weak self] data in
                Task { @MainActor in self?.store.update(fileID) { $0.state = .queued; $0.resumeData = data } }
            }
        }
        tasks = [:]
        session?.invalidateAndCancel()
        session = nil
    }

    // MARK: Delegate events (hopped onto the main actor)

    fileprivate func progressed(fileID: String, written: Int64, expected: Int64) {
        let now = Date().timeIntervalSinceReferenceDate
        guard now - (lastProgressPush[fileID] ?? 0) > 0.4 || written == expected else { return }
        lastProgressPush[fileID] = now
        store.update(fileID) {
            $0.downloadedBytes = written
            if expected > 0 { $0.sizeBytes = expected }
        }
    }

    fileprivate func finished(fileID: String, movedTo url: URL?, error: Error?, resumeData: Data?) {
        tasks[fileID] = nil
        lastProgressPush[fileID] = nil
        defer { kick() }
        if pausing.contains(fileID) { return } // the cancel handler owns this one
        if let url {
            let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int64) ?? 0
            store.update(fileID) {
                $0.state = .done
                $0.downloadedBytes = size
                if size > 0 { $0.sizeBytes = size }
                $0.downloadedAt = Date()
                $0.error = nil
            }
            fetchSidecars(fileID: fileID)
        } else if let error {
            if (error as NSError).code == NSURLErrorCancelled && (error as NSError).domain == NSURLErrorDomain && resumeData == nil {
                return // removed / signed out
            }
            store.update(fileID) {
                $0.state = .failed
                $0.error = error.localizedDescription
                $0.resumeData = resumeData
            }
        }
    }

    /// Subtitles + danmaku from the manifest, best effort.
    private func fetchSidecars(fileID: String) {
        guard let entry = store.entry(fileID: fileID), let session,
              let dir = store.seriesDirectory(entry.bangumiID) else { return }
        let sources = entry.subtitleSources
        let danmaku = entry.danmakuURL
        guard !sources.isEmpty || danmaku != nil else { return }
        Task {
            var saved: [OfflineSidecar] = []
            for source in sources {
                guard let (data, response) = try? await session.data(from: source.url),
                      (response as? HTTPURLResponse).map({ 200..<300 ~= $0.statusCode }) ?? false else { continue }
                let ext = source.url.pathExtension.isEmpty ? "srt" : source.url.pathExtension
                let name = "\(fileID).\(source.index).\(ext)"
                if (try? data.write(to: dir.appending(path: name), options: .atomic)) != nil {
                    saved.append(OfflineSidecar(filename: name, language: source.language, title: source.title))
                }
            }
            var gotDanmaku = false
            if let danmaku, let (data, response) = try? await session.data(from: danmaku),
               (response as? HTTPURLResponse).map({ 200..<300 ~= $0.statusCode }) ?? false,
               let target = store.danmakuURL(entry) {
                gotDanmaku = (try? data.write(to: target, options: .atomic)) != nil
            }
            store.update(fileID) {
                $0.subtitles = saved
                $0.subtitleSources = []
                $0.hasDanmaku = gotDanmaku
            }
        }
    }

    /// `URLSessionDownloadDelegate` lives off the main actor; it moves the
    /// temp file synchronously (the temp file is gone once the callback
    /// returns) and forwards everything else.
    private final class Bridge: NSObject, URLSessionDownloadDelegate, Sendable {
        private let owner: OfflineDownloader
        /// Where each task's file goes, decided on the main actor when the
        /// task starts, read on the session queue when it finishes.
        private let destinations = OSAllocatedUnfairLock(initialState: [String: URL]())

        init(owner: OfflineDownloader) {
            self.owner = owner
        }

        func register(fileID: String, destination: URL) {
            destinations.withLock { $0[fileID] = destination }
        }

        func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
            guard let fileID = downloadTask.taskDescription else { return }
            let status = (downloadTask.response as? HTTPURLResponse)?.statusCode ?? 200
            guard 200..<300 ~= status else {
                let failure = NSError(domain: "milmil.offline", code: status, userInfo: [NSLocalizedDescriptionKey: "HTTP \(status)"])
                Task { @MainActor in self.owner.finished(fileID: fileID, movedTo: nil, error: failure, resumeData: nil) }
                return
            }
            guard let target = destinations.withLock({ $0.removeValue(forKey: fileID) }) else { return }
            var moveError: Error?
            do {
                try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
                if FileManager.default.fileExists(atPath: target.path) { try FileManager.default.removeItem(at: target) }
                try FileManager.default.moveItem(at: location, to: target)
            } catch {
                moveError = error
            }
            let moved = moveError == nil ? target : nil
            let failure = moveError
            Task { @MainActor in self.owner.finished(fileID: fileID, movedTo: moved, error: failure, resumeData: nil) }
        }

        func urlSession(
            _ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64,
            totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64
        ) {
            guard let fileID = downloadTask.taskDescription else { return }
            Task { @MainActor in self.owner.progressed(fileID: fileID, written: totalBytesWritten, expected: totalBytesExpectedToWrite) }
        }

        func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
            guard let error, let fileID = task.taskDescription else { return }
            let resume = (error as NSError).userInfo[NSURLSessionDownloadTaskResumeData] as? Data
            Task { @MainActor in self.owner.finished(fileID: fileID, movedTo: nil, error: error, resumeData: resume) }
        }
    }
}
