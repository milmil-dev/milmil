/**
 * AniList genre ids (what `/discover/browse?genre=` expects) — the one list
 * behind Discover's chip row and Search's quick-filters. Mirrors the macOS
 * client's `Genre.allCases` order.
 */
export const GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Fantasy',
  'Mystery',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Supernatural',
  'Thriller',
  'Horror',
  'Sports',
  'Music',
  'Mecha',
  'Mahou Shoujo',
  'Ecchi',
];

const NICHE_GENRES = new Set(['Mecha', 'Mahou Shoujo', 'Ecchi']);

/** Pool for Discover's random genre spotlight — the niche/NSFW tail excluded. */
export const SPOTLIGHT_GENRES = GENRES.filter((g) => !NICHE_GENRES.has(g));
