# CI/CD + Release Please — Design Spec

**Date:** 2026-04-13
**Scope:** GitHub Actions CI/CD, Release Please, Docker image publishing, Vercel docs deployment

## Goal

Set up automated CI, versioning, and publishing for the milmil monorepo using GitHub Actions, Release Please (conventional commits), GHCR for Docker images, and Vercel for the docs website.

## Workflows

### 1. CI (`ci.yml`)

**Triggers:** Pull requests + push to main

**Jobs (parallel):**

- **go**: Go 1.26, run `go vet ./...`, `go test ./...`, `go build ./cmd/server`
- **web**: Bun 1.3, run `bun run lint`, `bun run test:run`, `bun run i18n:compile && bun run build`
- **docs**: Bun 1.3, run `bun run build` in `website/`

All three jobs run in parallel. PR merges blocked unless all pass.

### 2. Release Please (`release-please.yml`)

**Triggers:** push to main

**Behavior:**
- Uses `googleapis/release-please-action@v4`
- Reads conventional commit messages (`feat:`, `fix:`, `chore:`, etc.)
- Maintains a release PR that auto-updates with each push to main
- When the release PR is merged: creates a GitHub release + git tag (`vX.Y.Z`)
- Auto-generates CHANGELOG.md

**Config:**
- `release-please-config.json` — single package at repo root, release type `simple`
- `.release-please-manifest.json` — tracks current version

### 3. Publish (`publish.yml`)

**Triggers:** tag `v*` created (by Release Please)

**Jobs:**

- **docker-api**: Build and push `ghcr.io/milmil-dev/milmil-api:vX.Y.Z` + `:latest`
- **docker-web**: Build and push `ghcr.io/milmil-dev/milmil-web:vX.Y.Z` + `:latest`

Uses `docker/build-push-action` with GHCR login via `GITHUB_TOKEN`.

### 4. Vercel Docs Deployment

Not handled in GitHub Actions. Vercel GitHub integration auto-deploys:
- Push to main → production deployment
- PR → preview deployment
- Root Directory: `website`

Setup is done in Vercel dashboard, not in workflow files.

## Files to Create

```
.github/workflows/ci.yml
.github/workflows/release-please.yml
.github/workflows/publish.yml
release-please-config.json
.release-please-manifest.json
```

## Version Strategy

- Single version for the entire monorepo
- Conventional Commits drive version bumps:
  - `feat:` → minor bump
  - `fix:` → patch bump
  - `feat!:` or `BREAKING CHANGE:` → major bump
  - `chore:`, `docs:`, `test:` → no bump (included in next release)

## Not in Scope

- Kubernetes / Helm charts
- Multi-arch Docker builds (amd64 only for now)
- E2E tests in CI (run locally, not in pipeline)
- Secrets management beyond GITHUB_TOKEN
