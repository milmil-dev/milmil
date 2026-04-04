import { create } from 'zustand';

interface BgState {
  image: string | null;
  position: 'top' | 'bottom';
  dimMode: 'scroll-down' | 'scroll-up';
  setImage: (url: string | null, opts?: { position?: 'top' | 'bottom'; dimMode?: 'scroll-down' | 'scroll-up' }) => void;
}

export const useBgStore = create<BgState>()((set) => ({
  image: null,
  position: 'top',
  dimMode: 'scroll-down',
  setImage: (url, opts) => set({
    image: url,
    position: opts?.position ?? 'top',
    dimMode: opts?.dimMode ?? 'scroll-down',
  }),
}));
