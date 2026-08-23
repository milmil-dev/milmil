// web/src/components/downloads/episode-rows/EpisodeRowActive.test.tsx
import { expect, test } from 'vite-plus/test';
import { render, screen } from '@/test/test-utils';
import { EpisodeRowActive } from './EpisodeRowActive';

const base = {
  gid: 'gid1',
  episodeLabel: 'EP 02',
  downloadedBytes: 1_500_000_000,
  totalBytes: 2_200_000_000,
  speedBytes: 1_900_000,
  etaSeconds: 360,
  percent: 71,
  status: 'active' as const,
  onPause: () => {},
  onResume: () => {},
  onDelete: () => {},
};

test('renders episode label and percent', () => {
  render(<EpisodeRowActive {...base} />);
  expect(screen.getByText('EP 02')).toBeInTheDocument();
  expect(screen.getByText('71%')).toBeInTheDocument();
});

test('progress bar fill width matches percent', () => {
  render(<EpisodeRowActive {...base} />);
  const fill = screen.getByTestId('ep-bar-fill');
  expect(fill.style.width).toBe('71%');
});

test('shows pause button when active', () => {
  render(<EpisodeRowActive {...base} />);
  expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /resume/i })).toBeNull();
});

test('shows resume button when paused', () => {
  render(<EpisodeRowActive {...base} status="paused" />);
  expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^pause$/i })).toBeNull();
});
