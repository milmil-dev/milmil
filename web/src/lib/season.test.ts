import { describe, expect, it } from 'vite-plus/test';
import { getCurrentSeason, getPreviousSeason, seasonFromMonth, seasonYearsAgo } from './season';

describe('seasonFromMonth', () => {
  it('maps calendar months onto AniList seasons', () => {
    expect(seasonFromMonth(1)).toBe('WINTER');
    expect(seasonFromMonth(3)).toBe('WINTER');
    expect(seasonFromMonth(4)).toBe('SPRING');
    expect(seasonFromMonth(6)).toBe('SPRING');
    expect(seasonFromMonth(7)).toBe('SUMMER');
    expect(seasonFromMonth(9)).toBe('SUMMER');
    expect(seasonFromMonth(10)).toBe('FALL');
    expect(seasonFromMonth(12)).toBe('FALL');
  });
});

describe('getCurrentSeason', () => {
  it('returns summer for early September', () => {
    expect(getCurrentSeason(new Date(2026, 8, 1))).toEqual({ season: 'SUMMER', year: 2026 });
  });

  it('returns fall for October', () => {
    expect(getCurrentSeason(new Date(2026, 9, 15))).toEqual({ season: 'FALL', year: 2026 });
  });

  it('returns winter for January', () => {
    expect(getCurrentSeason(new Date(2026, 0, 10))).toEqual({ season: 'WINTER', year: 2026 });
  });
});

describe('getPreviousSeason', () => {
  it('steps back within the same year', () => {
    expect(getPreviousSeason(new Date(2026, 8, 1))).toEqual({ season: 'SPRING', year: 2026 });
  });

  it('wraps winter to the previous fall', () => {
    expect(getPreviousSeason(new Date(2026, 1, 1))).toEqual({ season: 'FALL', year: 2025 });
  });
});

describe('seasonYearsAgo', () => {
  const now = new Date(2026, 8, 1);

  it('rewinds the same season by 5 / 10 / 15 / 20 years', () => {
    expect(seasonYearsAgo(5, now)).toEqual({ season: 'SUMMER', year: 2021 });
    expect(seasonYearsAgo(10, now)).toEqual({ season: 'SUMMER', year: 2016 });
    expect(seasonYearsAgo(15, now)).toEqual({ season: 'SUMMER', year: 2011 });
    expect(seasonYearsAgo(20, now)).toEqual({ season: 'SUMMER', year: 2006 });
  });
});
