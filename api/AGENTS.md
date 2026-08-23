# AI Agent Instructions — api/

## Overview

The milmil Go backend. Serves the HTTP API the SPA talks to, plus a
Jellyfin-compatible API so external players (Infuse, VLC, Kodi, mpv) can browse
and stream the same library. Also hosts the scanner, metadata matcher,
downloader and notification workers.

Read the repo-root `AGENTS.md` first for the rules that span all workspaces.

## Layout

```
cmd/server/        Server entrypoint and the `admin` CLI (password reset, etc.)
cmd/cli/           The standalone milmil CLI
internal/api/      HTTP handlers, router, middleware  ← one package, ~60 files
internal/store/    sqlc-GENERATED database access (do not hand-edit)
internal/jellyfin/ Jellyfin-compatible API surface
internal/library/  Scanning, renaming, completeness, duplicates
internal/matcher/  Filename parsing and anime matching
internal/metadata/ Provider aggregation (Bangumi, AniList, TMDB, AniDB)
internal/storage/  Local / SMB / SFTP / rclone backends
migrations/        Numbered golang-migrate pairs, embedded via embed.go
```

## Database

Both SQLite (default, `modernc.org/sqlite` — no cgo) and PostgreSQL are
supported from one set of migrations, so migration SQL must be valid on both.

**Queries are generated.** The workflow is:

1. Edit `internal/store/queries/<table>.sql`
2. Run `sqlc generate` (pinned to 1.30.0 — see `mise.toml`)
3. Never edit `internal/store/*.sql.go` by hand

Adding a column means a new numbered pair in `migrations/`. Tests build their
schema by running the real migrations; do not hand-copy a `CREATE TABLE` into a
test fixture, because the copy drifts the moment anyone adds a column.

## Authentication

There are two schemes, and they revoke differently:

- **Main API** — opaque tokens (`mlml_` + 32 random bytes), SHA-256 hashed into
  `api_tokens`. Revocable by deleting the row, which is what logout and
  "sign out other devices" do.
- **Jellyfin layer** — HS256 JWTs, because Jellyfin clients expect a bearer
  token they can hold. A JWT cannot be deleted, so `users.token_version` is
  embedded in the claims and checked on every request; changing a password
  bumps it and invalidates every outstanding token.

`/ws` cannot carry an Authorization header, so clients call
`GET /api/v1/ws/ticket` and redeem the single-use ticket as `?ticket=`.
Streaming endpoints accept `?token=` because a `<video>` element cannot set
headers — `redactURI` keeps both out of the access log.

## OpenAPI

`internal/api/openapi.json` is hand-maintained and embedded, and `docs-site`
generates its public API reference from it. `TestOpenAPISpecMatchesRegisteredRoutes`
compares the spec against `e.Router().Routes()` in both directions, so:

- a new route needs a new spec entry, and
- a removed route needs its spec entry removed.

Routes deliberately left undocumented are listed in `notInSpec` in that test,
each with a reason. The whole `/jellyfin` prefix is excluded — it implements
someone else's contract.

## Watch Status

`sync.DeriveStatus` computes the canonical status for a (user, anime) pair and
is what gets pushed to AniList, Bangumi and Trakt. Precedence:

1. `anime.watch_status_override` wins unconditionally.
2. All episodes complete → completed.
3. Partway through, and `anime_watch_state.times_completed > 0` → repeating.
4. Otherwise watching / planning / none.

Rule 3 needs the stored counter: a part-watched episode looks identical on a
first pass and on a rewatch, so it cannot be derived from `watch_progress`
alone. Call `sync.RecordSeriesCompletion` after any write that can finish a
series — it is idempotent and ignores series that are not complete.

Note the Jellyfin layer never sets `completed = 1`; external players record
position only, so nothing there can finish a series today.

## Quality Gates

```bash
gofmt -s -l .            # must print nothing (note the -s)
golangci-lint run ./...  # must report 0 issues; config in .golangci.yml
go test ./...
go test -race ./...
go build ./cmd/server
```

`errcheck` is on and only excludes teardown calls that have no recovery path
(see `.golangci.yml`). If an error genuinely cannot be acted on, write
`_ = thing()` with a short reason rather than dropping it silently.

Wall-clock assertions must be skipped under `-race`, which slows execution
about tenfold — see `raceEnabled` in `internal/integration/anidb`.
