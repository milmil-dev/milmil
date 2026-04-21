import { createFileRoute } from '@tanstack/react-router';
import type { HistoryFilter } from '../lib/api/history';
import { HistoryPage } from '../pages/HistoryPage';

interface HistorySearch {
  filter?: HistoryFilter;
  q?: string;
}

export const Route = createFileRoute('/history')({
  component: HistoryPage,
  validateSearch: (search: Record<string, unknown>): HistorySearch => {
    const f = search.filter;
    const filter = f === 'all' || f === 'in_progress' || f === 'completed' ? f : undefined;
    const q = typeof search.q === 'string' ? search.q : undefined;
    return { filter, q };
  },
});
