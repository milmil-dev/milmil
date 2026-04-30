# Container Password Reset Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a local/container-only admin password reset command and surface that recovery path in the login/setup UI.

**Architecture:** The recovery command lives in the server binary because the Docker image only ships `/app/milmil-api`. It reads `DATABASE_URL`, opens the database directly, hashes the new password with the existing auth package, and updates the selected user's password hash without exposing a public reset API.

**Tech Stack:** Go 1.26, Cobra, `database/sql`, existing `internal/db`, `internal/store`, `internal/auth`; React, Lingui, TanStack Form for UI copy.

---

### Task 1: Add Password Reset Command Tests

**Files:**
- Create: `api/cmd/server/admin_test.go`
- Modify later: `api/cmd/server/admin.go`

**Step 1: Write failing tests**

Add tests in `api/cmd/server/admin_test.go` that:
- Create a temporary SQLite database.
- Create one user with an old password hash.
- Run the reset command against that DB with `DATABASE_URL=sqlite://<tmpdb>`.
- Assert the old password no longer works and the new password works.
- Assert weak passwords are rejected.
- Assert unknown usernames produce a clear error.

**Step 2: Run tests to verify RED**

Run:

```bash
cd api && go test ./cmd/server -run TestAdminResetPassword -v
```

Expected: FAIL because `newAdminCommand` or the reset command does not exist.

### Task 2: Implement Server Binary Admin Command

**Files:**
- Create: `api/cmd/server/admin.go`
- Modify: `api/cmd/server/main.go`

**Step 1: Implement command structure**

Create a Cobra root command around the existing server startup:
- Default `milmil-api` behavior still starts the server.
- `milmil-api admin reset-password` runs the admin utility and exits.

**Step 2: Implement reset behavior**

Support:
- `--username <name>` required.
- `--password-stdin` reads the new password from stdin.
- `--password-env <ENV_NAME>` reads the new password from an environment variable.

Reject:
- Missing username.
- Missing or multiple password sources.
- Empty password.
- Passwords rejected by `auth.CheckPasswordStrength`.
- Missing/invalid `DATABASE_URL`.
- Unknown username.

Update:
- Lookup by username with `store.GetUserByUsername`.
- Hash with `auth.HashPassword`.
- Persist with `store.UpdatePasswordHash`.
- Print a short success message without echoing the password.

**Step 3: Run tests to verify GREEN**

Run:

```bash
cd api && go test ./cmd/server -run TestAdminResetPassword -v
```

Expected: PASS.

### Task 3: Include Recovery Copy in UI

**Files:**
- Modify: `web/src/pages/LoginPage.tsx`
- Modify: `web/src/pages/setup/AdminStep.tsx`
- Modify: locale PO files as needed

**Step 1: Add copy**

On initialized login mode, add a subtle "Forgot password?" disclosure/dialog that explains:
- milmil does not support email reset.
- In Docker, run the container command.
- The command must be run by someone with server/container access.

On first-run admin setup, add a compact warning that losing this password requires container/database access to reset.

**Step 2: Run frontend checks**

Run:

```bash
cd web && npm run check
```

or the repository's available TypeScript/lint command from `web/package.json`.

Expected: PASS.

### Task 4: Final Verification

**Files:**
- No new files.

Run:

```bash
cd api && go test ./cmd/server ./internal/auth ./internal/db
cd api && go build ./cmd/server
cd web && npm run check
```

Expected: all pass.
