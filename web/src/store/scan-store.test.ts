import { afterEach, expect, test } from 'vitest';
import { useScanStore } from './scan-store';

afterEach(() => {
  useScanStore.setState({ scans: {} });
});

test('scan events parse snake_case payload fields correctly', () => {
  useScanStore.getState().handleEvent({
    type: 'scan:started',
    data: { library_id: 'lib-1', library_name: 'Library One' },
  });

  expect(useScanStore.getState().isScanning('lib-1')).toBe(true);

  const started = useScanStore.getState().getProgress('lib-1');
  expect(started).toEqual(
    expect.objectContaining({
      libraryId: 'lib-1',
      libraryName: 'Library One',
      phase: 'scanning',
    })
  );

  useScanStore.getState().handleEvent({
    type: 'scan:progress',
    data: { library_id: 'lib-1', files_found: 10, current_file: 'episode1.mkv' },
  });
  expect(useScanStore.getState().getProgress('lib-1')?.filesFound).toBe(10);
  expect(useScanStore.getState().getProgress('lib-1')?.currentFile).toBe('episode1.mkv');

  useScanStore.getState().handleEvent({
    type: 'scan:hash',
    data: { library_id: 'lib-1', files_hashed: 3, files_total: 10, current_file: 'episode2.mkv' },
  });
  expect(useScanStore.getState().getProgress('lib-1')?.phase).toBe('hashing');
  expect(useScanStore.getState().getProgress('lib-1')?.filesHashed).toBe(3);
  expect(useScanStore.getState().getProgress('lib-1')?.filesTotal).toBe(10);

  useScanStore.getState().handleEvent({
    type: 'scan:completed',
    data: { library_id: 'lib-1' },
  });
  expect(useScanStore.getState().isScanning('lib-1')).toBe(false);
});
