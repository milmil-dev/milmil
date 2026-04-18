// web/src/components/downloads/AnimeDownloadCardSkeleton.test.tsx
import { expect, test } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { AnimeDownloadCardSkeleton } from './AnimeDownloadCardSkeleton';

test('renders placeholder blocks', () => {
  render(<AnimeDownloadCardSkeleton />);
  expect(screen.getByTestId('skeleton-cover')).toBeInTheDocument();
  expect(screen.getByTestId('skeleton-title')).toBeInTheDocument();
});
