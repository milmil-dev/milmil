import type { FranchiseEntry } from './api/discover';

export interface SeasonGroup {
  season: number;
  parts: FranchiseEntry[];
}

/**
 * Group a franchise's main series into S1/S2/… pills. The API stamps each
 * entry with `season` and folds split cours (無職転生 第2クール, 死滅回游
 * 後編) into the entry before them; consecutive entries with the same season
 * become one group. Servers that predate the field give every entry its own
 * season, which reproduces the old one-pill-per-entry behaviour.
 */
export function groupSeasons(entries: FranchiseEntry[]): SeasonGroup[] {
  const hasSeasons = entries.some((e) => (e.season ?? 0) > 0);
  const groups: SeasonGroup[] = [];
  entries.forEach((entry, idx) => {
    const last = groups[groups.length - 1];
    const season = hasSeasons ? (entry.season ?? (last ? last.season + 1 : 1)) : idx + 1;
    if (last && last.season === season) {
      last.parts.push(entry);
    } else {
      groups.push({ season, parts: [entry] });
    }
  });
  return groups;
}
