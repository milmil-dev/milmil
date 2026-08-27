import { describe, expect, it } from 'vite-plus/test';
import type { FranchiseEntry } from './api/discover';
import { groupSeasons } from './franchise';

function entry(anilist_id: number, season?: number, part?: number): FranchiseEntry {
  return {
    anilist_id,
    bangumi_id: anilist_id,
    title: `#${anilist_id}`,
    title_original: '',
    cover_image: '',
    episode_count: 12,
    score: 8,
    ...(season ? { season } : {}),
    ...(part ? { part } : {}),
  };
}

describe('groupSeasons', () => {
  it('folds split cours into one season pill', () => {
    const groups = groupSeasons([
      entry(1, 1, 1),
      entry(2, 1, 2),
      entry(3, 2, 1),
      entry(4, 2, 2),
      entry(5, 3),
    ]);
    expect(groups.map((g) => [g.season, g.parts.map((p) => p.anilist_id)])).toEqual([
      [1, [1, 2]],
      [2, [3, 4]],
      [3, [5]],
    ]);
  });

  it('gives every entry its own season when the API sends none', () => {
    const groups = groupSeasons([entry(1), entry(2), entry(3)]);
    expect(groups.map((g) => g.season)).toEqual([1, 2, 3]);
    expect(groups.every((g) => g.parts.length === 1)).toBe(true);
  });
});
