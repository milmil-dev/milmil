import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

export type WeekStartDay = 'sunday' | 'monday' | 'saturday';
export type ScheduleCardSize = 'small' | 'medium' | 'large';

interface UIState {
  sidebarVisible: boolean;
  weekStartDay: WeekStartDay;
  scheduleCardSize: ScheduleCardSize;

  toggleSidebar: () => void;
  setSidebarVisible: (visible: boolean) => void;
  setWeekStartDay: (day: WeekStartDay) => void;
  setScheduleCardSize: (size: ScheduleCardSize) => void;
}

export const useUIStore = create<UIState>()(
  devtools(
    persist(
      (set) => ({
        sidebarVisible: true,
        weekStartDay: 'monday' as WeekStartDay,
        scheduleCardSize: 'medium' as ScheduleCardSize,

        toggleSidebar: () =>
          set((state) => ({ sidebarVisible: !state.sidebarVisible }), undefined, 'toggleSidebar'),

        setSidebarVisible: (visible) =>
          set({ sidebarVisible: visible }, undefined, 'setSidebarVisible'),

        setWeekStartDay: (day) => set({ weekStartDay: day }, undefined, 'setWeekStartDay'),

        setScheduleCardSize: (size) =>
          set({ scheduleCardSize: size }, undefined, 'setScheduleCardSize'),
      }),
      {
        name: 'milmil-ui',
        partialize: (state) => ({
          weekStartDay: state.weekStartDay,
          scheduleCardSize: state.scheduleCardSize,
        }),
      }
    ),
    {
      name: 'ui-store',
    }
  )
);
