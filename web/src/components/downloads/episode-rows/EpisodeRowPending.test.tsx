// web/src/components/downloads/episode-rows/EpisodeRowPending.test.tsx

import userEvent from '@testing-library/user-event';
import { expect, test } from 'vite-plus/test';
import { render, screen } from '@/test/test-utils';
import { EpisodeRowPending } from './EpisodeRowPending';

test('shows next fetch text and refresh button', () => {
  render(<EpisodeRowPending nextFetchRelative="18 min" onRefresh={() => {}} />);
  expect(screen.getByText(/18 min/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
});

test('refresh click triggers handler', async () => {
  const user = userEvent.setup();
  let called = false;
  render(
    <EpisodeRowPending
      nextFetchRelative="18 min"
      onRefresh={() => {
        called = true;
      }}
    />
  );
  await user.click(screen.getByRole('button', { name: /refresh/i }));
  expect(called).toBe(true);
});
