# Security Policy

## Supported Versions

milmil is in active development. Security fixes are applied to the latest release on `main`.

| Version | Supported          |
| ------- | ------------------ |
| latest  | :white_check_mark: |
| older   | :x:                |

## Reporting a Vulnerability

**Please do NOT open a public GitHub issue for security vulnerabilities.**

Report vulnerabilities privately via one of the following channels:

1. **GitHub Security Advisory** (preferred) —
   [Open a private report](https://github.com/milmil-dev/milmil/security/advisories/new).
2. **Email** — `milmil.dev@proton.me`

Please include:

- A description of the vulnerability and its impact
- Steps to reproduce, or a proof-of-concept
- The version / commit you tested against
- Any suggested mitigation, if known

### What to expect

- **Acknowledgement** within 72 hours.
- **Assessment + initial response** within 7 days, including whether the report
  is accepted, requires more information, or is out of scope.
- **Coordinated disclosure** — once a fix is ready and released, we'll publish
  a GitHub Security Advisory crediting the reporter (unless anonymity is
  requested).

### Scope

In scope:

- Authentication / authorization bypass (JWT, 2FA, OAuth flows)
- Server-side credential leakage (encryption-at-rest for storage credentials,
  OAuth tokens, etc.)
- Path traversal in scanner / file serving
- Server-side request forgery in metadata fetchers / RSS / torrent search
- Stored or reflected XSS in the web UI
- SQL injection in any API endpoint

Out of scope:

- Findings against a fork or modified version we do not maintain
- Vulnerabilities requiring physical access to the host machine
- Issues in third-party services we integrate with (Bangumi, AniList, TMDB,
  DandanPlay, rclone backends) — please report those upstream
- Self-XSS or social engineering of legitimate users

## Hardening Recommendations for Operators

- Always set `JWT_SECRET` and `MILMIL_ENCRYPTION_KEY` to unique, random
  32+ character values. Never reuse the example values from
  `api/.env.example`.
- Run milmil behind a reverse proxy with TLS (Caddy, nginx, Traefik).
- Restrict the torrent listen port (`TORRENT_LISTEN_PORT`, default 42069)
  to expected peers — do not expose the API port (8080) directly to the
  internet without authentication.
- Keep PostgreSQL / Redis bound to the docker network, not 0.0.0.0.
- Rotate `JWT_SECRET` when granting / revoking long-lived API tokens.
