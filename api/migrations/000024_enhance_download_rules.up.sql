ALTER TABLE download_rules ADD COLUMN resolution_filter TEXT NOT NULL DEFAULT '';
ALTER TABLE download_rules ADD COLUMN subgroup_filter TEXT NOT NULL DEFAULT '';
ALTER TABLE download_rules ADD COLUMN min_seeders INTEGER NOT NULL DEFAULT 0;
