# milmil — AI Agent Usage Guide

This guide is for AI agents (Claude Code, Cursor, Codex, OpenClaw, Hermes,
Aider, etc.) controlling a running milmil server via the `milmil` CLI.

## Pre-flight

1. Confirm `milmil` is on `$PATH`: `command -v milmil` should print a path.
2. Confirm authenticated: `milmil auth status` should print `Logged in
   as ...`. If not, ask the user to generate a token in their milmil web
   UI (Settings → API Tokens → Create) and paste it into
   `milmil auth login`.
3. Default output is human-readable. Pass `--json` for machine-parsable
   output. Always use `--json` when piping into `jq` or another agent.
4. `--dry-run` is honoured by `match undo`. Other commands accept it
   without error but it is currently a no-op for them.

## What is and isn't in v0.1

The CLI ships in two layers. v0.1 is the **direct-call** layer — every
subcommand maps to one server endpoint. v0.2 will add **macro endpoints**
that wrap multi-step orchestration (autonomous match, subscribe, etc.)
under a single audit-log parent so undo is one call.

**Available now (v0.1):**
- `auth` (login, status, logout)
- `library` (list, add, scan, stats)
- `search anime`
- `episode` (list, watch-url)
- `watch resolve`
- `match` (auto, list, apply, undo)
- `audit` (list, show)
- `token` (list, revoke)
- `version`, `agents-guide`, `generate-skill`

**Coming in v0.2:**
- `match auto --confidence-floor` (currently warns + ignored)
- `match suggest`
- `subscribe` namespace (add, list, undo) — for now, use the web UI's
  plan-to-watch + RSS rule editor.

## Recipe 1 — Fix unmatched files

User says: "fix unmatched files in my library".

```bash
milmil library list --json | jq -r '.[].id'
# Pick the right library id from the output, then:
milmil match list --library <id> --status unmatched --json
# Show the count to the user. If they want to proceed:
milmil match auto --library <id> --yes
# Show the {matched, unmatched, errors, by_*} summary. If anything looks
# wrong, undo the run (this reverses every match.apply audit entry in
# the window):
milmil match undo --since 5m --dry-run     # preview
milmil match undo --since 5m --yes         # commit
```

NOTE: `--confidence-floor` is not honoured in v0.1. The server's existing
matcher uses internal acceptance thresholds. If you need a strict floor,
inspect `milmil audit list --action match.apply --since 5m --json`,
score the entries client-side, and selectively undo with `--id`.

## Recipe 2 — Watch tonight

User says: "I want to watch <title> episode 5".

```bash
milmil watch resolve "<title>" --episode 5
# Prints two URLs: the web watch page and a direct stream URL. Tell the
# user to open the watch URL in their browser, OR pass the stream URL
# straight to mpv / vlc / Infuse.
```

If the top match has no Bangumi ID the command errors out — pick another
search hit or wait for v0.2's local-only watch-resolve macro.

## Recipe 3 — Undo a manual mistake

User says: "I matched the wrong file last week, can you fix it?"

```bash
milmil audit list --action match.apply --since 7d
# Find the offending entry, then:
milmil audit show <audit_id>
# Confirm with the user, then undo:
milmil match undo --id <audit_id> --yes
```

## Common pitfalls

- `match undo --since 5m` reverses ALL `match.apply` entries in that
  window — including ones from the web UI or other agents. Use
  `--id <audit_id>` for surgical undo.
- Bangumi / AniList sync requires the user's OAuth tokens to still be
  valid. If a sync action is reported `failed: dep not configured` in
  the undo output, the relevant tracker reverter just isn't wired in
  v0.1 — point the user at the v0.2 milestone.
- The CLI uses your milmil API token, not your password. Tokens show up
  in `milmil token list` with the name you gave them; revoke a stale one
  with `milmil token revoke <name>`.
- `milmil token revoke` refuses to remove the token currently used by
  this CLI session. Run `milmil auth login` with a different token first
  if you really need to revoke this one.

## Permissions and audit

Every authenticated mutating request from any client (CLI, web UI,
direct API call) writes one row to the audit log:

```bash
milmil audit list --since 1h --json
milmil audit show <audit_id>
```

Filters: `--action match.apply`, `--action api_token.create`, etc. The
action_type follows `<resource>.<verb>` where verb is one of
`create|update|delete`.

If something looks wrong, undo it:

```bash
milmil match undo --id <audit_id> --dry-run    # preview
milmil match undo --id <audit_id> --yes        # commit
```

## When you're stuck

If a command returns an unexpected error, retry with `--json` to get the
structured response shape. Show that JSON to the user verbatim — don't
paraphrase server errors. The server's audit_log is the source of truth
for "what just happened" and survives client crashes.

## Generating a per-platform skill file

```bash
milmil generate-skill --format claude     # → markdown skill body
milmil generate-skill --format cursor     # → .cursorrules content
milmil generate-skill --format agents-md  # → AGENTS.md section
```

Each output is a 3-5 line shim that redirects the agent to run
`milmil agents-guide` to load this file. Pipe it into the conventional
location for your tool.
