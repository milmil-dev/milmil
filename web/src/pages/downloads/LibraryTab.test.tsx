// web/src/pages/downloads/LibraryTab.test.tsx
import { expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/test-utils';
import LibraryTab from './LibraryTab';
import * as discoverModule from '@/lib/api/discover';

vi.spyOn(discoverModule.discoverApi, 'detail').mockResolvedValue({
  bangumi_id: 1, title: 'T', title_original: 'T', cover_image: '',
  episode_count: 12, score: 8, synopsis: '', tags: [], rating: { score: 0, total: 0 },
} as never);

const baseRule = {
  id: 'r', name: 'Test', enabled: 1, rss_feed_id: 'f',
  filter_regex: '', exclude_regex: '', save_dir: '', episode_offset: 0,
  resolution_filter: '', subgroup_filter: '', min_seeders: 0,
  match_mode: 'fuzzy', episode_filter: 'all', episode_range: '',
  last_triggered_at: null, created_at: '', library_id: null, bangumi_id: 1,
};

test('renders one card per rule', () => {
  const rules = [
    { ...baseRule, id: 'a', name: 'Alpha' },
    { ...baseRule, id: 'b', name: 'Bravo' },
  ] as never;
  render(<LibraryTab rules={rules} feeds={[]} groups={[]} miscDownloads={[]} isLoading={false} onSwitchToSearch={() => {}} />);
  expect(screen.getByText('Alpha')).toBeInTheDocument();
  expect(screen.getByText('Bravo')).toBeInTheDocument();
});

test('empty state when no rules and no misc downloads', () => {
  render(<LibraryTab rules={[]} feeds={[]} groups={[]} miscDownloads={[]} isLoading={false} onSwitchToSearch={() => {}} />);
  expect(screen.getByText(/noRulesHint|no subscriptions|未有訂閱|去搜尋/i)).toBeInTheDocument();
});

test('search input filters cards by rule name', async () => {
  const user = userEvent.setup();
  const rules = [
    { ...baseRule, id: 'a', name: 'Alpha' },
    { ...baseRule, id: 'b', name: 'Bravo' },
  ] as never;
  render(<LibraryTab rules={rules} feeds={[]} groups={[]} miscDownloads={[]} isLoading={false} onSwitchToSearch={() => {}} />);
  const input = document.querySelector('input[type="text"]')!;
  await user.type(input, 'alph');
  expect(screen.getByText('Alpha')).toBeInTheDocument();
  expect(screen.queryByText('Bravo')).toBeNull();
});

test('shows skeleton when loading', () => {
  render(<LibraryTab rules={[]} feeds={[]} groups={[]} miscDownloads={[]} isLoading={true} onSwitchToSearch={() => {}} />);
  const skeletons = document.querySelectorAll('[data-testid="skeleton-cover"]');
  expect(skeletons.length).toBeGreaterThan(0);
});
