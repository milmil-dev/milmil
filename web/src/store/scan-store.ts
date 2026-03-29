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

const createInitialProgress = (
  libraryId: string,
  libraryName: string,
): ScanProgress => ({
  libraryId,
  libraryName,
  phase: 'scanning',
  filesFound: 0,
  filesHashed: 0,
  filesMatched: 0,
  filesTotal: 0,
  currentFile: '',
});

export const useScanStore = create<ScanStore>()(
  devtools(
    (set, get) => ({
      scans: {},

      handleEvent: (event) => {
        const { type, data } = event;
        const libraryId = data.libraryId as string;

        switch (type) {
          case 'scan:started': {
            set(
              (state) => ({
                scans: {
                  ...state.scans,
                  [libraryId]: createInitialProgress(
                    libraryId,
                    (data.libraryName as string) ?? '',
                  ),
                },
              }),
              false,
              'scan/started',
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
                      filesFound: (data.filesFound as number) ?? existing.filesFound,
                      currentFile: (data.currentFile as string) ?? existing.currentFile,
                    },
                  },
                };
              },
              false,
              'scan/progress',
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
                      filesHashed: (data.filesHashed as number) ?? existing.filesHashed,
                      filesTotal: (data.filesTotal as number) ?? existing.filesTotal,
                      currentFile: (data.currentFile as string) ?? existing.currentFile,
                    },
                  },
                };
              },
              false,
              'scan/hash',
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
                      filesMatched: (data.filesMatched as number) ?? existing.filesMatched,
                      filesTotal: (data.filesTotal as number) ?? existing.filesTotal,
                      currentFile: (data.currentFile as string) ?? existing.currentFile,
                    },
                  },
                };
              },
              false,
              'scan/matchProgress',
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
              'scan/completed',
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
                      error: (data.error as string) ?? 'Unknown error',
                      currentFile: '',
                    },
                  },
                };
              },
              false,
              'scan/error',
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
          'scan/clearCompleted',
        );
      },
    }),
    { name: 'scan' },
  ),
);
