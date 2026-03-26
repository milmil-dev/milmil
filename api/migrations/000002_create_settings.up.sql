CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

INSERT OR IGNORE INTO settings (key, value) VALUES
    ('general',    '{}'),
    ('dandanplay', '{}'),
    ('bangumi',    '{}'),
    ('anilist',    '{}'),
    ('mal',        '{}'),
    ('player',     '{"danmaku_enabled":true,"danmaku_opacity":80,"danmaku_font_size":20,"danmaku_speed":"normal","danmaku_max_density":50,"danmaku_show_scroll":true,"danmaku_show_top":true,"danmaku_show_bottom":true,"danmaku_include_ext":false,"danmaku_keyword_filters":[]}'),
    ('appearance', '{"locale":"zh-Hant","theme":"dark"}');
