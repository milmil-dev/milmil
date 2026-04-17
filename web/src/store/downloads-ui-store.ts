// web/src/store/downloads-ui-store.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface DownloadsUIState {
  expandedGroupIds: Set<string>;

  toggleGroup: (id: string) => void;
  expandAll: (ids: string[]) => void;
  collapseAll: () => void;
}

export const useDownloadsUIStore = create<DownloadsUIState>()(
  devtools(
    (set) => ({
      expandedGroupIds: new Set(),

      toggleGroup: (id) =>
        set(
          (state) => {
            const next = new Set(state.expandedGroupIds);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return { expandedGroupIds: next };
          },
          undefined,
          'toggleGroup'
        ),

      expandAll: (ids) =>
        set({ expandedGroupIds: new Set(ids) }, undefined, 'expandAll'),

      collapseAll: () =>
        set({ expandedGroupIds: new Set() }, undefined, 'collapseAll'),
    }),
    { name: 'downloads-ui-store' }
  )
);
