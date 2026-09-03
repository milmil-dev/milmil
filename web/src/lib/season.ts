import { msg } from '@lingui/core/macro';
import type { useLingui } from '@lingui/react';

export const SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL'] as const;
export type SeasonKey = (typeof SEASONS)[number];

/** 5 / 10 / 15 / 20 — the nostalgia offsets on Discover. */
export const MEMORY_OFFSETS = [5, 10, 15, 20] as const;
export type MemoryOffset = (typeof MEMORY_OFFSETS)[number];

type I18n = ReturnType<typeof useLingui>['i18n'];

export function seasonFromMonth(month: number): SeasonKey {
  if (month <= 3) return 'WINTER';
  if (month <= 6) return 'SPRING';
  if (month <= 9) return 'SUMMER';
  return 'FALL';
}

export function getCurrentSeason(now = new Date()): { season: SeasonKey; year: number } {
  return { season: seasonFromMonth(now.getMonth() + 1), year: now.getFullYear() };
}

export function getPreviousSeason(now = new Date()): { season: SeasonKey; year: number } {
  const { season, year } = getCurrentSeason(now);
  const idx = SEASONS.indexOf(season);
  if (idx <= 0) return { season: 'FALL', year: year - 1 };
  return { season: SEASONS[idx - 1] ?? 'FALL', year };
}

/** Same season, `yearsAgo` years back — "this season, ten years ago". */
export function seasonYearsAgo(
  yearsAgo: number,
  now = new Date()
): { season: SeasonKey; year: number } {
  const { season, year } = getCurrentSeason(now);
  return { season, year: year - yearsAgo };
}

export function seasonName(season: SeasonKey, i18n: I18n): string {
  switch (season) {
    case 'WINTER':
      return i18n._(msg`schedule.season.winter`);
    case 'SPRING':
      return i18n._(msg`schedule.season.spring`);
    case 'SUMMER':
      return i18n._(msg`schedule.season.summer`);
    case 'FALL':
      return i18n._(msg`schedule.season.fall`);
  }
}

/** "Fall 2024" — the airing season derived from an air date, localized. */
export function formatSeason(airDate: string | undefined, i18n: I18n): string | null {
  if (!airDate) return null;
  const d = new Date(airDate);
  if (Number.isNaN(d.getTime())) return null;
  return `${seasonName(seasonFromMonth(d.getMonth() + 1), i18n)} ${d.getFullYear()}`;
}
