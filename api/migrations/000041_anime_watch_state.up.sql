-- Records that a user has finished a series, so "rewatching" can be told apart
-- from "watching for the first time".
--
-- Without this the two are indistinguishable: an episode with progress but not
-- yet complete looks the same whether it is the next episode of a first watch
-- or the first episode of a rewatch. DeriveStatus previously guessed from
-- timestamps and got it wrong for every ordinary watch-through.
CREATE TABLE IF NOT EXISTS anime_watch_state (
    user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    anime_id          TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
    times_completed   INTEGER NOT NULL DEFAULT 0,
    -- The newest completed-episode timestamp at the moment the series last
    -- became whole. Completion is re-counted only when this moves forward,
    -- which keeps the increment idempotent across repeated saves.
    last_completed_at TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (user_id, anime_id)
);
