import { create } from 'zustand';

interface BgState {
  image: string | null;
  setImage: (url: string | null) => void;
}

export const useBgStore = create<BgState>()((set) => ({
  image: null,
  setImage: (url) => set({ image: url }),
}));
