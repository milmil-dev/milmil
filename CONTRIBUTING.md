# Contributing to milmil

Thanks for your interest in milmil. This guide covers how to set up a dev environment, the conventions we follow, and how to send a change.

If you're reporting a security issue, please follow [SECURITY.md](SECURITY.md) instead — do not open a public issue.

## Development Setup

### Prerequisites

- **Go** 1.26+
- **Bun** 1.3+
- **FFmpeg** (transcoding + media probing)
- **Redis** (optional — falls back to in-memory cache)
- **PostgreSQL** 16+ (production) or SQLite (dev default)

### Clone and bootstrap

```bash
git clone https://github.com/milmil-dev/milmil.git
cd milmil
make setup           # installs mise + air

cp api/.env.example api/.env
cp web/.env.example web/.env
# Edit api/.env: set JWT_SECRET (min 32 chars) and MILMIL_ENCRYPTION_KEY

make dev             # starts API (8080) + frontend (5173) with hot reload
```

See `api/.env.example` for the full list of API environment variables. SQLite + in-memory cache is the zero-config dev path; nothing else is required.

## Project Structure

```
api/         Go backend (Echo v4, sqlc, golang-migrate)
web/         React 19 SPA (Vite, TanStack Router, Tailwind v4)
docs-site/   Public documentation site (Next.js 16 + Fumadocs)
docs/        Internal design docs / specs / brand assets
.github/     CI workflows + community templates
```

Per-area conventions live in their own `AGENTS.md` / `CLAUDE.md` files (e.g. `web/AGENTS.md`).

## Workflow

1. **Find or open an issue** describing the change. Skip this for trivial fixes (typos, lint).
2. **Fork + branch** off `main`. Branch name: `feat/<topic>`, `fix/<topic>`, `docs/<topic>`, `chore/<topic>`.
3. **Code** — follow existing patterns; don't restructure unrelated code.
4. **Test** — see [Testing](#testing) below.
5. **Commit** using Conventional Commits (see below).
6. **Push** and open a PR against `main`. Fill out the PR template.
7. **Address review** — push fixups; squash on merge is the default.

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/) (enforced by Commitlint via Lefthook).

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

Common types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`.

Common scopes: `api`, `web`, `docs`, `i18n`, `downloads`, `library`, `player`, `auth`, `db`.

Examples:

```
feat(library): add SMB storage backend
fix(player): restore subtitle position after seek
docs(getting-started): clarify Postgres connection string
chore(deps): bump golang.org/x/net
```

Releases are managed by [release-please](.github/workflows/release-please.yml) — properly-typed commits drive the changelog and version bump automatically.

## Code Style

### Go (`api/`)

- `gofmt` + `go vet` clean.
- SQL queries live in `api/internal/store/queries/*.sql`; regenerate with `sqlc generate` after edits.
- Migrations are append-only — never edit a merged migration; add a new one.
- Prefer table-driven tests; use `httptest` + `testify` for handler tests.

### TypeScript (`web/`)

- Vite+ handles lint + format (`vp lint` = Oxlint, `vp fmt` = Oxfmt). Run `bun run lint:fix && bun run format` before pushing.
- Strict TS — no `any` without justification.
- Component patterns and i18n usage are documented in `web/AGENTS.md`.
- Wrap user-facing strings with Lingui (`msg\`...\``) — never hardcode UI text.

### Documentation (`docs-site/`)

- MDX with Fumadocs. Keep page frontmatter (`title`, `description`) accurate.
- Translate new pages into all 6 supported locales when feasible (en, ja, ko, zh-CN, zh-HK, zh-TW), or open a follow-up issue.

## Testing

Run everything before opening a PR:

```bash
make test            # Go unit + integration + frontend unit tests
make test-e2e        # Playwright E2E (requires both servers running)
make lint            # go vet + vp lint (Oxlint)
```

Targeted runs:

```bash
cd api && go test ./internal/library/...
cd web && bun run test:run -- HistoryFilterBar
cd web && bun run test:e2e --grep "watch history"
```

CI runs the same suites on every PR (see `.github/workflows/ci.yml`). PRs cannot merge with red CI.

## Internationalization (i18n)

milmil ships in English, Japanese, Korean, and three Chinese variants. Adding UI strings:

```bash
cd web
bun run i18n:extract        # pulls new msg`...` calls into all .po files
# translate the new entries in src/locales/{locale}/messages.po
bun run i18n:compile        # generates messages.ts bundles
```

PRs that add untranslated keys still get merged — translations can land in follow-ups — but please leave the English source string filled in.

## Pull Request Checklist

Before requesting review:

- [ ] Branch is rebased on the latest `main`.
- [ ] `make lint` and `make test` pass locally.
- [ ] New behavior has tests (unit / integration / E2E as appropriate).
- [ ] User-facing strings are wrapped in `msg\`...\``.
- [ ] No secrets, no debug `console.log` / `fmt.Println`, no commented-out code.
- [ ] Commit messages follow Conventional Commits.

## Reporting Bugs / Requesting Features

Use the issue templates under [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE). Before opening a new one, please search existing issues to avoid duplicates.

## License

By contributing, you agree that your contributions will be licensed under the [AGPL-3.0](LICENSE), the same license as the project.
