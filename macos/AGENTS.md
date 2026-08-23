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
| `Packages/MilmilKit` | Local SwiftPM package, platform-neutral: `MilmilAPI` (client, models, Keychain). Nonisolated by default; everything is `Sendable`. |

## Toolchain

Pinned in `mise.toml` (root): `xcodegen`, `swiftlint`. Xcode 26+ (Swift 6.2
language features, macOS 15 deployment target, arm64 only).

```bash
make macos-gen     # xcodegen generate
make macos-test    # swift test in Packages/MilmilKit
make macos-build   # xcodebuild the app (Debug, ad-hoc signed)
make macos-lint    # swiftlint --strict
```

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
- **Media URLs** will use the bearer header via mpv `http-header-fields`;
  `?token=` is only for sprite URLs inside thumbnail VTTs.
