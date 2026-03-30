import { createFileRoute } from '@tanstack/react-router';
import { lazy } from 'react';

const WatchPage = lazy(() => import('../pages/WatchPage').then((m) => ({ default: m.WatchPage })));

type WatchSearch = {
  episodeId?: string;
};

export const Route = createFileRoute('/watch/$fileId')({
  component: WatchPage,
  validateSearch: (search: Record<string, unknown>): WatchSearch => ({
    episodeId: typeof search.episodeId === 'string' ? search.episodeId : undefined,
  }),
});
