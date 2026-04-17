// web/src/pages/downloads/SubscribedTab.test.tsx
import { expect, test, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import SubscribedTab from './SubscribedTab';
import * as discoverModule from '@/lib/api/discover';

vi.spyOn(discoverModule.discoverApi, 'detail').mockResolvedValue({
  bangumi_id: 1,
  title: 'Test Anime',
  title_original: 'T',
  cover_image: 'https://example/c.jpg',
  episode_count: 12,
  score: 8,
  synopsis: '',
  tags: [],
  rating: { score: 0, total: 0 },
} as never);

test('renders AnimeDownloadCard per rule', () => {
  const rules = [{
    id: 'r1', name: 'Test Anime', enabled: 1, rss_feed_id: 'f1',
    filter_regex: '', exclude_regex: '', save_dir: '', episode_offset: 0,
    resolution_filter: '', subgroup_filter: '', min_seeders: 0,
    match_mode: 'fuzzy', episode_filter: 'all', episode_range: '',
    last_triggered_at: null, created_at: '', library_id: null, bangumi_id: 1,
  }] as never;

  render(<SubscribedTab rules={rules} feeds={[]} groups={[]} isLoading={false} onSwitchToSearch={() => {}} />);
  expect(screen.getByText('Test Anime')).toBeInTheDocument();
});
