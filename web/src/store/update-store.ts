import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UpdateState {
  latest: string | null;
  releaseUrl: string | null;
  publishedAt: string | null;
  dismissedVersion: string | null;
  // releaseUrl/publishedAt are nullable so AboutPanel's `?? '#'` fallback
  // actually fires when those payload fields are missing — `??` does not
  // short-circuit on empty string.
  setLatest: (info: {
    latest: string;
    releaseUrl: string | null;
    publishedAt: string | null;
  }) => void;
  dismiss: (version: string) => void;
}

export const useUpdateStore = create<UpdateState>()(
  persist(
    (set) => ({
      latest: null,
      releaseUrl: null,
      publishedAt: null,
      dismissedVersion: null,
      setLatest: (info) =>
        set({
          latest: info.latest,
          releaseUrl: info.releaseUrl,
          publishedAt: info.publishedAt,
        }),
      dismiss: (version) => set({ dismissedVersion: version }),
    }),
    {
      name: 'milmil-update',
      partialize: (s) => ({ dismissedVersion: s.dismissedVersion }),
    }
  )
);
