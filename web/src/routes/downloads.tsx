import { createFileRoute } from '@tanstack/react-router';
import { lazy } from 'react';

const DownloadsPage = lazy(() =>
  import('../pages/DownloadsPage').then((m) => ({ default: m.DownloadsPage }))
);

export interface DownloadsSearch {
  tab?: 'search' | 'manage';
  anime?: string;
}

export const Route = createFileRoute('/downloads')({
  component: DownloadsPage,
  validateSearch: (search: Record<string, unknown>): DownloadsSearch => ({
    tab: search.tab === 'manage' ? 'manage' : search.tab === 'search' ? 'search' : undefined,
    anime: typeof search.anime === 'string' ? search.anime : undefined,
  }),
});
