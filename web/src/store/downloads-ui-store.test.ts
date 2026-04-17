// web/src/store/downloads-ui-store.test.ts
import { afterEach, expect, test } from 'vitest';
import { useDownloadsUIStore } from './downloads-ui-store';

afterEach(() => {
  useDownloadsUIStore.setState({ expandedGroupIds: new Set() });
});

test('toggleGroup adds then removes the id', () => {
  const { toggleGroup } = useDownloadsUIStore.getState();
  toggleGroup('rule-1');
  expect(useDownloadsUIStore.getState().expandedGroupIds.has('rule-1')).toBe(true);
  toggleGroup('rule-1');
  expect(useDownloadsUIStore.getState().expandedGroupIds.has('rule-1')).toBe(false);
});

test('expandAll replaces the set', () => {
  const { expandAll } = useDownloadsUIStore.getState();
  expandAll(['a', 'b']);
  const set = useDownloadsUIStore.getState().expandedGroupIds;
  expect(set.has('a')).toBe(true);
  expect(set.has('b')).toBe(true);
  expect(set.size).toBe(2);
});

test('collapseAll clears the set', () => {
  useDownloadsUIStore.getState().expandAll(['x']);
  useDownloadsUIStore.getState().collapseAll();
  expect(useDownloadsUIStore.getState().expandedGroupIds.size).toBe(0);
});
