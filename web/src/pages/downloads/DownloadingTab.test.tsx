// web/src/pages/downloads/DownloadingTab.test.tsx
import { expect, test, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import DownloadingTab from './DownloadingTab';
import * as discoverModule from '@/lib/api/discover';

vi.spyOn(discoverModule.discoverApi, 'detail').mockResolvedValue({
  bangumi_id: 1, title: 'Test', title_original: 'T', cover_image: '',
  episode_count: 12, score: 8, synopsis: '', tags: [], rating: { score: 0, total: 0 },
} as never);

test('renders one card per active group', () => {
  const groups = [{
    rule_id: 'r1', rule_name: 'Test Anime', bangumi_id: 1,
    downloads: [
      { id: 'd1', gid: 'g1', name: 'Test Anime - 01.mkv', status: 'active',
        total_bytes: 1e9, completed_bytes: 5e8, speed_bytes: 1e6, created_at: '' },
    ],
    active_count: 1, complete_count: 0, total_count: 1,
  }] as never;
  render(<DownloadingTab groups={groups} miscDownloads={[]} isLoading={false} />);
  expect(screen.getByText('Test Anime')).toBeInTheDocument();
});

test('skips groups with zero active', () => {
  const groups = [{
    rule_id: 'r1', rule_name: 'All done', bangumi_id: 1,
    downloads: [], active_count: 0, complete_count: 5, total_count: 5,
  }] as never;
  render(<DownloadingTab groups={groups} miscDownloads={[]} isLoading={false} />);
  expect(screen.queryByText('All done')).toBeNull();
});
