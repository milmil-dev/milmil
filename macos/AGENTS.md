# AI Agent Instructions

## Overview

`macos/` is the native macOS client for milmil: SwiftUI + AppKit bridging,
libmpv for playback (from Phase 2), Core Animation danmaku. It talks to the
same `/api/v1` the web app uses. Design and phase plan:
`docs/plans/2026-08-23-macos-client-design.md` / `-plan.md`; the review canvas
sources live in `docs/design/macos-client/`.

| Part | What it is |
|---|---|
| `project.yml` | XcodeGen spec. `Milmil.xcodeproj` is generated, never committed. |
| `Milmil/` | App target. `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`. |
| `Packages/MilmilKit` | Local SwiftPM package, platform-neutral: `MilmilAPI` (client, models, Keychain), `MilmilRealtime` (WebSocket events). Nonisolated by default; everything is `Sendable`. |
| `Packages/MilmilPlayer` | macOS-only libmpv binding on top of [MPVKit](https://github.com/mpvkit/MPVKit) 1.0.0 (LGPL product): `MPVPlayer` (event loop, properties, commands), `MPVRenderLayer` (`CAOpenGLLayer`), `MPVRenderView`, `PlaybackClock`, `StreamFallback`. |

## Toolchain

Pinned in `mise.toml` (root): `xcodegen`, `swiftlint`. Xcode 26+ (Swift 6.2
language features, macOS 15 deployment target, arm64 only).

```bash
make macos-gen     # xcodegen generate
make macos-test    # swift test in Packages/MilmilKit and Packages/MilmilPlayer
make macos-build   # xcodebuild the app (Debug, ad-hoc signed)
make macos-lint    # swiftlint --strict
make macos-run     # build + (re)launch the app without Xcode
make macos-dmg     # Release build → ad-hoc signed DMG in macos/dist (CI: release-macos.yml on v* tags)
make macos-watch   # rebuild + relaunch on every save (watchexec)
```

### Fast iteration

- **Previews**: every screen has `#Preview` blocks driven by `PreviewHost` /
  `Preview.session(phase)` (`Milmil/Preview Content/`). Add one for each new
  view; it is the cheapest way to iterate on layout.
- **Hot reload**: Debug builds load InjectionIII/InjectionNext
  (`Milmil/Shared/HotReload.swift`, `-Xlinker -interposable` in Debug only).
  Give every `View` an `@ObserveInjection private var inject` property so it
  re-renders after injection. Run the app from Xcode (⌘R) with InjectionIII
  open; saving a file swaps the code in place. Release carries none of it.

### Local dev server

A full milmil stack runs in OrbStack from this checkout (`.env` +
`docker-compose.local.yml` are gitignored, machine-specific):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.local.yml -p milmil-dev up -d --build
```

API `http://127.0.0.1:18080` (8080 is taken by another project), web
`http://localhost:3000`. Admin comes from `ADMIN_USER`/`ADMIN_PASSWORD` in
`api/.env`; the default library is `/media` → `/Volumes/Sandisk 250GB/Milmil`.
Point the app at `127.0.0.1:18080` — localhost avoids the macOS 15 local-network
prompt, which an ad-hoc-signed build would otherwise hit on every rebuild.

### Seeing the UI without screen permissions

`MILMIL_SNAPSHOT=/tmp/x.png MILMIL_SNAPSHOT_DELAY=8` (Debug only; see
`App/DevSnapshot.swift`) makes the app render its key window to a PNG and
quit. Launch via `open -n --env …` so TCC/networking behave as a normal app
launch. The default render is flattened (no materials / 3D);
`MILMIL_SNAPSHOT_COMPOSITE=1` captures through the window server instead but
can catch the window mid-animation (a skewed capture is an artifact — confirm
on screen before chasing it). Headless logged-in runs: seed the profile in
`defaults` and the token in the Keychain (see scratch `dev_login.py`).
If no window ever appears, pass `--args -ApplePersistenceIgnoreState YES`
(a stale window-restoration record from a different build makes SwiftUI
restore nothing instead of opening a fresh window) and check that the main
thread is not parked in `SecItemCopyMatching` (`sample <pid>`): a
`SecurityAgent` keychain prompt left on screen blocks every later launch —
`kill` it. A process in `ps` state `SX` is paused under Xcode's debugger; kill
its `debugserver` parent. Use `/usr/bin/log show --predicate 'process ==
"milmil"'` — bare `log` is a zsh builtin.
Navigation hooks: `MILMIL_SNAPSHOT_DESTINATION=<sidebar tab>`,
`MILMIL_SNAPSHOT_ANIME=<bangumiID>` (push the detail page),
`MILMIL_SNAPSHOT_PLAY=<bangumiID>` (open the in-app watch page on that series;
add `MILMIL_SNAPSHOT_WINDOW=player` for the pop-out window) and
`MILMIL_SNAPSHOT_CHROME=1` to stop the OSC auto-hiding,
`MILMIL_SNAPSHOT_DANMAKU=1` to inject 240 sample comments (the dev server has
no DandanPlay credentials), `MILMIL_SNAPSHOT_TORRENTS=<bangumiID>` (下載 › 找種子
on that title), `MILMIL_SNAPSHOT_DOWNLOADS_TAB=subscriptions`,
`MILMIL_SNAPSHOT_SETTINGS_TAB=integrations|notifications|account|…`.
`MILMIL_SNAPSHOT_DUMP=<file.json>` additionally writes the live player state
(stage, status, mpv track selection, time-pos, and the performance counters
`estimated-vf-fps` / `frame-drop-count` / `decoder-frame-drop-count` /
`vo-delayed-frame-count` / `avsync` / `hwdec-current`) next to the screenshot —
the way to verify subtitle/audio selection when the display is asleep, and the
ONLY way to verify playback smoothness: a static screenshot cannot see frame
drops (a 60% VO-drop bug once passed every snapshot check).
Pass `MILMIL_SNAPSHOT_TOKEN_FILE=<file with the mlml_ token>` to skip the
Keychain entirely — every rebuilt ad-hoc signature otherwise trips a keychain
prompt a headless run cannot answer. Use
`MILMIL_SNAPSHOT_COMPOSITE=1` for anything with video — the flattened render
cannot see the OpenGL picture — and launch through `open -n`, not the binary:
the window server returns a 198 px thumbnail for windows of a process that
LaunchServices did not activate.

A library with no files can be seeded with an ffmpeg test clip — `testsrc2`
video + `sine` audio + an SRT track muxed to `.../<Series name>/[Test] <Series
name> - 01 [1080p].mkv` — then `POST /api/v1/libraries/{id}/scan`; the
matcher resolves the folder name against Bangumi.

## Localization

Source language is zh-Hant: write UI literals in Traditional Chinese and keep
them as the catalog keys. SwiftUI initializers that take a
`LocalizedStringKey` (`Text`, `Button`, `Label`, `.help`, …) localize on their
own; anything that ends up as a plain `String` (enum labels, OSD text,
`EmptyState`/`PageHeader` params, `\(…)` built in helpers) must go through
`String(localized:)`. Interpolate `Int` or `String` only — a `Double` becomes
`%lf` ("1.500000"); format it first. Then run
`python3 scripts/i18n_sync.py` (from `macos/`): it extracts the keys into
`Milmil/Resources/Localizable.xcstrings` (`xcodebuild` never runs Xcode's own
extraction), keeps existing translations, and lists what is untranslated in
en / ja / ko / zh-Hans / zh-HK. Fill those in the catalog (Xcode's editor or
by hand); CI fails on a stale or partially translated catalog. Wording should
match the web `.po` files — zh-HK is written Cantonese there (睇晒, 收藏咗).
Test a locale with `open -n milmil.app --args -AppleLanguages "(ja)"`.

## Core Rules

1. **Read before editing.** Match surrounding style; SwiftUI-first, AppKit only
   behind `NSViewRepresentable` / window configuration.
2. **Strict concurrency.** Swift 6 language mode, `complete` checking. No
   `@unchecked Sendable` to silence the compiler; use actors, value types or
   `Mutex`.
3. **Keep `MilmilAPI` platform-neutral** — no AppKit/SwiftUI imports. UI
   types live in the app target.
4. **API parity with the web client.** Endpoint wrappers mirror
   `web/src/lib/api/*.ts` names; preferences share the same JSON keys.
5. **No unsolicited commits.** Conventional Commits with scope `macos`
   (`feat(macos): …`). Subject is sentence-case per commitlint.
6. **Don't start the app or servers for the user**; ask them to run and report.

## Quality Gates (all block CI)

```bash
swiftlint lint --strict                                  # 0 violations
swift test --package-path Packages/MilmilKit             # Swift Testing
swift test --package-path Packages/MilmilPlayer          # first run downloads MPVKit xcframeworks (~1 GB)
xcodegen generate && xcodebuild -project Milmil.xcodeproj -scheme Milmil \
  -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO build
```

## Things That Bite

- **Tokens never expire.** `mlml_…` lives in the Keychain keyed by the
  `ServerProfile.id`; a 401 means revoked → drop it and show login.
- **Booleans come as `0|1` from SQLite-backed rows.** Use `@LenientBool`;
  `genres` may be a JSON string → `@LenientStringArray`.
- **Dates:** Go RFC 3339 with nanoseconds *and* SQLite `yyyy-MM-dd HH:mm:ss`.
  `MilmilJSON.makeDecoder()` handles both; don't construct `JSONDecoder()`.
- **Paths are full** (`/api/v1/...`) and appended to the profile base URL,
  which may carry a reverse-proxy prefix.
- **Login rate limit:** 0.2 req/s per IP with burst 10 on the credential
  endpoints; back off on 429, never poll them.
- **Media URLs** use the bearer header via mpv `http-header-fields`;
  `?token=` is only for thumbnail VTT / sprite and sidecar-subtitle URLs that
  mpv or `URLSession` fetch without our headers.
- **mpv teardown order matters.** `MPVRenderLayer.teardown()` must free the
  render context before `mpv_terminate_destroy`; `MPVPlayer.destroy()` does
  this through the registered teardown closure — never call
  `mpv_terminate_destroy` elsewhere.
- **Local direct play.** `media_file.path` (server ≥ 0.1.18) + Settings ›
  播放 › 本機路徑對應 → `LocalPathMappings.localURL` → first rung of the
  stream ladder; the file must be readable locally or the rung is skipped.
- **Release builds have no DevSnapshot / InjectionIII** (all `#if DEBUG`);
  verify Release behaviour by launching `macos/DerivedData-release/…/milmil.app`.
- **One mpv instance per app.** `PlayerCoordinator` keeps the
  `PlayerController` alive across window close/open; `windowClosed()` stops
  playback, `shutdown()` destroys.
