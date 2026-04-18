// web/src/hooks/use-anime-cover.test.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import * as discoverModule from '@/lib/api/discover';
import { useAnimeCover } from './use-anime-cover';

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

afterEach(() => vi.restoreAllMocks());

test('returns cover_image when bangumi_id present', async () => {
  vi.spyOn(discoverModule.discoverApi, 'detail').mockResolvedValue({
    bangumi_id: 123,
    title: 'x',
    title_original: 'x',
    cover_image: 'https://example.com/cover.jpg',
    episode_count: 12,
    score: 8,
    synopsis: '',
    tags: [],
    rating: { score: 8, total: 100 },
  } as never);

  const { result } = renderHook(() => useAnimeCover(123), { wrapper });
  await waitFor(() => expect(result.current.coverUrl).toBe('https://example.com/cover.jpg'));
});

test('returns undefined cover when bangumi_id is null', () => {
  const { result } = renderHook(() => useAnimeCover(null), { wrapper });
  expect(result.current.coverUrl).toBeUndefined();
  expect(result.current.isLoading).toBe(false);
});
