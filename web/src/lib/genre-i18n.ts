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
  Historical: '历史',
  Military: '军事',
  Harem: '后宫',
};

const MAPS: Record<string, Record<string, string>> = {
  'zh-Hant': GENRE_ZH_HANT,
  'zh-Hans': GENRE_ZH_HANS,
};

/** Translate a genre string based on the current locale. Falls back to the original English string. */
export function translateGenre(genre: string, locale: string): string {
  return MAPS[locale]?.[genre] ?? genre;
}

/** Translate an array of genres. */
export function translateGenres(genres: string[], locale: string): string[] {
  return genres.map((g) => translateGenre(g, locale));
}
