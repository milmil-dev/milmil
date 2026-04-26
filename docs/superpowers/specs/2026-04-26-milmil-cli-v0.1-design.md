# milmil CLI v0.1 + Agent Automation Design

**Date**: 2026-04-26
**Goal release**: v0.1 of agent automation surface for milmil. Subsequent releases (v0.2 MCP, v0.3 token scopes) get their own specs once v0.1 usage informs their design.

## Problem

milmil today exposes a REST API and a web UI. There is no way for a human admin or an AI agent to drive milmil from a terminal:

- Bulk operations (re-match a hundred files, mass-subscribe a season's worth of anime) require hundreds of clicks in the web UI.
- Cron / systemd / GitHub Actions can't trigger scans, queue downloads, or check status without scripting raw HTTP calls + manual JWT handling.
- AI agents (Claude Code, Cursor, Codex) can technically `curl` the REST API but pay the cost of every call: handle JWT auth, navigate undocumented pagination, parse REST envelopes, learn 130+ endpoint shapes (only 18 documented in OpenAPI per memory). The result is brittle, verbose agent code instead of high-leverage automation.

## Goals

1. A first-party `milmil` CLI binary that exposes high-value milmil operations as terminal commands using the existing `mlml_` API token system.
2. Two **autonomous macro actions** that solve concrete personal pain points:
   - `milmil match auto` — agent finds unmatched / mismatched files, retries across providers, applies high-confidence matches, reports the rest.
   - `milmil subscribe add "<title>"` — one command to plan-to-watch + create RSS rule for new episodes + queue missing past episodes via torrent search + sync status to Bangumi & AniList.
3. **Safety nets that make full autonomy actually safe**: server-side audit log, bulk undo, dry-run, and configurable confidence floor.
4. **End-to-end install→play coverage**: agent + docs + CLI between them can take a fresh user from `git clone` to a playable episode URL.
5. **Designed to ship publicly later**, not just for personal use — naming, error UX, and audit reporting assume the binary may eventually become a third-party install.

## Non-goals

- **MCP server** — designed in a separate v0.2 spec after CLI usage informs which patterns deserve typed tools.
- **API token scopes** (read-only / per-resource) — designed in a separate v0.3 spec; v0.1 trusts whoever holds the token.
- **CLI subcommands beyond what the killer use cases need** — `download`, `rss` (manual mgmt), `settings`, `user`, `rename`, `missing`, `pref`, `notification`, `status`, `disk`, `log` are deferred to v0.1.5+ and added on demand.
- **`milmil quickstart` automated install bootstrap** — install relies on the existing rewritten install docs + manual web UI for first admin + manual API-token paste.
- **Streaming live progress** in CLI (live scan progress display, real-time download progress) — needs SSE / MCP resources, deferred to v0.2.
- **Multi-server profiles** (`MILMIL_PROFILE=home/remote`) — single server per config file in v0.1.
- **Hand-curated per-platform agent skills committed to the repo** — replaced by the `milmil agents-guide` + `milmil generate-skill` design (single source of truth in the binary, on-demand shims for any agent format).

## Design

### Audience and goal recap

Primarily for the maintainer's own use today, intentionally designed so it can ship publicly later. Two killer use cases anchor every design decision:

1. **Autonomous bulk metadata fix** — the maintainer regularly has dozens-to-hundreds of files in an `unmatched` or `mismatched` state after each library scan. Web UI requires per-file click-through. CLI replaces this with one command.
2. **Autonomous full subscribe** — `milmil subscribe add "Frieren"` is a macro that performs plan-to-watch + RSS rule creation + missing-episode torrent search + Bangumi/AniList sync as a single user-facing action.

Full autonomy is the chosen autonomy level. Safety nets (audit log, bulk undo, dry-run, confidence floor) are the way that's made workable.

### CLI subcommand surface

```
milmil
├─ auth             login / status / logout
├─ library          list / add / scan / stats
├─ search           anime / files
├─ episode          list / show / watch-url
├─ watch            resolve "<title>" --episode N
├─ match            auto / list / apply / undo / suggest
├─ subscribe        add / list / undo
├─ audit            list / show <id>
├─ token            list / revoke
├─ agents-guide     (prints embedded markdown agent guide)
├─ generate-skill   --format <claude|cursor|agents-md|hermes|openclaw|...>
└─ version
```

Every command supports `--json` (machine output) and `--help` (human discovery). Every mutating command supports `--dry-run`.

#### Sample command UX

```bash
# Use case #1 — bulk match
milmil match auto --library 1 --confidence-floor 0.85
# > Examined 247 unmatched files.
# > Applied 198 (high confidence).
# > Skipped 49 (low confidence) — see 'milmil match list --status low-confidence'.
# > Audit: 198 entries written. Undo: 'milmil match undo --since 2m'.

# Dry-run preview
milmil match auto --library 1 --dry-run

# Use case #2 — full subscribe
milmil subscribe add "Sousou no Frieren"
# > Resolved: Bangumi 425998 / AniList 154587 (confidence 0.97).
# > Added to plan-to-watch.
# > RSS rule created: 'ANi 1080p chs/cht'.
# > Found 12 missing past episodes — queued in download queue.
# > Synced status to Bangumi (planning) + AniList (planning).
# > Audit: subscribe entry #f3a2. Undo: 'milmil subscribe undo --id f3a2'.

# Watch resolution (end-to-end)
milmil watch resolve "Frieren" --episode 5 --json
# > {
# >   "anime_id": 425998,
# >   "episode": 5,
# >   "watch_url": "http://localhost:3000/watch/425998/abc123",
# >   "stream_url": "http://localhost:8080/api/v1/files/abc123/stream",
# >   "matched_file": "/media/anime/Frieren/[ANi] Frieren - 05.mkv"
# > }
```

### Server-side macro endpoints

`milmil match auto` and `milmil subscribe add` are macro actions that touch many resources. They are implemented as **server-side endpoints** — not as client-side orchestration in the CLI:

| New endpoint | Purpose |
|---|---|
| `POST /api/v1/match/auto` | Find unmatched files in a library, retry across providers, apply matches above confidence floor, return summary + audit IDs. Atomic per-file with rollback. |
| `POST /api/v1/subscribe` | Resolve title → write plan-to-watch + create RSS rule + run missing-episode torrent search + queue downloads + push status to Bangumi & AniList. Atomic per-sub-action with audit parent linkage. |
| `GET /api/v1/audit` | Paginated audit log query (filter by user, action_type, time range, status). |
| `POST /api/v1/audit/undo` | Reverse an audit entry or batch (by id, by --since window, or by parent_id). Returns per-entry success/conflict result. |
| `GET /api/v1/library/{id}/scan/wait` | Block (long-poll or SSE) until in-progress scan completes. Used by `milmil library scan --wait`. Falls back to polling if SSE not available. |
| `GET /api/v1/search/anime?q=...` | Fuzzy title search across local DB + integrated providers (already partially exists; consolidated and exposed under one stable endpoint for CLI). |
| `GET /api/v1/episodes/{id}/watch-url` | Returns the canonical web watch URL + stream URL for a matched episode. Server is the source of truth for URL shape (web client doesn't need to hardcode it in CLI). |

These endpoints retrofit the new audit-log middleware described below.

### Autonomous-mode safety nets

#### Audit log

New `audit_log` table written to by every mutating endpoint:

```
audit_log
├─ id              short slug (e.g. "f3a2") — used in CLI --id references
├─ user_id         which user
├─ token_id        which API token did this (null if web UI / password auth)
├─ agent_label     denormalised token name like "claude-code-laptop" — survives token revoke
├─ action_type     'match.apply' / 'subscribe.add' / 'download.queue' / 'rss.create' / 'sync.bangumi' / 'sync.anilist' …
├─ target_type     'file' / 'anime' / 'rss_rule' / 'download'
├─ target_id       the entity being mutated
├─ before          JSON snapshot of state before
├─ after           JSON snapshot of state after
├─ confidence      0.0-1.0 (null if not autonomous)
├─ parent_id       points to parent macro entry (subscribe → many child entries)
├─ dry_run         bool (dry-runs ARE logged, with this flag)
├─ created_at, undone_at, undone_by
```

The table lives in milmil's existing DB (SQLite or Postgres — same migration system).

Middleware retrofitted onto every mutating endpoint writes audit entries automatically. Macro endpoints (`/match/auto`, `/subscribe`) write a parent entry plus child entries linked by `parent_id`.

#### Undo

`milmil match undo --id <id>` / `milmil subscribe undo --id <id>` / `milmil audit undo --id <id>`:

| Action type | Reverse |
|---|---|
| `match.apply` | Set file's `anime_id` / `episode_id` back to `before` snapshot |
| `subscribe.add` | Reverse all child entries (parent_id = this) — delete plan-to-watch, delete RSS rule, cancel queued downloads, push status revert to Bangumi & AniList |
| `download.queue` | Cancel + dequeue (does NOT delete already-downloaded data) |
| `rss.create` | Delete the RSS rule |
| `sync.bangumi` / `sync.anilist` | OAuth API call to revert status. **Best-effort** — if remote was changed by someone else after our sync, conflict logged & skipped (not blindly overwritten) |

Undo writes a NEW audit entry referencing the original via `undone_by`. Things genuinely not reversible (physical files already downloaded, OAuth conflicts, OAuth tokens revoked) are reported but not auto-fixed.

`milmil match undo --since 1h` performs batch undo over all matching action_types in the window. Always asks for `[y/N]` interactive confirmation with summary first.

Macro-level undo only — cannot selectively undo "just the RSS rule from this subscribe" while keeping the rest. Partial revert requires web UI.

#### Dry-run

`--dry-run` flag on every mutating command. Implementation:
- Server endpoint accepts `?dry_run=true` query param
- Pipeline runs to completion server-side BUT skips actual write step
- Returns identical response shape with `dry_run: true` in JSON metadata
- Audit entries ARE written with `dry_run=true` (so reviewers can see what an agent WOULD have done)

CLI prefixes every line of output with `[DRY-RUN]` for visual obviousness.

#### Confidence floor

Server-side computation in macro endpoints:

| Source | Raw score | Normalized to 0-1 |
|---|---|---|
| DandanPlay hash match | exact match boolean | 1.0 if match, else 0.0 |
| Bangumi title match | bgm internal score | linear rescale |
| AniList title match | similar | linear rescale |
| TMDB cross-ref | similar | linear rescale |
| AniDB title match | similar | linear rescale |

**Aggregation** when multiple providers agree on the same target:

```
agreement_count >= 2 → confidence = min(0.99, max_score + 0.10)
agreement_count == 1 → confidence = max_score
```

**Default floor**: `0.85` (conservative — typical pass: Bangumi/AniList both agreeing, or DandanPlay hash hit).

**Configurable per command** via `--confidence-floor 0.95` or persisted via `UserPreference` key `agent.confidence_floor`.

Below floor → not applied, listed in result as `low_confidence` with their scores. User can manually approve via `milmil match apply --file X --anime-id Y`, lower the floor for one run, or inspect via audit log.

### Auth

Reuse the existing `mlml_` API tokens — no new auth system.

```bash
milmil auth login --server http://localhost:8080
# > Token: mlml_xxxxxxxxxxxxxxxx
# Stored at ~/.config/milmil/credentials (mode 0600)

milmil auth status
# > Logged in as 'sin' to http://localhost:8080
# > Token: claude-code-laptop  (last used 2m ago)

MILMIL_SERVER=http://nas.local:8080 MILMIL_TOKEN=mlml_xxx milmil library list

milmil auth logout
```

Precedence: env vars > config file > error. Single server per config in v0.1.

Token bootstrap (Step 3 of end-to-end install) is **manual**: the user generates the first token via web UI Settings → API Tokens, then pastes it to `milmil auth login`. No automated bootstrap in v0.1.

### User preferences

Reuse the existing `UserPreference` key-value table (no schema change). Autonomous `subscribe` reads these:

| Key | Example | Used by |
|---|---|---|
| `agent.confidence_floor` | `0.85` | `match auto` |
| `subscribe.preferred_subgroups` | `["ANi", "SubsPlease", "喵萌奶茶屋"]` | RSS rule selection + torrent search ranking |
| `subscribe.preferred_resolution` | `1080p` | RSS rule + missing-search filter |
| `subscribe.preferred_audio_lang` | `ja` | search ranking |
| `subscribe.preferred_subtitle_lang` | `zh-Hans` | search ranking |
| `subscribe.auto_sync_external` | `true` | gates Bangumi/AniList sync sub-action |

**v0.1 behaviour for missing prefs**:
- Server reads via existing `GET /api/v1/preferences/{key}`
- If a critical pref is unset on first `subscribe add` run, CLI prompts user once interactively, then writes via `PUT /api/v1/preferences/{key}`
- Subsequent runs read the saved value silently
- `milmil pref` subcommand to view/edit deferred to v0.1.5 — for now, edit via web UI Settings

### Distribution

CLI binary lives in same repo as the server, separate entrypoint:

```
api/
├─ cmd/
│  ├─ server/      ← existing  (./milmil-api binary)
│  └─ cli/         ← NEW       (./milmil binary)
```

- Built with `go build -o milmil ./cmd/cli`
- Distributed via GitHub Releases — Goreleaser builds `milmil_v0.1.0_{darwin,linux,windows}_{amd64,arm64}` on tag push
- Homebrew tap (`brew install milmil-dev/tap/milmil`) added in v0.1.x once releases work
- No Docker image for CLI in v0.1 (low priority — most users want it on their laptop)

CLI does NOT need server present locally — talks over network. Same Go module avoids API drift.

### Agent integration — single source of truth, agent-agnostic

The maintainer uses many AI agents (Claude Code, OpenClaw, Hermes, Codex, Cursor, Aider, …) and switches frequently. Shipping per-platform skill files in the repo would require maintaining N format variants in sync. Instead, the design embeds the canonical agent guide INTO the CLI binary itself, with optional generators for users who want platform-specific auto-discovery.

**1. `milmil agents-guide` subcommand** — primary deliverable.

Prints a ~150-line markdown guide covering:
- Pre-flight: confirm `milmil` binary in `$PATH` and `milmil auth status` passes.
- **Recipe 1 — Bulk metadata fix**: `milmil match list --status unmatched --json` → review counts → `milmil match auto --library X --dry-run` → apply if user OKs → `milmil audit list --since 5m`.
- **Recipe 2 — Subscribe**: `milmil subscribe add "<title>" --dry-run` → show plan → `milmil subscribe add "<title>"` → audit summary.
- **Recipe 3 — Watch tonight**: `milmil watch resolve "<title>" --episode N` → print URL for the user to open.
- Common pitfalls: low-confidence interpretation, undo syntax, OAuth re-auth needed if Bangumi/AniList tokens expired.

The guide content lives in the CLI source tree as a markdown file embedded at build time (`go:embed`). Single source of truth — update once, every agent that runs the command sees the new version.

**2. Surfaced via `milmil --help`**

The top-level `milmil --help` ends with a discoverability hint so any agent that runs it as a first step finds the guide automatically:

```
TIP: AI agents — run `milmil agents-guide` for usage recipes designed for autonomous use.
```

**3. Optional auto-discovery shims via `milmil generate-skill`**

For users who want their agent to discover milmil without explicit `agents-guide` invocation, the CLI generates platform-specific shim files on demand:

```bash
milmil generate-skill --format claude > ~/.claude/skills/milmil/SKILL.md
milmil generate-skill --format cursor > .cursorrules
milmil generate-skill --format agents-md >> AGENTS.md         # Codex / Aider / generic
milmil generate-skill --format hermes > .hermes/milmil.md      # placeholder pending Hermes spec
milmil generate-skill --format openclaw > .openclaw/milmil.md  # placeholder pending OpenClaw spec
```

Each shim is a 2-3 line redirect: `Use when user mentions milmil. Run \`milmil agents-guide\` first.`

Adding a new agent format = adding one `--format` value with the shim template; no duplication of recipe content.

**Why no shims pre-committed to the milmil repo**:
- Anyone who clones the milmil repo is modifying milmil source, not using milmil — wrong audience for `.claude/skills/milmil/`.
- Users who installed the CLI elsewhere generate shims into their own workspace as needed.
- Milmil's repo has its own `web/AGENTS.md` for source-modification work; CLI usage is a different concern.

**Documentation surface**:
- `docs-site/content/docs/configuration/ai-agents.mdx` (NEW) — explains `milmil agents-guide` and `milmil generate-skill`, lists currently supported `--format` values, walks through wiring up Claude Code / Cursor / Codex.

### End-to-end install→play coverage

| # | Step | v0.1 coverage |
|---|---|---|
| 1 | `git clone` + `cp .env` + `openssl rand -hex 32` + `docker compose up -d` | install docs (already shipped) — agent reads, runs via Bash |
| 2 | First-run admin signup | existing web UI wizard, or `ADMIN_USER`/`ADMIN_PASSWORD` env bypass |
| 3 | Generate first API token | manual via web UI Settings |
| 4 | `milmil auth login` (paste token) | new CLI |
| 5 | `milmil library add --path /media/anime` | new CLI + new server endpoint `POST /api/v1/library` (some shape exists; needs CLI alignment) |
| 6 | `milmil library scan --wait` | new CLI + new server endpoint with long-poll/SSE |
| 7 | `milmil search anime "Frieren"` | new CLI + new server endpoint |
| 8 | `milmil watch resolve "Frieren" --episode 5` → print URL | new CLI + new server endpoint |

User opens the URL in a browser. milmil's existing video player handles playback.

## Validation

**Functional**:
- Fresh install on a clean machine following only the install docs + this CLI reaches a played episode in ≤ 15 minutes.
- `milmil match auto` against a library with 100+ unmatched files completes without manual intervention. Audit log captures every applied match.
- `milmil match undo --since 5m` cleanly reverts a `match auto` run; file states match pre-run snapshot.
- `milmil subscribe add "<title>"` on a series with 5+ missing past episodes creates the RSS rule, queues downloads, syncs to both Bangumi and AniList. Undo reverts all three.
- `--dry-run` produces identical plan output to real runs without mutating state.

**Integration**:
- Server `bun run check:all` and `go test ./...` pass.
- New endpoints have integration tests covering happy path + dry-run + undo for each macro.
- CLI has end-to-end tests against a local milmil instance (Docker compose in CI).

**UX**:
- A new user with the CLI installed runs `milmil agents-guide` from any directory inside their preferred AI agent and successfully completes both killer-use-case recipes (bulk match + subscribe) without external help.
- `milmil generate-skill --format <fmt>` produces a working shim for at least Claude Code, Cursor, and AGENTS.md (Codex / Aider) targets. Shim correctly redirects the agent to `milmil agents-guide`.
- `milmil --help` lists all subcommands with one-line descriptions; every subcommand `--help` shows usage examples.

## Risks

- **Confidence model is hard to tune without ground-truth data**. The 0.85 default is a guess; actual accuracy curves require running against real libraries. Mitigation: dry-run logs everything so we can analyse hit/miss rates and tune thresholds in v0.1.x patch releases.
- **Bangumi/AniList undo conflicts**. If user changes status manually on Bangumi after autonomous sync, undo can't safely revert. Mitigation: explicit conflict reporting; user handles manually. Alternative would require version vectors / merge logic — out of scope for v0.1.
- **Server endpoint changes break CLI in lockstep**. Mitigation: CLI shipped from same repo; CI runs CLI integration test against the just-built server image; release-please bumps both versions together.
- **Token bootstrap UX friction**. Manual web-UI-paste flow is the same as `gh auth login --with-token` — well-understood, but new users may stumble. Mitigation: `milmil agents-guide` content walks them through it; v0.2 may add automated bootstrap.
- **Macro endpoints have many failure modes**. `subscribe.add` touching 5 systems (DB, RSS, downloads, Bangumi, AniList) means many partial-failure paths. Mitigation: each sub-action is its own audit entry, transactional where possible; macro returns success/failure per sub-action so user sees what landed and what didn't.

## Open items (resolve in implementation, not design)

- Exact wire format for `--json` output across all subcommands. Probable choice: stable per-subcommand schema documented in CLI `--help`.
- Whether `library scan --wait` uses SSE, long-poll, or both (decided based on existing scan-progress infrastructure in `api/internal/library/`). Either way, CLI fallback to client-side poll if server doesn't support streaming.
- Goreleaser config specifics — taps, signing, checksums.
- Per-format shim templates produced by `milmil generate-skill` — exact wording for each target (Claude Code SKILL.md frontmatter, `.cursorrules` syntax, AGENTS.md heading conventions). Verify against current upstream docs of each agent during implementation; placeholder Hermes / OpenClaw entries finalize when their skill conventions are pinned down.
- Embedded `agents-guide` markdown source location — likely `api/cmd/cli/agents_guide.md` with `go:embed`, but final path picked during implementation alongside Goreleaser config.
- Audit log retention policy — fine to retain forever in v0.1 (rows are small); add prune subcommand in v0.2 if it grows.
