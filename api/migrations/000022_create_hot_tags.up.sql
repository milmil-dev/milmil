CREATE TABLE IF NOT EXISTS hot_tags (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    category   TEXT NOT NULL DEFAULT 'general',
    count      INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_hot_tags_category ON hot_tags(category);
CREATE INDEX IF NOT EXISTS idx_hot_tags_count    ON hot_tags(count DESC);

-- Seed popular Bangumi anime tags
INSERT OR IGNORE INTO hot_tags (name, category, count) VALUES
-- Theme / Setting
('原創', 'theme', 100),
('漫畫改編', 'source', 95),
('小說改編', 'source', 90),
('遊戲改編', 'source', 80),
('輕小說改編', 'source', 85),
-- Mood / Tone
('日常', 'mood', 90),
('搞笑', 'mood', 88),
('治癒', 'mood', 85),
('催淚', 'mood', 70),
('致鬱', 'mood', 60),
('熱血', 'mood', 82),
('勵志', 'mood', 65),
-- Genre
('戀愛', 'genre', 88),
('後宮', 'genre', 75),
('百合', 'genre', 72),
('耽美', 'genre', 60),
('戰鬥', 'genre', 85),
('冒險', 'genre', 80),
('推理', 'genre', 70),
('懸疑', 'genre', 68),
('恐怖', 'genre', 55),
('科幻', 'genre', 75),
('奇幻', 'genre', 78),
('機戰', 'genre', 60),
('魔法', 'genre', 72),
('運動', 'genre', 55),
('音樂', 'genre', 50),
('偶像', 'genre', 52),
('美食', 'genre', 45),
-- Setting
('異世界', 'setting', 85),
('穿越', 'setting', 70),
('轉生', 'setting', 78),
('校園', 'setting', 82),
('青春', 'setting', 80),
('職場', 'setting', 40),
('歷史', 'setting', 50),
('軍事', 'setting', 42),
('宇宙', 'setting', 45),
-- Style
('黑暗', 'style', 55),
('群像劇', 'style', 50),
('社會派', 'style', 40),
('賽博朋克', 'style', 35),
-- Studio
('JUMP系', 'studio', 60),
('芳文社', 'studio', 55),
('京都動畫', 'studio', 65),
('ufotable', 'studio', 62),
('MAPPA', 'studio', 58),
('WIT STUDIO', 'studio', 50),
('A-1 Pictures', 'studio', 52),
('CloverWorks', 'studio', 48),
('BONES', 'studio', 50),
('TRIGGER', 'studio', 48),
('PA WORKS', 'studio', 45),
('SHAFT', 'studio', 42),
('MADHOUSE', 'studio', 50),
-- Activity
('旅行', 'activity', 35),
('釣魚', 'activity', 25),
('露營', 'activity', 30),
('料理', 'activity', 35),
-- Misc
('龍傲天', 'misc', 50),
('女性向', 'misc', 45),
('子供向', 'misc', 30),
('深夜動畫', 'misc', 55),
('劇場版', 'misc', 40),
('短篇', 'misc', 35),
('續篇', 'misc', 45),
('聲優', 'misc', 30);
