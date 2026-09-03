# AI Agent Instructions

## Overview

`android/` is the native Android client for milmil: Kotlin + Jetpack Compose
(Material 3), Ktor for HTTP, CameraX + ML Kit for the pairing scan. It talks to
the same `/api/v1` the web app uses. Design and phase plan:
`docs/plans/2026-08-27-mobile-clients-design.md` / `-plan.md`.

| Part | What it is |
|---|---|
| `core/api` | Pure-JVM module, no Android imports: `ApiClient`, models, the lenient decoders, `PairLink`. The Kotlin twin of `macos/Packages/MilmilKit/MilmilAPI`. |
| `app` | The Compose app. `MainActivity` owns the nav host; each tab is a `ViewModel` + a screen in `Screens.kt`. |
| `gradle/libs.versions.toml` | Version catalog — the single place dependency versions live. |

## Toolchain

The JDK is pinned in `mise.toml` (root); Gradle comes from the committed
wrapper, so a clean clone needs nothing installed but a JVM.

```bash
cd android
./gradlew :core:api:test :app:testDebugUnitTest   # unit tests
./gradlew lintDebug                               # Android Lint (blocks CI)
./gradlew assembleDebug                           # APK → app/build/outputs/apk/debug
adb -s emulator-5554 install -r app/build/outputs/apk/debug/app-debug.apk
```

`AGP 9 has Kotlin built in.` Applying `kotlin.android` on top of
`android.application` fails with a duplicate `kotlin` extension — the app
module deliberately applies only AGP plus `kotlin.compose`.

## Core Rules

1. **Read before editing.** Match surrounding style; Compose-first.
2. **Keep `core/api` free of Android imports** so it stays unit-testable on the
   JVM. Anything platform-specific (Keystore, CameraX) lives in `app`.
3. **API parity with the web client.** Endpoint wrappers mirror
   `web/src/lib/api/*.ts` names; preferences share the same JSON keys as the
   macOS and iOS clients.
4. **No unsolicited commits.** Conventional Commits with scope `android`.
5. **Don't start emulators or servers for the user**; ask them to run and report.

## Quality Gates (all block CI)

```bash
./gradlew lintDebug
./gradlew :core:api:test :app:testDebugUnitTest
./gradlew assembleDebug
```

## Release

`release-android.yml` builds a signed APK + AAB on every `v*` tag and attaches
them to the GitHub release as `milmil-android-<version>.apk` / `.aab`
(`workflow_dispatch` builds them as a run artifact only). The version comes
from the `// x-release-please-version` line in `app/build.gradle.kts`, which
release-please bumps with the rest of the monorepo; `versionCode` is derived
from it, never edited by hand.

Signing reads `MILMIL_ANDROID_KEYSTORE`, `..._KEYSTORE_PASSWORD`,
`..._KEY_ALIAS` and `..._KEY_PASSWORD` from the environment. CI fills them
from the `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD` secrets, which
`scripts/make-keystore.sh` creates along with the keystore. The key is
permanent — a different one means users must uninstall to upgrade — so the
`.jks` is gitignored and must be backed up outside the repo.

## Things That Bite

- **The server sends explicit `null`s** where a Kotlin default would do, so
  `MilmilJson` sets `coerceInputValues = true`. Constructing a bare
  `Json { }` anywhere else reintroduces the crash.
- **Booleans come as `0|1`** from SQLite-backed rows (`LenientBoolSerializer`),
  and `genres` may arrive as a JSON *string* (`LenientStringListSerializer`).
- **Dates:** Go RFC 3339 with nanoseconds, SQLite `yyyy-MM-dd HH:mm:ss`, and
  bare `yyyy-MM-dd`. `MilmilDate` parses all three.
- **Send `X-Milmil-Locale`.** Without it the server answers in English no
  matter what the device is set to; `ApiClient` adds it from the app locale.
- **A self-hosted server is usually plain HTTP.** `network_security_config.xml`
  permits cleartext — without it every request to a home-LAN server fails with
  a bare `CLEARTEXT communication not permitted`.
- **`browse` can return the same `bangumi_id` twice** (see #136), which crashes
  a `LazyColumn` keyed on it. Every list endpoint goes through `.deduped()`.
- **Tokens never expire.** `mlml_…` lives in EncryptedSharedPreferences keyed
  by the server URL; a 401 means revoked → drop it and show pairing.
- **Login rate limit:** 0.2 req/s per IP with burst 10; back off on 429.
- **A glob inside KDoc opens a nested comment.** Kotlin block comments nest, so
  `/** … api/*.ts … */` swallows the rest of the file. Write such paths in
  backticks or use `//`.
- **`ANDROID_SERIAL` may point at an absent device.** Always
  `adb -s emulator-5554 …` rather than relying on the default target.
