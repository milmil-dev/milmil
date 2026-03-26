import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface UIState {
  sidebarVisible: boolean;

  toggleSidebar: () => void;
  setSidebarVisible: (visible: boolean) => void;
}

export const useUIStore = create<UIState>()(
  devtools(
    (set) => ({
      sidebarVisible: true,

      toggleSidebar: () =>
        set((state) => ({ sidebarVisible: !state.sidebarVisible }), undefined, 'toggleSidebar'),

      setSidebarVisible: (visible) =>
        set({ sidebarVisible: visible }, undefined, 'setSidebarVisible'),
    }),
    {
      name: 'ui-store',
    }
  )
);
