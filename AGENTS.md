# AI Agent Instructions

## Overview

milmil is a self-hosted anime media server: library management, a seasonal
calendar, downloads, and a player with danmaku. It is a monorepo of three
independently built workspaces.

| Workspace | What it is | Toolchain |
|---|---|---|
| `api/` | Go backend — HTTP API, scanner, matcher, downloader, Jellyfin-compatible layer | Go 1.26.1 |
| `web/` | React SPA served as a static bundle by nginx | Bun 1.4.0 |
| `docs-site/` | Public documentation site (Next.js + Fumadocs) | Bun 1.4.0 |

Each workspace has its own `AGENTS.md`; read the one for the code you are
touching. Tool versions are pinned in `mise.toml` and mirrored into
`.github/workflows/ci.yml` — change both together.

## Core Rules

1. **Read before editing.** Match the surrounding style rather than importing
   your own conventions.
2. **No unsolicited commits.** Commit only when asked.
3. **Don't start dev servers.** Ask the user to run them and report back.
4. **Conventional Commits.** Releases are cut by release-please from commit
   messages, so `feat:`/`fix:`/`chore:` prefixes decide the next version.
   Commitlint enforces this via a lefthook `commit-msg` hook.

## Quality Gates

CI has no informational-only steps: everything below blocks a merge. Run the
gate for whatever you touched before handing work back.

```bash
# api/
gofmt -s -l .            # must print nothing
golangci-lint run ./...  # must report 0 issues
go test ./...
go test -race ./...      # slow, but the gate CI enforces

# web/
bun run check:all        # typecheck + lint + format:check + unit tests
bun run knip             # unused files, exports and dependencies
bunx playwright test     # e2e; specs stub the API with page.route

# docs-site/
bun run lint && bun run types:check && bun run build && bun run test:e2e
```

Install the git hooks once with `cd web && bun run lefthook`; they run the
cheap formatting and lint jobs on staged files.

## Common Tasks

```bash
make dev        # API (air) + web (vite) together
make dev-api    # API only
make dev-web    # web only
make test       # Go unit + integration + frontend unit tests
make kill       # free the dev ports
```

## Things That Bite

- **`api/internal/store/*.sql.go` is generated.** Edit
  `api/internal/store/queries/*.sql` and run `sqlc generate`. sqlc is pinned to
  1.30.0 in `mise.toml` because newer versions change generated signatures.
- **`api/internal/api/openapi.json` is hand-written** and the docs site builds
  its API reference from it. `TestOpenAPISpecMatchesRegisteredRoutes` fails if a
  route and the spec disagree, so a new endpoint means a new spec entry.
- **Two auth schemes.** The main API uses opaque `mlml_` tokens stored in
  `api_tokens`; the Jellyfin compatibility layer issues JWTs. See
  `api/AGENTS.md`.
- **The frontend has no generated client.** `web/src/lib/api/*.ts` is written by
  hand, so an API change needs a matching frontend change.
- **i18n is compiled.** Run `bun run i18n:compile` in `web/` before a build, or
  translations resolve to their message IDs.
