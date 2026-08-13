import { afterEach, beforeEach, describe, expect, test } from 'vite-plus/test';
import { useTablePrefsStore } from './table-prefs-store';

const STORAGE_KEY = 'milmil-table-prefs';

describe('useTablePrefsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useTablePrefsStore.setState({ columnWidths: {} });
  });
  afterEach(() => {
    localStorage.clear();
  });

  test('setColumnWidth writes the width', () => {
    useTablePrefsStore.getState().setColumnWidth('t1', 'filename', 720);
    expect(useTablePrefsStore.getState().columnWidths.t1?.filename).toBe(720);
  });

  test('setColumnWidth overrides existing width on the same (tableId, columnId)', () => {
    const s = useTablePrefsStore.getState();
    s.setColumnWidth('t1', 'filename', 720);
    s.setColumnWidth('t1', 'filename', 800);
    expect(useTablePrefsStore.getState().columnWidths.t1?.filename).toBe(800);
  });

  test('setColumnWidth on different tableIds stays isolated', () => {
    const s = useTablePrefsStore.getState();
    s.setColumnWidth('t1', 'filename', 720);
    s.setColumnWidth('t2', 'filename', 400);
    expect(useTablePrefsStore.getState().columnWidths.t1?.filename).toBe(720);
    expect(useTablePrefsStore.getState().columnWidths.t2?.filename).toBe(400);
  });

  test('resetColumn removes the key (column drops back to default)', () => {
    const s = useTablePrefsStore.getState();
    s.setColumnWidth('t1', 'filename', 720);
    s.setColumnWidth('t1', 'matched', 280);
    s.resetColumn('t1', 'filename');
    expect(useTablePrefsStore.getState().columnWidths.t1?.filename).toBeUndefined();
    expect(useTablePrefsStore.getState().columnWidths.t1?.matched).toBe(280);
  });

  test('resetColumn on a non-existent column is a no-op', () => {
    expect(() => useTablePrefsStore.getState().resetColumn('missing', 'nope')).not.toThrow();
    expect(useTablePrefsStore.getState().columnWidths).toEqual({});
  });

  test('resetTable clears all columns for that table only', () => {
    const s = useTablePrefsStore.getState();
    s.setColumnWidth('t1', 'a', 1);
    s.setColumnWidth('t1', 'b', 2);
    s.setColumnWidth('t2', 'a', 3);
    s.resetTable('t1');
    expect(useTablePrefsStore.getState().columnWidths.t1).toBeUndefined();
    expect(useTablePrefsStore.getState().columnWidths.t2?.a).toBe(3);
  });

  test('persist writes to localStorage under milmil-table-prefs', () => {
    useTablePrefsStore.getState().setColumnWidth('t1', 'filename', 720);
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    expect(persisted.state.columnWidths.t1.filename).toBe(720);
  });
});
