import { createFileRoute } from '@tanstack/react-router';
import { lazy } from 'react';

const DownloadsPage = lazy(() =>
  import('../pages/DownloadsPage').then((m) => ({ default: m.DownloadsPage }))
);

export interface DownloadsSearch {
  tab?: 'search' | 'subscriptions' | 'downloading' | 'completed';
  anime?: string;
}

export const Route = createFileRoute('/downloads')({
  component: DownloadsPage,
  validateSearch: (search: Record<string, unknown>): DownloadsSearch => {
    const validTabs = ['search', 'subscriptions', 'downloading', 'completed'];
    const tab = typeof search.tab === 'string' && validTabs.includes(search.tab)
      ? (search.tab as DownloadsSearch['tab'])
      : undefined;
    return {
      tab,
      anime: typeof search.anime === 'string' ? search.anime : undefined,
    };
  },
});
