/**
 * Genre translation map — API returns English genre strings,
 * this maps them to Chinese for display.
 */
const GENRE_ZH_HANT: Record<string, string> = {
  Action: '動作',
  Adventure: '冒險',
  Comedy: '喜劇',
  Drama: '劇情',
  Fantasy: '奇幻',
  Horror: '恐怖',
  Mystery: '懸疑',
  Psychological: '心理',
  Romance: '戀愛',
  'Sci-Fi': '科幻',
  'Slice of Life': '日常',
  Supernatural: '超自然',
  Thriller: '驚悚',
  Sports: '運動',
  Music: '音樂',
  Mecha: '機甲',
  Ecchi: 'Ecchi',
  'Mahou Shoujo': '魔法少女',
  Historical: '歷史',
  Military: '軍事',
  Harem: '後宮',
};

const GENRE_ZH_HANS: Record<string, string> = {
  Action: '动作',
  Adventure: '冒险',
  Comedy: '喜剧',
  Drama: '剧情',
  Fantasy: '奇幻',
  Horror: '恐怖',
  Mystery: '悬疑',
  Psychological: '心理',
  Romance: '恋爱',
  'Sci-Fi': '科幻',
  'Slice of Life': '日常',
  Supernatural: '超自然',
  Thriller: '惊悚',
  Sports: '运动',
  Music: '音乐',
  Mecha: '机甲',
  Ecchi: 'Ecchi',
  'Mahou Shoujo': '魔法少女',
  Historical: '历史',
  Military: '军事',
  Harem: '后宫',
};

const GENRE_JA: Record<string, string> = {
  Action: 'アクション',
  Adventure: '冒険',
  Comedy: 'コメディ',
  Drama: 'ドラマ',
  Fantasy: 'ファンタジー',
  Horror: 'ホラー',
  Mystery: 'ミステリー',
  Psychological: '心理',
  Romance: '恋愛',
  'Sci-Fi': 'SF',
  'Slice of Life': '日常',
  Supernatural: '超自然',
  Thriller: 'スリラー',
  Sports: 'スポーツ',
  Music: '音楽',
  Mecha: 'メカ',
  Ecchi: 'エッチ',
  'Mahou Shoujo': '魔法少女',
  Historical: '歴史',
  Military: '軍事',
  Harem: 'ハーレム',
};

const GENRE_KO: Record<string, string> = {
  Action: '액션',
  Adventure: '모험',
  Comedy: '코미디',
  Drama: '드라마',
  Fantasy: '판타지',
  Horror: '호러',
  Mystery: '미스터리',
  Psychological: '심리',
  Romance: '로맨스',
  'Sci-Fi': 'SF',
  'Slice of Life': '일상',
  Supernatural: '초자연',
  Thriller: '스릴러',
  Sports: '스포츠',
  Music: '음악',
  Mecha: '메카',
  Ecchi: 'Ecchi',
  'Mahou Shoujo': '마법소녀',
  Historical: '역사',
  Military: '군사',
  Harem: '하렘',
};

const MAPS: Record<string, Record<string, string>> = {
  'zh-Hant': GENRE_ZH_HANT,
  'zh-Hans': GENRE_ZH_HANS,
  'zh-TW': GENRE_ZH_HANT,
  'zh-HK': GENRE_ZH_HANT,
  'zh-CN': GENRE_ZH_HANS,
  ja: GENRE_JA,
  ko: GENRE_KO,
};

/** Translate a genre string based on the current locale. Falls back to the original English string. */
export function translateGenre(genre: string, locale: string): string {
  return MAPS[locale]?.[genre] ?? genre;
}
