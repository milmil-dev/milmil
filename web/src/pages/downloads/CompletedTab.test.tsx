// web/src/pages/downloads/CompletedTab.test.tsx
import { expect, test, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import CompletedTab from './CompletedTab';
import * as discoverModule from '@/lib/api/discover';

vi.spyOn(discoverModule.discoverApi, 'detail').mockResolvedValue({
  bangumi_id: 1, title: 'T', title_original: 'T', cover_image: '',
  episode_count: 12, score: 8, synopsis: '', tags: [], rating: { score: 0, total: 0 },
} as never);

test('renders one card per group with completed downloads', () => {
  const groups = [{
    rule_id: 'r1', rule_name: 'Done Anime', bangumi_id: 1,
    downloads: [
      { id: 'd1', gid: 'g1', name: 'Done Anime - 01.mkv', status: 'complete',
        total_bytes: 1e9, completed_bytes: 1e9, speed_bytes: 0, created_at: new Date().toISOString() },
    ],
    active_count: 0, complete_count: 1, total_count: 1,
  }] as never;
  render(<CompletedTab groups={groups} miscDownloads={[]} isLoading={false} />);
  expect(screen.getByText('Done Anime')).toBeInTheDocument();
});

test('skips groups without completed downloads', () => {
  const groups = [{
    rule_id: 'r1', rule_name: 'Active Only', bangumi_id: 1,
    downloads: [], active_count: 3, complete_count: 0, total_count: 3,
  }] as never;
  render(<CompletedTab groups={groups} miscDownloads={[]} isLoading={false} />);
  expect(screen.queryByText('Active Only')).toBeNull();
});
