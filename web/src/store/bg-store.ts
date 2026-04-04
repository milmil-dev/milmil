import { create } from 'zustand';

interface BgState {
  image: string | null;
  position: 'top' | 'bottom';
  setImage: (url: string | null, position?: 'top' | 'bottom') => void;
}

export const useBgStore = create<BgState>()((set) => ({
  image: null,
  position: 'top',
  setImage: (url, position = 'top') => set({ image: url, position }),
}));
