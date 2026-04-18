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

test('exposes data-testid="anime-download-card"', () => {
  render(
    <AnimeDownloadCard {...baseProps}>
      <div>ep</div>
    </AnimeDownloadCard>
  );
  expect(screen.getByTestId('anime-download-card')).toBeInTheDocument();
});

test('virtualizes episode list when children exceed threshold', () => {
  const many = Array.from({ length: 50 }, (_, i) => <div key={i}>ep-{i}</div>);
  render(
    <AnimeDownloadCard {...baseProps}>
      {many}
    </AnimeDownloadCard>
  );
  // Virtual scroll container is present
  expect(screen.getByTestId('episode-virtual-list')).toBeInTheDocument();
  // Rendered DOM has fewer rows than the full 50 (virtualized)
  const rows = document.querySelectorAll('[data-index]');
  expect(rows.length).toBeLessThan(50);
});

test('does not virtualize when children are under threshold', () => {
  const few = Array.from({ length: 5 }, (_, i) => <div key={i}>ep-{i}</div>);
  render(
    <AnimeDownloadCard {...baseProps}>
      {few}
    </AnimeDownloadCard>
  );
  expect(screen.queryByTestId('episode-virtual-list')).toBeNull();
});
