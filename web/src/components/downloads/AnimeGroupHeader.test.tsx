// web/src/components/downloads/AnimeGroupHeader.test.tsx
import { expect, test } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/test-utils';
import { AnimeGroupHeader } from './AnimeGroupHeader';

const baseProps = {
  coverUrl: undefined,
  title: '尖帽子的魔法工房',
  subChips: ['沸班亞馬製作組', 'AI2160p'],
  stats: {
    mode: 'downloading' as const,
    percent: 72,
    speedBytes: 9_000_000,
    downloadedBytes: 4_300_000_000,
    totalBytes: 6_100_000_000,
    etaSeconds: 240,
    activeCount: 3,
    live: true,
  },
  expanded: false,
  onToggle: () => {},
};

test('renders title, chips, and percent', () => {
  render(<AnimeGroupHeader {...baseProps} />);
  expect(screen.getByText('尖帽子的魔法工房')).toBeInTheDocument();
  expect(screen.getByText('沸班亞馬製作組')).toBeInTheDocument();
  expect(screen.getByText('AI2160p')).toBeInTheDocument();
  expect(screen.getByText('72')).toBeInTheDocument();
});

test('shows live dot when live=true', () => {
  render(<AnimeGroupHeader {...baseProps} />);
  expect(screen.getByTestId('live-dot')).toBeInTheDocument();
});

test('hides live dot when live=false', () => {
  render(<AnimeGroupHeader {...baseProps} stats={{ ...baseProps.stats, live: false }} />);
  expect(screen.queryByTestId('live-dot')).toBeNull();
});

test('clicking toggle button calls onToggle', async () => {
  const user = userEvent.setup();
  let clicked = false;
  render(<AnimeGroupHeader {...baseProps} onToggle={() => { clicked = true; }} />);
  await user.click(screen.getByRole('button', { name: /expand|collapse/i }));
  expect(clicked).toBe(true);
});

test('progress bar width reflects percent', () => {
  render(<AnimeGroupHeader {...baseProps} />);
  const fill = screen.getByTestId('progress-fill');
  expect(fill.style.width).toBe('72%');
});
