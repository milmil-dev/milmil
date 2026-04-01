ALTER TABLE download_rules ADD COLUMN library_id TEXT REFERENCES libraries(id) ON DELETE SET NULL;
ALTER TABLE download_rules ADD COLUMN bangumi_id INTEGER;
ALTER TABLE downloads ADD COLUMN bangumi_id INTEGER;
ALTER TABLE downloads ADD COLUMN library_id TEXT REFERENCES libraries(id) ON DELETE SET NULL;
