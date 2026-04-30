import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useUpdateStore } from '../store/update-store';
import { useUpdateCheck } from './use-update-check';

const apiGet = vi.fn();
const updateCheckMock = vi.fn();
vi.mock('../lib/api-client', () => ({ api: { get: (...a: unknown[]) => apiGet(...a) } }));
vi.mock('../lib/api/system', () => ({
  systemApi: { updateCheck: (...a: unknown[]) => updateCheckMock(...a) },
}));

function wrapper({ children }: PropsWithChildren) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useUpdateCheck', () => {
  beforeEach(() => {
    apiGet.mockReset();
    updateCheckMock.mockReset();
    localStorage.clear();
    useUpdateStore.setState({
      latest: null,
      releaseUrl: null,
      publishedAt: null,
      dismissedVersion: null,
    });
  });
  afterEach(() => vi.clearAllMocks());

  test('hasUpdate true when latest > current and not dismissed', async () => {
    apiGet.mockResolvedValueOnce({ version: '0.1.7' });
    updateCheckMock.mockResolvedValueOnce({
      current: '0.1.7',
      latest: '0.1.8',
      has_update: true,
      release_url: 'https://x',
      published_at: '2026-04-30T00:00:00Z',
      stale: false,
    });

    const { result } = renderHook(() => useUpdateCheck(), { wrapper });
    await waitFor(() => expect(result.current.hasUpdate).toBe(true));
    expect(result.current.showBadge).toBe(true);
    expect(result.current.latest).toBe('0.1.8');
  });

  test('showBadge false when dismissedVersion === latest', async () => {
    apiGet.mockResolvedValueOnce({ version: '0.1.7' });
    updateCheckMock.mockResolvedValueOnce({
      current: '0.1.7',
      latest: '0.1.8',
      has_update: true,
      release_url: 'x',
      published_at: 'y',
      stale: false,
    });
    useUpdateStore.setState({ dismissedVersion: '0.1.8' });

    const { result } = renderHook(() => useUpdateCheck(), { wrapper });
    await waitFor(() => expect(result.current.hasUpdate).toBe(true));
    expect(result.current.showBadge).toBe(false);
  });

  test('hasUpdate false when latest equals current', async () => {
    apiGet.mockResolvedValueOnce({ version: '0.1.8' });
    updateCheckMock.mockResolvedValueOnce({
      current: '0.1.8',
      latest: '0.1.8',
      has_update: false,
      release_url: 'x',
      published_at: 'y',
      stale: false,
    });

    const { result } = renderHook(() => useUpdateCheck(), { wrapper });
    await waitFor(() => expect(result.current.latest).toBe('0.1.8'));
    expect(result.current.hasUpdate).toBe(false);
  });

  test('hasUpdate false when latest is null (silent on offline)', async () => {
    apiGet.mockResolvedValueOnce({ version: '0.1.8' });
    updateCheckMock.mockResolvedValueOnce({
      current: '0.1.8',
      latest: null,
      has_update: false,
      stale: false,
    });
    const { result } = renderHook(() => useUpdateCheck(), { wrapper });
    await waitFor(() => expect(result.current.current).toBe('0.1.8'));
    expect(result.current.hasUpdate).toBe(false);
    expect(result.current.showBadge).toBe(false);
  });
});
