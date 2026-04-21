import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

export type WeekStartDay = 'sunday' | 'monday' | 'saturday';

interface UIState {
  sidebarVisible: boolean;
  weekStartDay: WeekStartDay;

  toggleSidebar: () => void;
  setSidebarVisible: (visible: boolean) => void;
  setWeekStartDay: (day: WeekStartDay) => void;
}

export const useUIStore = create<UIState>()(
  devtools(
    persist(
      (set) => ({
        sidebarVisible: true,
        weekStartDay: 'monday' as WeekStartDay,

        toggleSidebar: () =>
          set((state) => ({ sidebarVisible: !state.sidebarVisible }), undefined, 'toggleSidebar'),

        setSidebarVisible: (visible) =>
          set({ sidebarVisible: visible }, undefined, 'setSidebarVisible'),

        setWeekStartDay: (day) => set({ weekStartDay: day }, undefined, 'setWeekStartDay'),
      }),
      {
        name: 'milmil-ui',
        partialize: (state) => ({
          weekStartDay: state.weekStartDay,
        }),
      }
    ),
    {
      name: 'ui-store',
    }
  )
);
