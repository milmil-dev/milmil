CREATE TABLE IF NOT EXISTS audit_log (
  id              TEXT PRIMARY KEY,                      -- short slug (8-char hex)
  user_id         TEXT NOT NULL,
  token_id        TEXT,                                  -- nullable: web UI / password auth
  agent_label     TEXT,                                  -- denormalised token name, survives revoke
  action_type     TEXT NOT NULL,                         -- 'match.apply', 'subscribe.add', etc.
  target_type     TEXT,                                  -- 'file', 'anime', 'rss_rule', 'download'
  target_id       TEXT,
  before_json     TEXT,                                  -- JSON snapshot
  after_json      TEXT,                                  -- JSON snapshot
  confidence      REAL,                                  -- 0.0-1.0, NULL if not autonomous
  parent_id       TEXT,                                  -- self-FK for macro children
  dry_run         INTEGER NOT NULL DEFAULT 0,
  undone_at       TEXT,                                  -- timestamp string when undone
  undone_by       TEXT,                                  -- audit_log.id of the reversing entry
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES audit_log(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_created ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action_type ON audit_log(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_parent ON audit_log(parent_id);
