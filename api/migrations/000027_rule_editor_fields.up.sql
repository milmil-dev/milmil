ALTER TABLE download_rules ADD COLUMN match_mode TEXT NOT NULL DEFAULT 'fuzzy';
ALTER TABLE download_rules ADD COLUMN episode_filter TEXT NOT NULL DEFAULT 'all';
ALTER TABLE download_rules ADD COLUMN episode_range TEXT NOT NULL DEFAULT '';
