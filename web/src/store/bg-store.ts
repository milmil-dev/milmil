import { create } from 'zustand';

interface BgState {
  image: string | null;
  position: 'top' | 'bottom';
  dimMode: 'scroll-down' | 'scroll-up';
  /**
   * What sits on top of the banner. `artwork` (default) is literal-white text
   * that needs the image darkened in both themes; `page` is theme `ink` text,
   * so the light theme washes the image out instead of darkening it.
   */
  tone: 'artwork' | 'page';
  setImage: (
    url: string | null,
    opts?: {
      position?: 'top' | 'bottom';
      dimMode?: 'scroll-down' | 'scroll-up';
      tone?: 'artwork' | 'page';
    }
  ) => void;
}

export const useBgStore = create<BgState>()((set) => ({
  image: null,
  position: 'top',
  dimMode: 'scroll-down',
  tone: 'artwork',
  setImage: (url, opts) =>
    set({
      image: url,
      position: opts?.position ?? 'top',
      dimMode: opts?.dimMode ?? 'scroll-down',
      tone: opts?.tone ?? 'artwork',
    }),
}));
