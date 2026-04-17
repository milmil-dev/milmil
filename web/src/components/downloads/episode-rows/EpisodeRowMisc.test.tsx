// web/src/components/downloads/episode-rows/EpisodeRowMisc.test.tsx
import { expect, test } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { EpisodeRowMisc } from './EpisodeRowMisc';

test('renders filename and percent for active misc', () => {
  render(
    <EpisodeRowMisc
      gid="g"
      filename="[manual] foo.mkv"
      downloadedBytes={5e8}
      totalBytes={1e9}
      percent={50}
      status="active"
      onDelete={() => {}}
    />,
  );
  expect(screen.getByText('[manual] foo.mkv')).toBeInTheDocument();
  expect(screen.getByText('50%')).toBeInTheDocument();
});
