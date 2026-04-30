import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface TablePrefsState {
  // { 'library-detail-files': { filename: 720, matched: 280 }, ... }
  columnWidths: Record<string, Record<string, number>>;

  setColumnWidth: (tableId: string, columnId: string, width: number) => void;
  resetColumn: (tableId: string, columnId: string) => void;
  resetTable: (tableId: string) => void;
}

export const useTablePrefsStore = create<TablePrefsState>()(
  devtools(
    persist(
      (set) => ({
        columnWidths: {},

        setColumnWidth: (tableId, columnId, width) =>
          set(
            (state) => ({
              columnWidths: {
                ...state.columnWidths,
                [tableId]: { ...state.columnWidths[tableId], [columnId]: width },
              },
            }),
            undefined,
            'setColumnWidth'
          ),

        resetColumn: (tableId, columnId) =>
          set(
            (state) => {
              const tableWidths = state.columnWidths[tableId];
              if (!tableWidths || !(columnId in tableWidths)) {
                return state;
              }
              const next = { ...tableWidths };
              delete next[columnId];
              return {
                columnWidths: { ...state.columnWidths, [tableId]: next },
              };
            },
            undefined,
            'resetColumn'
          ),

        resetTable: (tableId) =>
          set(
            (state) => {
              const next = { ...state.columnWidths };
              delete next[tableId];
              return { columnWidths: next };
            },
            undefined,
            'resetTable'
          ),
      }),
      {
        name: 'milmil-table-prefs',
        partialize: (state) => ({ columnWidths: state.columnWidths }),
      }
    ),
    { name: 'table-prefs-store' }
  )
);
