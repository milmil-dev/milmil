// web/src/components/downloads/episode-rows/EpisodeRowComplete.test.tsx
import { expect, test } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/test-utils';
import { EpisodeRowComplete } from './EpisodeRowComplete';

const base = {
  gid: 'g1',
  episodeLabel: 'EP 01',
  filename: 'Show - 01.mkv',
  sizeBytes: 2_000_000_000,
  completedAtRelative: '2h ago',
  onPlay: () => {},
  onDelete: () => {},
};

test('renders episode label, filename, size, completed time', () => {
  render(<EpisodeRowComplete {...base} />);
  expect(screen.getByText('EP 01')).toBeInTheDocument();
  expect(screen.getByText('Show - 01.mkv')).toBeInTheDocument();
  expect(screen.getByText(/2.0 GB/)).toBeInTheDocument();
  expect(screen.getByText(/2h ago/)).toBeInTheDocument();
});

test('play button triggers onPlay', async () => {
  const user = userEvent.setup();
  let called = false;
  render(<EpisodeRowComplete {...base} onPlay={() => { called = true; }} />);
  await user.click(screen.getByRole('button', { name: /play/i }));
  expect(called).toBe(true);
});
