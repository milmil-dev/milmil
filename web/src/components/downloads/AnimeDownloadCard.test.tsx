// web/src/components/downloads/AnimeDownloadCard.test.tsx
import { expect, test } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { AnimeDownloadCard } from './AnimeDownloadCard';

const baseProps = {
  coverUrl: undefined,
  title: 'Test Anime',
  subChips: ['Group'],
  stats: {
    mode: 'downloading' as const,
    percent: 50,
    speedBytes: 1_000_000,
    downloadedBytes: 5e8,
    totalBytes: 1e9,
    etaSeconds: 60,
    activeCount: 1,
    live: true,
  },
  expanded: true,
  onToggle: () => {},
};

test('renders children when expanded', () => {
  render(
    <AnimeDownloadCard {...baseProps}>
      <div data-testid="ep-row">EP 01</div>
    </AnimeDownloadCard>
  );
  expect(screen.getByTestId('ep-row')).toBeInTheDocument();
});

test('hides children when collapsed', () => {
  render(
    <AnimeDownloadCard {...baseProps} expanded={false}>
      <div data-testid="ep-row">EP 01</div>
    </AnimeDownloadCard>
  );
  expect(screen.queryByTestId('ep-row')).toBeNull();
});

test('renders hairline divider between header and list when expanded', () => {
  render(
    <AnimeDownloadCard {...baseProps}>
      <div>ep</div>
    </AnimeDownloadCard>
  );
  expect(screen.getByTestId('card-divider')).toBeInTheDocument();
});
