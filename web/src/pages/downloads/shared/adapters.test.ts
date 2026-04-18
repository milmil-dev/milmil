import { expect, test } from 'vitest';
import type { DownloadGroup, DownloadRule } from '@/lib/api/downloads';
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

test('subscribed mode when rule enabled and no active eps', () => {
  const g = group([{ status: 'complete' }]);
  expect(deriveCardMode(g, { ...baseRule, enabled: 1 })).toBe('subscribed');
});

test('subscribed mode when no group at all and rule enabled', () => {
  expect(deriveCardMode(undefined, baseRule)).toBe('subscribed');
});

test('completed mode when rule disabled, regardless of complete count', () => {
  const g = group([{ status: 'complete' }]);
  expect(deriveCardMode(g, { ...baseRule, enabled: 0 })).toBe('completed');
});

test('completed mode when rule disabled and no group', () => {
  expect(deriveCardMode(undefined, { ...baseRule, enabled: 0 })).toBe('completed');
});
