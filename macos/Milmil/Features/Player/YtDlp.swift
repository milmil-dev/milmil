import Foundation

/// Optional yt-dlp integration (not bundled: yt-dlp is Unlicense but pulls a
/// world of site extractors, and it changes weekly). The binary lives in
/// Application Support and is downloaded on demand from the official
/// GitHub releases; when present, trailers and「開啟 URL」play in-app.
enum YtDlp {
    static let releaseURL = URL(string: "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos")!

    static var directory: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appending(path: "milmil/yt-dlp", directoryHint: .isDirectory)
    }

    static var binaryURL: URL { directory.appending(path: "yt-dlp") }

    static var isInstalled: Bool {
        FileManager.default.isExecutableFile(atPath: binaryURL.path)
    }

    /// `--version` output ("2026.08.12"), nil when not installed or broken.
    static func version() async -> String? {
        guard isInstalled else { return nil }
        let output = (try? await run(["--version"]))?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return output.isEmpty ? nil : output
    }

    /// Downloads the latest release binary. Also serves as "update" — a fresh
    /// download beats `-U` because it cannot leave a half-replaced binary.
    static func install() async throws {
        let (temp, response) = try await URLSession.shared.download(from: releaseURL)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw CocoaError(.fileReadUnknown)
        }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let destination = binaryURL
        if FileManager.default.fileExists(atPath: destination.path) {
            try FileManager.default.removeItem(at: destination)
        }
        try FileManager.default.moveItem(at: temp, to: destination)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: destination.path)
        // Downloaded executables may carry the quarantine xattr; strip it so
        // Process can exec the binary without a Gatekeeper prompt.
        removexattr(destination.path, "com.apple.quarantine", 0)
    }

    /// Fire-and-forget self-update; the standalone binary swaps itself.
    static func updateInBackground() {
        guard isInstalled else { return }
        Task.detached(priority: .background) { _ = try? await run(["-U"], timeout: 300) }
    }

    /// Runs yt-dlp and returns stdout. Throws on a non-zero exit with stderr
    /// in the error description.
    static func run(_ arguments: [String], timeout: TimeInterval = 60) async throws -> String {
        let binary = binaryURL
        return try await withCheckedThrowingContinuation { continuation in
            let process = Process()
            process.executableURL = binary
            process.arguments = arguments
            let stdout = Pipe()
            let stderr = Pipe()
            process.standardOutput = stdout
            process.standardError = stderr
            process.environment = ["PATH": "/usr/bin:/bin", "HOME": NSHomeDirectory()]

            // Watchdog: SIGTERM a hung extractor. Checking isRunning makes a
            // late firing on an exited process a no-op.
            DispatchQueue.global().asyncAfter(deadline: .now() + timeout) {
                if process.isRunning { process.terminate() }
            }
            process.terminationHandler = { process in
                let output = String(data: stdout.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
                if process.terminationStatus == 0 {
                    continuation.resume(returning: output)
                } else {
                    let message = String(data: stderr.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
                    continuation.resume(throwing: Failure(message: message.trimmingCharacters(in: .whitespacesAndNewlines)))
                }
            }
            do {
                try process.run()
            } catch {
                continuation.resume(throwing: error)
            }
        }
    }

    struct Failure: LocalizedError {
        let message: String
        var errorDescription: String? {
            message.isEmpty ? String(localized: "yt-dlp 執行失敗") : message
        }
    }
}
