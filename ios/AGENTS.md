# AI Agent Instructions

## Overview

`ios/` is the native iOS client for milmil: SwiftUI with the iOS 26 Liquid
Glass idiom, sharing its whole networking and danmaku core with the macOS
client. Design and phase plan:
`docs/plans/2026-08-27-mobile-clients-design.md` / `-plan.md`.

| Part | What it is |
|---|---|
| `project.yml` | XcodeGen spec. `Milmil.xcodeproj` is generated, never committed. |
| `Milmil/` | App target. `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, deployment target iOS 26. |
| `Milmil/Design/Glass.swift` | The shared glass vocabulary — capsule tab bar, glass chips, ink-filled prominent buttons. |

**`MilmilKit` is not copied here.** The target references
`../macos/Packages/MilmilKit`, so `MilmilAPI` / `MilmilRealtime` /
`MilmilDanmaku` are literally the same code both clients run. A change for one
lands on the other; the CI iOS build exists to catch the cases where that is
not what you wanted.

## Toolchain

`xcodegen` is pinned in `mise.toml` (root). Xcode 26+.

```bash
cd ios
xcodegen generate --quiet
xcodebuild -project Milmil.xcodeproj -scheme Milmil \
  -destination 'generic/platform=iOS Simulator' -configuration Debug \
  CODE_SIGNING_ALLOWED=NO -quiet build
```

**There is no Apple Developer account for this project**, so the iOS client
cannot be distributed — no TestFlight, no App Store, no ad-hoc profile. It
builds and runs in the Simulator (and on a personally-provisioned device);
treat shipping as blocked until an account exists.

## Core Rules

1. **Read before editing.** SwiftUI-first; match `macos/`'s conventions since
   the two share a package.
2. **Strict concurrency.** Swift 6 language mode, `complete` checking.
3. **Keep `MilmilAPI` platform-neutral** — anything that needs UIKit or AppKit
   belongs in the app target. `DeviceName.current()` is the pattern: one
   `#if os(macOS)` branch inside the package, not a fork of the package.
4. **`.glassProminent` fills with ink, never the accent.** The accent is for
   emphasis on glass, not for the fill.
5. **No unsolicited commits.** Conventional Commits with scope `ios`.

## Quality Gates (all block CI)

Built as part of the macOS job, since it is the same package:

```bash
swift test --package-path ../macos/Packages/MilmilKit
xcodegen generate && xcodebuild -project Milmil.xcodeproj -scheme Milmil \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

## Things That Bite

- **Source language is zh-Hant.** `developmentLanguage` is not cosmetic:
  `APIClient` sends the bundle's resolved localization as `X-Milmil-Locale`, so
  changing it changes what language the server answers in.
- **iOS 26 asks "Open in …?" before a custom-scheme URL**, which blocks
  `simctl openurl` in an unattended run and cannot be dismissed by a
  synthesized click. Debug builds read `MILMIL_PAIR_LINK` instead — the iOS
  twin of the macOS `MILMIL_SNAPSHOT_*` hooks.
- **A self-hosted server is usually plain HTTP**, so `NSAppTransportSecurity`
  allows arbitrary loads. Removing it breaks every home-LAN server.
- **XcodeGen writes `1.0` / `1`** unless `CFBundleShortVersionString` and
  `CFBundleVersion` are set to `$(MARKETING_VERSION)` / `$(CURRENT_PROJECT_VERSION)`
  — the bug the macOS client shipped with until 0.1.20.
- The rest of the API-shaped traps (`0|1` booleans, dual date formats, tokens
  that never expire, the login rate limit) are shared with macOS and documented
  in `macos/AGENTS.md`.
