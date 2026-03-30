import { createFileRoute } from '@tanstack/react-router';
import { lazy } from 'react';

const WatchPage = lazy(() => import('../pages/WatchPage').then((m) => ({ default: m.WatchPage })));

type WatchSearch = {
  ep?: number;
};

export const Route = createFileRoute('/watch/$animeId')({
  component: WatchPage,
  validateSearch: (search: Record<string, unknown>): WatchSearch => ({
    ep: typeof search.ep === 'number' ? search.ep : typeof search.ep === 'string' ? parseInt(search.ep, 10) || undefined : undefined,
  }),
});
