import { beforeEach, describe, expect, test } from 'vite-plus/test';
import { useUIStore } from './ui-store';

const STORAGE_KEY = 'milmil-ui';

describe('useUIStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.setState({ sidebarVisible: true, weekStartDay: 'monday' });
  });

  test('defaults schedule cards to medium density', () => {
    expect((useUIStore.getState() as any).scheduleCardSize).toBe('medium');
  });

  test('setScheduleCardSize updates schedule card density', () => {
    (useUIStore.getState() as any).setScheduleCardSize('large');

    expect((useUIStore.getState() as any).scheduleCardSize).toBe('large');
  });

  test('persists schedule card density with other UI preferences', () => {
    (useUIStore.getState() as any).setScheduleCardSize('small');

    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    expect(persisted.state.scheduleCardSize).toBe('small');
  });
});
