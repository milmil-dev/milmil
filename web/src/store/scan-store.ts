import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface ScanProgress {
  libraryId: string;
  libraryName: string;
  phase: 'scanning' | 'hashing' | 'matching' | 'completed' | 'error';
  filesFound: number;
  filesHashed: number;
  filesMatched: number;
  filesTotal: number;
  currentFile: string;
  error?: string;
}

interface ScanStore {
  scans: Record<string, ScanProgress>;
  handleEvent: (event: { type: string; data: Record<string, unknown> }) => void;
  isScanning: (libraryId: string) => boolean;
  getProgress: (libraryId: string) => ScanProgress | null;
  clearCompleted: () => void;
}

const createInitialProgress = (libraryId: string, libraryName: string): ScanProgress => ({
  libraryId,
  libraryName,
  phase: 'scanning',
  filesFound: 0,
  filesHashed: 0,
  filesMatched: 0,
  filesTotal: 0,
  currentFile: '',
});

function getStringField(data: Record<string, unknown>, camelKey: string, snakeKey: string) {
  return (data[camelKey] as string | undefined) ?? (data[snakeKey] as string | undefined);
}

function getNumberField(data: Record<string, unknown>, camelKey: string, snakeKey: string) {
  return (data[camelKey] as number | undefined) ?? (data[snakeKey] as number | undefined);
}

export const useScanStore = create<ScanStore>()(
  devtools(
    (set, get) => ({
      scans: {},

      handleEvent: (event) => {
        const { type, data } = event;
        const libraryId = getStringField(data, 'libraryId', 'library_id');
        if (!libraryId) return;

        switch (type) {
          case 'scan:started': {
            set(
              (state) => ({
                scans: {
                  ...state.scans,
                  [libraryId]: createInitialProgress(
                    libraryId,
                    getStringField(data, 'libraryName', 'library_name') ?? ''
                  ),
                },
              }),
              false,
              'scan/started'
            );
            break;
          }
          case 'scan:progress': {
            set(
              (state) => {
                const existing = state.scans[libraryId];
                if (!existing) return state;
                return {
                  scans: {
                    ...state.scans,
                    [libraryId]: {
                      ...existing,
                      filesFound:
                        getNumberField(data, 'filesFound', 'files_found') ?? existing.filesFound,
                      currentFile:
                        getStringField(data, 'currentFile', 'current_file') ?? existing.currentFile,
                    },
                  },
                };
              },
              false,
              'scan/progress'
            );
            break;
          }
          case 'scan:hash': {
            set(
              (state) => {
                const existing = state.scans[libraryId];
                if (!existing) return state;
                return {
                  scans: {
                    ...state.scans,
                    [libraryId]: {
                      ...existing,
                      phase: 'hashing',
                      filesHashed:
                        getNumberField(data, 'filesHashed', 'files_hashed') ?? existing.filesHashed,
                      filesTotal:
                        getNumberField(data, 'filesTotal', 'files_total') ?? existing.filesTotal,
                      currentFile:
                        getStringField(data, 'currentFile', 'current_file') ?? existing.currentFile,
                    },
                  },
                };
              },
              false,
              'scan/hash'
            );
            break;
          }
          case 'match:progress': {
            set(
              (state) => {
                const existing = state.scans[libraryId];
                if (!existing) return state;
                return {
                  scans: {
                    ...state.scans,
                    [libraryId]: {
                      ...existing,
                      phase: 'matching',
                      filesMatched:
                        getNumberField(data, 'filesMatched', 'files_matched') ??
                        existing.filesMatched,
                      filesTotal:
                        getNumberField(data, 'filesTotal', 'files_total') ?? existing.filesTotal,
                      currentFile:
                        getStringField(data, 'currentFile', 'current_file') ?? existing.currentFile,
                    },
                  },
                };
              },
              false,
              'scan/matchProgress'
            );
            break;
          }
          case 'match:started': {
            set(
              (state) => ({
                scans: {
                  ...state.scans,
                  [libraryId]: {
                    ...(state.scans[libraryId] ?? createInitialProgress(
                      libraryId,
                      getStringField(data, 'libraryName', 'library_name') ?? ''
                    )),
                    phase: 'matching',
                  },
                },
              }),
              false,
              'match/started'
            );
            break;
          }
          case 'match:completed': {
            set(
              (state) => {
                const existing = state.scans[libraryId];
                if (!existing) return state;
                return {
                  scans: {
                    ...state.scans,
                    [libraryId]: {
                      ...existing,
                      phase: 'completed',
                      currentFile: '',
                    },
                  },
                };
              },
              false,
              'match/completed'
            );
            break;
          }
          case 'scan:completed': {
            set(
              (state) => {
                const existing = state.scans[libraryId];
                if (!existing) return state;
                return {
                  scans: {
                    ...state.scans,
                    [libraryId]: {
                      ...existing,
                      phase: 'completed',
                      currentFile: '',
                    },
                  },
                };
              },
              false,
              'scan/completed'
            );
            break;
          }
          case 'scan:error': {
            set(
              (state) => {
                const existing = state.scans[libraryId];
                if (!existing) return state;
                return {
                  scans: {
                    ...state.scans,
                    [libraryId]: {
                      ...existing,
                      phase: 'error',
                      error: getStringField(data, 'error', 'error') ?? 'Unknown error',
                      currentFile: '',
                    },
                  },
                };
              },
              false,
              'scan/error'
            );
            break;
          }
        }
      },

      isScanning: (libraryId) => {
        const scan = get().scans[libraryId];
        return scan != null && scan.phase !== 'completed' && scan.phase !== 'error';
      },

      getProgress: (libraryId) => {
        return get().scans[libraryId] ?? null;
      },

      clearCompleted: () => {
        set(
          (state) => {
            const scans: Record<string, ScanProgress> = {};
            for (const [id, scan] of Object.entries(state.scans)) {
              if (scan.phase !== 'completed') {
                scans[id] = scan;
              }
            }
            return { scans };
          },
          false,
          'scan/clearCompleted'
        );
      },
    }),
    { name: 'scan' }
  )
);
