import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { useUpdateStore } from './update-store';

const STORAGE_KEY = 'milmil-update';

describe('useUpdateStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useUpdateStore.setState({
      latest: null,
      releaseUrl: null,
      publishedAt: null,
      dismissedVersion: null,
    });
  });
  afterEach(() => {
    localStorage.clear();
  });

  test('setLatest updates the in-memory fields', () => {
    useUpdateStore.getState().setLatest({
      latest: '0.1.8',
      releaseUrl: 'https://x',
      publishedAt: '2026-04-30T00:00:00Z',
    });
    const s = useUpdateStore.getState();
    expect(s.latest).toBe('0.1.8');
    expect(s.releaseUrl).toBe('https://x');
    expect(s.publishedAt).toBe('2026-04-30T00:00:00Z');
  });

  test('dismiss persists dismissedVersion to localStorage under milmil-update', () => {
    useUpdateStore.getState().dismiss('0.1.8');
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    expect(persisted.state.dismissedVersion).toBe('0.1.8');
  });

  test('only dismissedVersion is persisted (latest is NOT)', () => {
    useUpdateStore.getState().setLatest({
      latest: '0.1.8',
      releaseUrl: 'x',
      publishedAt: 'y',
    });
    useUpdateStore.getState().dismiss('0.1.8');
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    expect(persisted.state.latest).toBeUndefined();
    expect(persisted.state.releaseUrl).toBeUndefined();
    expect(persisted.state.publishedAt).toBeUndefined();
    expect(persisted.state.dismissedVersion).toBe('0.1.8');
  });
});
