-- The resolver stored only Bangumi's name_cn (title / title_zh), so a series
-- matched from a romaji folder name ("BLEACH Sennen Kessen-hen") could not be
-- found by searching its Latin-script title. Keep the original-language name
-- alongside the Chinese one; existing rows are backfilled lazily by the
-- resolver the next time the series is looked up.
ALTER TABLE anime ADD COLUMN title_original TEXT;
