import { expect, test } from 'vitest';
import type { DownloadGroup, DownloadRule, RSSFeed } from '@/lib/api/downloads';
import { deriveNextFetch } from './adapters';
import { deriveCardMode } from './adapters';

const baseRule: DownloadRule = {
  id: 'r', name: 'X', enabled: 1, rss_feed_id: 'f',
  filter_regex: '', exclude_regex: '', save_dir: '', episode_offset: 0,
  resolution_filter: '', subgroup_filter: '', min_seeders: 0,
  match_mode: 'fuzzy', episode_filter: 'all', episode_range: '',
  last_triggered_at: null, created_at: '', library_id: null, bangumi_id: null,
};

function group(downloads: { status: string }[]): DownloadGroup {
  return {
    rule_id: 'r', rule_name: 'X',
    downloads: downloads.map((d, i) => ({
      id: String(i), gid: String(i), name: `x - ${i}`,
      status: d.status, total_bytes: 100, completed_bytes: 50,
      speed_bytes: 0, created_at: '',
    })),
    active_count: downloads.filter((d) => d.status === 'active').length,
    complete_count: downloads.filter((d) => d.status === 'complete').length,
    total_count: downloads.length,
  };
}

test('downloading mode when any ep is active', () => {
  const g = group([{ status: 'complete' }, { status: 'active' }]);
  expect(deriveCardMode(g, baseRule)).toBe('downloading');
});

test('downloading mode when ep is paused or waiting', () => {
  expect(deriveCardMode(group([{ status: 'paused' }]), baseRule)).toBe('downloading');
  expect(deriveCardMode(group([{ status: 'waiting' }]), baseRule)).toBe('downloading');
});

test('completed mode when rule enabled but all eps already complete', () => {
  const g = group([{ status: 'complete' }]);
  expect(deriveCardMode(g, { ...baseRule, enabled: 1 })).toBe('completed');
});

test('subscribed mode when no group at all and rule enabled', () => {
  expect(deriveCardMode(undefined, baseRule)).toBe('subscribed');
});

test('subscribed mode when rule enabled, no active, and no complete yet', () => {
  expect(deriveCardMode(undefined, { ...baseRule, enabled: 1 })).toBe('subscribed');
  // Also explicit: empty group
  const g: DownloadGroup = { rule_id: 'r', rule_name: 'X', downloads: [], active_count: 0, complete_count: 0, total_count: 0 };
  expect(deriveCardMode(g, { ...baseRule, enabled: 1 })).toBe('subscribed');
});

test('completed mode when rule disabled, regardless of complete count', () => {
  const g = group([{ status: 'complete' }]);
  expect(deriveCardMode(g, { ...baseRule, enabled: 0 })).toBe('completed');
});

test('completed mode when rule disabled and no group', () => {
  expect(deriveCardMode(undefined, { ...baseRule, enabled: 0 })).toBe('completed');
});

import { deriveEpsForExpand, sortRulesBy, type LibraryItem } from './adapters';

test('deriveEpsForExpand in downloading mode: only active/paused/waiting, sorted by ETA asc', () => {
  const g = group([
    { status: 'active' },   // index 0
    { status: 'complete' }, // index 1 (skipped)
    { status: 'active' },   // index 2
  ]);
  // Fake ETAs by speed: ep0 full 100 left, speed 10 → eta 10; ep2 speed 2 → eta 50
  g.downloads[0].speed_bytes = 10;
  g.downloads[0].completed_bytes = 0;
  g.downloads[2].speed_bytes = 2;
  g.downloads[2].completed_bytes = 0;
  const eps = deriveEpsForExpand(g, 'downloading');
  expect(eps.map((d) => d.gid)).toEqual(['0', '2']);  // ep0 (eta 10) before ep2 (eta 50)
});

test('deriveEpsForExpand in completed mode: only complete, sorted by created_at desc', () => {
  const g = group([
    { status: 'complete' },
    { status: 'complete' },
    { status: 'active' },  // skipped
  ]);
  g.downloads[0].created_at = '2024-01-01T00:00:00Z';
  g.downloads[1].created_at = '2024-02-01T00:00:00Z';
  const eps = deriveEpsForExpand(g, 'completed');
  expect(eps.map((d) => d.gid)).toEqual(['1', '0']);  // feb before jan
});

test('deriveEpsForExpand in subscribed mode: always empty (expand shows pending row)', () => {
  const g = group([{ status: 'active' }, { status: 'complete' }]);
  expect(deriveEpsForExpand(g, 'subscribed')).toEqual([]);
});

test('sortRulesBy("name") sorts alphabetically', () => {
  const items: LibraryItem[] = [
    { rule: { ...baseRule, id: 'b', name: 'Bocchi' }, group: undefined, feed: undefined },
    { rule: { ...baseRule, id: 'a', name: 'Akudama' }, group: undefined, feed: undefined },
  ];
  const sorted = sortRulesBy(items, 'name');
  expect(sorted.map((i) => i.rule.id)).toEqual(['a', 'b']);
});

test('sortRulesBy("activity") puts active groups first, then by last_triggered_at desc', () => {
  const active = group([{ status: 'active' }]);
  const dormant = group([{ status: 'complete' }]);
  const items: LibraryItem[] = [
    { rule: { ...baseRule, id: 'dormant', name: 'D', last_triggered_at: '2024-01-01' }, group: dormant, feed: undefined },
    { rule: { ...baseRule, id: 'active', name: 'A', last_triggered_at: '2023-01-01' }, group: active, feed: undefined },
  ];
  const sorted = sortRulesBy(items, 'activity');
  expect(sorted.map((i) => i.rule.id)).toEqual(['active', 'dormant']);
});

test('sortRulesBy("progress") sorts by group percent descending', () => {
  const g100 = group([{ status: 'complete' }]);
  g100.downloads[0].completed_bytes = g100.downloads[0].total_bytes;
  const g50 = group([{ status: 'active' }]);
  const items: LibraryItem[] = [
    { rule: { ...baseRule, id: 'half' }, group: g50, feed: undefined },
    { rule: { ...baseRule, id: 'done' }, group: g100, feed: undefined },
  ];
  const sorted = sortRulesBy(items, 'progress');
  expect(sorted.map((i) => i.rule.id)).toEqual(['done', 'half']);
});

test('sortRulesBy("created") sorts by rule.created_at desc', () => {
  const items: LibraryItem[] = [
    { rule: { ...baseRule, id: 'older', created_at: '2023-01-01' }, group: undefined, feed: undefined },
    { rule: { ...baseRule, id: 'newer', created_at: '2024-06-01' }, group: undefined, feed: undefined },
  ];
  const sorted = sortRulesBy(items, 'created');
  expect(sorted.map((i) => i.rule.id)).toEqual(['newer', 'older']);
});

test('deriveNextFetch returns undefined when last_fetched_at is unparseable', () => {
  const feed: RSSFeed = {
    id: 'f', name: 'F', url: '', type: 'mikan',
    enabled: 1, fetch_interval_minutes: 30,
    last_fetched_at: 'not-a-date', created_at: '',
  };
  expect(deriveNextFetch(feed)).toBeUndefined();
});

test('deriveNextFetch returns undefined when fetch_interval_minutes is missing', () => {
  const feed = {
    id: 'f', name: 'F', url: '', type: 'mikan',
    enabled: 1, fetch_interval_minutes: undefined as unknown as number,
    last_fetched_at: '2024-01-01T00:00:00Z', created_at: '',
  } as RSSFeed;
  expect(deriveNextFetch(feed)).toBeUndefined();
});
