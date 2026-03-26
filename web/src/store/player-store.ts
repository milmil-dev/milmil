// web/src/store/player-store.ts
import { create } from 'zustand';

interface PlayerState {
  danmakuEnabled: boolean;
  danmakuOpacity: number;
  danmakuFontSize: number;
  danmakuSpeed: number;
  toggleDanmaku: () => void;
  setDanmakuOpacity: (v: number) => void;
  setDanmakuFontSize: (v: number) => void;
  setDanmakuSpeed: (v: number) => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  danmakuEnabled: true,
  danmakuOpacity: 1,
  danmakuFontSize: 20,
  danmakuSpeed: 144,
  toggleDanmaku: () => set((s) => ({ danmakuEnabled: !s.danmakuEnabled })),
  setDanmakuOpacity: (v) => set({ danmakuOpacity: v }),
  setDanmakuFontSize: (v) => set({ danmakuFontSize: v }),
  setDanmakuSpeed: (v) => set({ danmakuSpeed: v }),
}));
